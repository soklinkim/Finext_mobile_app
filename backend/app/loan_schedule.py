"""Loan repayment schedules (AI pipeline spec: required loan fields; rules §12 Q10).

A loan received can carry: annualInterestRate (percent a year; 0 allowed, e.g. family loans), rateType
("flat" or "declining"), termMonths, repaymentFrequency ("weekly" or "monthly"), firstDueDate (ms), and
optionally installmentAmount from the lender's own schedule. The lender's instalment wins; otherwise the
instalment is calculated and marked estimated. Loans recorded before these fields existed may have no
schedule at all; DSCR then reports "not enough data" rather than guessing.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timedelta
from typing import Any

from app.business_time import BUSINESS_TZ

PERIODS_PER_YEAR = {"monthly": 12, "weekly": 52}


def instalment_count(term_months: int, frequency: str) -> int:
    return term_months if frequency == "monthly" else max(1, round(term_months * 52 / 12))


def estimated_instalment(principal: int, annual_rate: float, rate_type: str, term_months: int, frequency: str) -> int:
    """Instalment in the loan's minor units. Flat: interest on the original amount for the whole term, spread
    evenly. Declining balance: the standard annuity payment on the outstanding balance."""
    n = instalment_count(term_months, frequency)
    if rate_type == "flat":
        return round((principal + principal * annual_rate / 100 * term_months / 12) / n)
    r = annual_rate / 100 / PERIODS_PER_YEAR[frequency]
    return round(principal / n) if r == 0 else round(principal * r / (1 - (1 + r) ** -n))


def _add_months(moment: datetime, months: int, day: int) -> datetime:
    index = moment.year * 12 + moment.month - 1 + months
    year, zero_month = divmod(index, 12)
    return moment.replace(year=year, month=zero_month + 1, day=min(day, monthrange(year, zero_month + 1)[1]))


def schedule(loan: dict[str, Any], meta: dict[str, Any]) -> tuple[list[tuple[datetime, int]], str]:
    """(due date, instalment) pairs and where the amounts come from: "lender", "estimated" or "missing"."""
    frequency = meta.get("repaymentFrequency")
    try:
        term = int(meta.get("termMonths") or 0)
    except (TypeError, ValueError):
        term = 0
    if frequency not in PERIODS_PER_YEAR or term <= 0:
        return [], "missing"
    installment = meta.get("installmentAmount")
    source = "lender"
    if not isinstance(installment, int) or isinstance(installment, bool) or installment <= 0:
        rate, rate_type = meta.get("annualInterestRate"), meta.get("rateType")
        if not isinstance(rate, (int, float)) or isinstance(rate, bool) or rate < 0 or rate_type not in {"flat", "declining"}:
            return [], "missing"
        installment, source = estimated_instalment(loan["amount"], float(rate), rate_type, term, frequency), "estimated"

    loan_date = datetime.fromtimestamp(loan["occurredAt"] / 1000, tz=BUSINESS_TZ)
    first = meta.get("firstDueDate")
    if isinstance(first, int) and not isinstance(first, bool):
        first_due = datetime.fromtimestamp(first / 1000, tz=BUSINESS_TZ)
    else:  # older loans: one period after the loan was received
        first_due = loan_date + timedelta(days=7) if frequency == "weekly" else _add_months(loan_date, 1, loan_date.day)
    count = instalment_count(term, frequency)
    if frequency == "weekly":
        dates = [first_due + timedelta(days=7 * i) for i in range(count)]
    else:
        dates = [_add_months(first_due, i, first_due.day) for i in range(count)]
    return [(due, installment) for due in dates], source
