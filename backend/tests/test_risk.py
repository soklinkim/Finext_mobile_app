"""Future risk: the distress model score and the debt capacity (over-indebtedness) check."""
from datetime import datetime

import pytest

from app import risk
from app.business_time import BUSINESS_TZ
from tests.test_settlement import entry
from tests.test_worked_sample import CASH, ledger, on

THROUGH = datetime(2026, 1, 1, tzinfo=BUSINESS_TZ)
LOAN_TERMS = {"lender": "ABA", "lenderType": "bank_mfi", "termMonths": 12, "annualInterestRate": 0,
              "rateType": "flat", "repaymentFrequency": "monthly"}


def shop(months=12, sales=1_000_000, rent=400_000, drawings=100_000, loan=None, slump_from=None):
    """Capital in Dec 2024, then `months` complete months from Jan 2025: sales, rent, owner drawings."""
    rows = [entry("c", "owner_capital", "in", 2_000_000, at=on(2024, 12, 20))]
    for i in range(months):
        y, m = divmod(i, 12)
        month_sales = sales // 4 if slump_from is not None and i >= slump_from else sales
        rows += [entry(f"s{i}", "service_income", "in", month_sales, at=on(2025 + y, m + 1, 5)),
                 entry(f"r{i}", "rent", "out", rent, at=on(2025 + y, m + 1, 6)),
                 entry(f"d{i}", "owner_drawings", "out", drawings, at=on(2025 + y, m + 1, 7))]
    if loan:
        rows.append(entry("l1", "loan_received", "in", loan["amount"], at=loan["at"], meta={**LOAN_TERMS, **loan.get("meta", {})}))
    return rows


def assess(rows, proposed=None, through=THROUGH):
    return risk.assess(rows, [CASH], proposed=proposed, through=through)


def test_worked_sample_gets_a_score_and_a_capacity_check():
    out = assess(ledger())
    model, capacity = out["model"], out["debtCapacity"]
    assert model["available"] and model["riskClass"] == "low" and 0 <= model["probability"] <= 1
    assert len(model["topDrivers"]) == 5 and model["horizonMonths"] == 12
    # Loans without a recorded schedule and cash falling at the end of 2025: debt plus weakening is at least moderate.
    assert capacity["available"] and capacity["scheduleMissing"] and capacity["weakening"]
    assert capacity["level"] == "moderate"


def test_capacity_is_profit_before_depreciation_less_tax_and_drawings():
    capacity = assess(shop())["debtCapacity"]
    assert capacity["monthlyCapacity"] == pytest.approx(1_000_000 - 400_000 - 100_000)
    assert capacity["existingMonthlyInstalments"] == 0 and capacity["dscr"] is None and capacity["level"] == "low"
    assert capacity["affordableMonthlyInstalment"] == pytest.approx(500_000 / risk.TARGET_DSCR)


DECEMBER_REPAYMENT = entry("rep-dec", "loan_repayment", "out", 100_000, meta={"loanName": "ABA", "interest": 0}, at=on(2025, 12, 10))


def test_scheduled_instalments_set_the_dscr():
    # 1,200,000 over 12 months at 0%: 100,000 a month from December, repaid on time, still running after December.
    capacity = assess(shop(loan={"amount": 1_200_000, "at": on(2025, 11, 10)}) + [DECEMBER_REPAYMENT])["debtCapacity"]
    assert capacity["existingMonthlyInstalments"] == pytest.approx(100_000)
    assert capacity["dscr"] == pytest.approx(5.0) and capacity["level"] == "low"


def test_missed_instalments_are_high_risk():
    # The same loan with December's instalment not paid.
    capacity = assess(shop(loan={"amount": 1_200_000, "at": on(2025, 11, 10)}))["debtCapacity"]
    assert capacity["level"] == "high"
    missed = next(r for r in capacity["reasons"] if r["code"] == "instalments_missed")
    assert missed["params"] == {"due": 100_000, "paid": 0}


def test_a_loan_the_business_cannot_cover_is_high_risk():
    capacity = assess(shop(loan={"amount": 7_200_000, "at": on(2025, 11, 10)}))["debtCapacity"]  # 600,000 a month
    assert capacity["dscr"] < 1 and capacity["level"] == "high"
    assert "dscr_below_one" in [r["code"] for r in capacity["reasons"]]


