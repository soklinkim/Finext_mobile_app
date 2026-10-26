"""Definitions settled by the AI pipeline spec (rules §12 Q7-Q10, triggers 4, 7, 12, 13)."""
import pytest

from app import loan_schedule
from app.bookkeeping import PostingError, journal_for, open_items
from app.routers.accounting import either_or_both
from tests.test_settlement import BANKS, entry
from tests.test_worked_sample import on


@pytest.mark.parametrize("first,second,level", [
    ("green", "green", None), ("not_available", "green", None),
    ("yellow", "green", "yellow"), ("green", "red", "red"),
    ("yellow", "yellow", "red"),  # both conditions: one level up
    ("red", "yellow", "red"),
])
def test_either_condition_raises_the_alert_and_both_raise_it_a_level(first, second, level):
    assert either_or_both(first, second) == level


def test_flat_and_declining_rates_give_different_instalments():
    # $12,000 over 12 months at 18% a year.
    assert loan_schedule.estimated_instalment(1_200_000, 18, "flat", 12, "monthly") == 118_000      # $1,180.00
    assert loan_schedule.estimated_instalment(1_200_000, 18, "declining", 12, "monthly") == 110_016  # $1,100.16
    assert loan_schedule.estimated_instalment(1_200_000, 0, "declining", 12, "monthly") == 100_000   # family loan, no interest
    assert loan_schedule.instalment_count(12, "weekly") == 52


def loan(meta, at=None):
    return entry("l1", "loan_received", "in", 1_200_000, meta={"lender": "ABA", "lenderType": "bank_mfi", "termMonths": 12, **meta},
                 at=at or on(2025, 1, 10))


def test_schedule_uses_the_lenders_instalment_then_an_estimate_then_nothing():
    first_due = on(2025, 2, 5)
    rows, source = loan_schedule.schedule(loan({}), {"termMonths": 12, "repaymentFrequency": "monthly", "installmentAmount": 105_000,
                                                     "firstDueDate": first_due})
    assert source == "lender" and len(rows) == 12 and rows[0][1] == 105_000
    assert (rows[0][0].month, rows[0][0].day, rows[-1][0].year, rows[-1][0].month) == (2, 5, 2026, 1)
    rows, source = loan_schedule.schedule(loan({}), {"termMonths": 12, "repaymentFrequency": "monthly", "annualInterestRate": 18,
                                                     "rateType": "flat"})
    assert source == "estimated" and rows[0][1] == 118_000 and rows[0][0].month == 2  # one month after the loan
    assert loan_schedule.schedule(loan({}), {"termMonths": 12, "repaymentFrequency": "monthly"}) == ([], "missing")


def test_loan_fields_are_checked_when_present():
    journal_for(loan({"annualInterestRate": 0, "rateType": "declining", "repaymentFrequency": "weekly", "firstDueDate": on(2025, 1, 17)}), BANKS, {})
    for bad, reason in (({"annualInterestRate": 250}, "interest rate"), ({"rateType": "balloon"}, "rate type"),
                        ({"firstDueDate": on(2024, 12, 1)}, "first due date"), ({"repaymentFrequency": "daily"}, "frequency")):
        with pytest.raises(PostingError, match=reason):
            journal_for(loan(bad), BANKS, {})


def test_open_items_fall_due_after_their_payment_terms():
    sale = entry("s1", "product_sale", "in", pay="later", meta={"cost": 0, "termsDays": 15}, at=on(2025, 3, 1))
    old = entry("s2", "product_sale", "in", pay="later", meta={"cost": 0}, at=on(2025, 3, 1))  # recorded before terms existed
    due = {item["id"]: (item["termsDays"], item["dueAt"]) for item in open_items([sale, old])}
    assert due == {"s1": (15, on(2025, 3, 16)), "s2": (30, on(2025, 3, 31))}
    with pytest.raises(PostingError, match="payment terms"):
        journal_for(entry("s3", "product_sale", "in", pay="later", meta={"termsDays": 400}), BANKS, {})


def test_usual_expenses_are_cogs_and_operating_costs_without_depreciation(monkeypatch):
    from datetime import datetime
    from app.business_time import BUSINESS_TZ
    from app.routers import accounting
    from tests.test_accounting import LedgerDB
    now = datetime.now(BUSINESS_TZ)

    def months_ago(n, day=10):
        index = now.year * 12 + now.month - 1 - n
        return int(datetime(index // 12, index % 12 + 1, day, 12, tzinfo=BUSINESS_TZ).timestamp() * 1000)

    rows = [entry("cap", "owner_capital", "in", 900_000, at=months_ago(4)),
            entry("van", "equipment_purchase", "out", 120_000, meta={"assetName": "Van", "usefulLifeYears": 1}, at=months_ago(4)),
            *[entry(f"rent{n}", "rent", "out", 30_000, at=months_ago(n)) for n in (1, 2, 3)],
            entry("bill", "utilities", "out", 15_000, pay="later", at=months_ago(2)),  # unpaid, still a cost of the month
            entry("sale", "product_sale", "in", 50_000, meta={"cost": 30_000}, at=months_ago(1)),
            entry("loan", "loan_repayment", "out", 5_000, meta={"loanName": "x", "interest": 5_000, "loanAccountCode": "2400"}, at=months_ago(1))]
    monkeypatch.setattr(accounting, "db", LedgerDB(rows))
    runway, values = accounting._cash_runway("u")
    # (rent 900 + utilities 150 + COGS 300) / 3 = 450 a month; depreciation (100 a month) and interest are left out.
    assert values["usualMonthlyExpenses"] == pytest.approx(45_000)
    assert runway == pytest.approx(values["cash"] / 45_000)
