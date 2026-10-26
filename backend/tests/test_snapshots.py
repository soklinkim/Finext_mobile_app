"""Stage A monthly feature snapshots (AI pipeline spec §2)."""
from datetime import datetime

from app.business_time import BUSINESS_TZ
from app.snapshots import monthly_snapshots
from tests.test_settlement import entry
from tests.test_worked_sample import CASH, ledger, on, usd


def at(year, month):
    return datetime(year, month, 1, tzinfo=BUSINESS_TZ)


def by_period(snapshots):
    return {s["period"]: s for s in snapshots}


def test_monthly_snapshots_add_up_to_the_worked_sample():
    snaps = monthly_snapshots(ledger(), [CASH], through=at(2026, 1))
    assert all(s["integrity"]["ok"] for s in snaps)
    year = [s["features"] for s in snaps if s["period"].startswith("2025")]
    assert len(year) == 12
    assert sum(f["revenue"] for f in year) == usd(71_000)
    assert sum(f["net_profit"] for f in year) == usd(6_650)
    assert sum(f["ocf"] for f in year) == usd(6_850)  # §8.4 net cash from operating activities
    december = by_period(snaps)["2025-12"]["features"]
    assert (december["cash"], december["total_assets"], december["equity"]) == (usd(4_950), usd(33_950), usd(18_750))
    assert december["balance_check"] == 0


def test_a_month_is_never_changed_by_later_entries():
    full = by_period(monthly_snapshots(ledger(), [CASH], through=at(2026, 1)))
    cut = by_period(monthly_snapshots([r for r in ledger() if r["occurredAt"] < on(2025, 1, 1)], [CASH], through=at(2026, 1)))
    assert full["2024-12"]["features"] == cut["2024-12"]["features"]
    assert full["2024-12"]["reasons"] == cut["2024-12"]["reasons"]


def test_only_complete_months_are_snapshotted():
    rows = [entry("c", "owner_capital", "in", 100_000, at=on(2025, 3, 15))]
    assert [s["period"] for s in monthly_snapshots(rows, [CASH], through=datetime(2025, 5, 20, tzinfo=BUSINESS_TZ))] == ["2025-03", "2025-04"]


def test_missing_values_carry_a_reason():
    rows = [entry("c", "owner_capital", "in", 500_000, at=on(2025, 3, 15)),
            *[entry(f"s{m}", "service_income", "in", 100_000, at=on(2025, m, 5)) for m in (4, 5, 6)],
            *[entry(f"r{m}", "rent", "out", 40_000, at=on(2025, m, 6)) for m in (4, 5, 6)]]
    snaps = by_period(monthly_snapshots(rows, [CASH], through=at(2025, 7)))
    march, june = snaps["2025-03"], snaps["2025-06"]
    # Records start mid-March: flow ratios wait for the first complete month.
    assert march["features"]["gross_margin"] is None and march["reasons"]["gross_margin"] == "not_yet_available"
    assert march["reasons"]["revenue_growth"] == "not_yet_available"
    # A service business holds no stock; receipts are not recorded anywhere yet.
    assert june["features"]["inventory_days"] is None and june["reasons"]["inventory_days"] == "not_applicable"
    assert june["reasons"]["receipt_share"] == "no_data"
    assert june["features"]["gross_margin"] == 1.0 and june["features"]["revenue_growth"] == 0.0
    assert june["features"]["usual_monthly_expenses"] == 40_000 and june["features"]["cash_runway"] == june["features"]["cash"] / 40_000
    assert all((value is not None) or (name in june["reasons"]) for name, value in june["features"].items())


def test_unbalanced_books_get_an_integrity_warning_instead_of_features():
    opening = [{"section": "balance_sheet", "entryKey": "cash_bank", "amount": 100_000, "currency": "USD", "asOf": on(2025, 2, 28)}]
    snaps = monthly_snapshots([], [CASH], opening=opening, through=at(2025, 4))
    assert [(s["period"], s["integrity"]["ok"], s["features"]) for s in snaps] == [("2025-02", False, None), ("2025-03", False, None)]


def test_loan_schedule_feeds_dscr_and_upcoming_instalments():
    loan = entry("l1", "loan_received", "in", usd(12_000), at=on(2025, 1, 10), meta={
        "lender": "ABA", "lenderType": "bank_mfi", "termMonths": 12, "annualInterestRate": 18, "rateType": "flat",
        "repaymentFrequency": "monthly", "firstDueDate": on(2025, 2, 10)})
    sales = [entry(f"s{m}", "service_income", "in", usd(3_000), at=on(2025, m, 1)) for m in range(1, 5)]
    snaps = by_period(monthly_snapshots([loan, *sales], [CASH], through=at(2025, 5)))
    april = snaps["2025-04"]["features"]
    assert april["active_loans"] == 1 and april["debt_service_next_month"] == usd(1_180)  # flat 18%: $1,180 a month
    assert april["dscr"] == (usd(9_000)) / (3 * usd(1_180))  # Feb-Apr EBITDA / three instalments


def test_snapshots_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    from app.auth import current_user
    from app.main import app
    from app.routers import accounting
    from tests.test_accounting import LedgerDB
    monkeypatch.setattr(accounting, "db", LedgerDB([entry("c", "owner_capital", "in", 100_000, at=on(2025, 3, 15))]))
    app.dependency_overrides[current_user] = lambda: "sme"
    try:
        body = TestClient(app).get("/accounting/snapshots").json()
        assert body["snapshots"][0]["period"] == "2025-03" and body["snapshots"][0]["integrity"]["ok"]
    finally:
        app.dependency_overrides.clear()