def test_a_proposed_loan_is_checked_against_what_the_business_can_repay():
    small = risk.validate_proposed_loan({"amount": 2_400_000, "termMonths": 12, "annualInterestRate": 0,
                                         "rateType": "flat", "repaymentFrequency": "monthly"})
    big = {**small, "amount": 9_600_000}
    ok = assess(shop(), small)["debtCapacity"]
    assert ok["proposed"]["monthlyInstalment"] == pytest.approx(200_000) and ok["proposed"]["fits"]
    assert ok["proposed"]["dscrWith"] == pytest.approx(2.5)
    too_much = assess(shop(), big)["debtCapacity"]
    assert not too_much["proposed"]["fits"] and too_much["level"] == "high"
    # The largest amount on the same terms keeps DSCR at the target.
    largest = too_much["proposed"]["maxAmount"]
    assert risk.monthly_instalment({**big, "amount": largest}) == pytest.approx(500_000 / risk.TARGET_DSCR, rel=1e-4)


def test_the_model_is_rescored_with_the_proposed_loan():
    proposed = risk.validate_proposed_loan({"amount": 9_600_000, "termMonths": 12, "annualInterestRate": 18,
                                            "rateType": "flat", "repaymentFrequency": "monthly"})
    change = assess(shop(), proposed)["debtCapacity"]["proposed"]["model"]
    assert change["probabilityAfter"] >= change["probabilityBefore"]
    assert "not kept as cash" in change["assumption"]


def test_with_loan_adds_the_debt_and_a_years_interest():
    snaps = risk.monthly_snapshots(shop(), [CASH], through=THROUGH)
    loan = {"amount": 1_200_000, "termMonths": 24, "annualInterestRate": 12, "rateType": "flat", "repaymentFrequency": "monthly"}
    after = risk.with_loan(snaps, loan)
    before_f, after_f = snaps[-1]["features"], after[-1]["features"]
    assert after_f["total_liabilities"] - before_f["total_liabilities"] == 1_200_000
    assert after_f["current_liabilities"] - before_f["current_liabilities"] == pytest.approx(600_000)  # half due within a year
    year_interest = sum(s["features"]["interest"] for s in after[-12:]) - sum(s["features"]["interest"] for s in snaps[-12:])
    assert year_interest == pytest.approx(1_200_000 * 0.12)  # flat: 12% of the original amount


def test_weakening_cash_flow_raises_the_level_when_there_is_debt():
    rows = shop(loan={"amount": 1_200_000, "at": on(2025, 11, 10)}, slump_from=9)
    capacity = assess(rows)["debtCapacity"]
    codes = [r["code"] for r in capacity["reasons"]]
    assert capacity["weakening"] and "capacity_falling" in codes and capacity["level"] != "low"


def test_too_little_history_says_so():
    out = assess(shop(months=2), through=datetime(2025, 3, 1, tzinfo=BUSINESS_TZ))
    assert not out["model"]["available"] and not out["debtCapacity"]["available"]


def test_a_healthy_debt_free_shop_is_not_scored_as_risky_for_having_no_debt():
    # No bills, no interest, one year of records: ratios that cannot be computed for good reasons.
    model = assess(shop())["model"]
    assert model["riskClass"] == "low", model
    notes = {d["feature"]: d["value_text"] for d in model["topDrivers"]}
    assert "sales_growth" not in notes or notes["sales_growth"] == "under 2 years of records (assumed no change)"


@pytest.mark.parametrize("bad", [{"amount": 0}, {"termMonths": 0}, {"rateType": "fixed"}, {"repaymentFrequency": "daily"},
                                 {"annualInterestRate": 150}, {"amount": 10.5}])
def test_proposed_loan_fields_are_validated(bad):
    good = {"amount": 100_000, "termMonths": 12, "annualInterestRate": 10, "rateType": "flat", "repaymentFrequency": "monthly"}
    with pytest.raises(ValueError):
        risk.validate_proposed_loan({**good, **bad})


def test_risk_endpoints(monkeypatch):
    from fastapi.testclient import TestClient
    from app.auth import current_user
    from app.main import app
    from app.routers import accounting
    from tests.test_accounting import LedgerDB
    monkeypatch.setattr(accounting, "db", LedgerDB(ledger()))
    app.dependency_overrides[current_user] = lambda: "sme"
    try:
        client = TestClient(app)
        body = client.get("/accounting/risk").json()
        assert set(body) == {"model", "debtCapacity"}
        loan = {"amount": 500_000, "termMonths": 12, "annualInterestRate": 15, "rateType": "declining", "repaymentFrequency": "monthly"}
        checked = client.post("/accounting/risk/loan-check", json=loan).json()
        assert "proposed" in checked["debtCapacity"]
        assert client.post("/accounting/risk/loan-check", json={**loan, "rateType": "fixed"}).status_code == 422
    finally:
        app.dependency_overrides.clear()
