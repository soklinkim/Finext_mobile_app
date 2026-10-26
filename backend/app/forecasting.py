"""Small, explainable user-level linear-trend forecast for bookkeeping activity."""
from __future__ import annotations

from datetime import datetime, timezone
from app.business_time import BUSINESS_TZ
from math import sqrt

from app.bookkeeping import depreciation_entries, estimated_costs, journal_for, loan_account_map

REVENUE_ACCOUNTS = {"4000", "4100", "4200", "4900"}
EXPENSE_ACCOUNTS = {
    "5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700",
    "6800", "6900", "6950", "6990", "7000", "7100",
}


def _fit_trend(values: list[int], horizon: int) -> tuple[list[int], list[int]]:
    """Return linear-regression point estimates and conservative residual ranges."""
    count = len(values)
    mean_x = (count - 1) / 2
    mean_y = sum(values) / count
    sxx = sum((x - mean_x) ** 2 for x in range(count))
    slope = sum((x - mean_x) * (value - mean_y) for x, value in enumerate(values)) / sxx if sxx else 0
    intercept = mean_y - slope * mean_x
    residuals = [value - (intercept + slope * x) for x, value in enumerate(values)]
    rmse = sqrt(sum(error * error for error in residuals) / max(count - 2, 1))

    estimates: list[int] = []
    ranges: list[int] = []
    for step in range(horizon):
        x = count + step
        estimate = max(0, round(intercept + slope * x))
        leverage = sqrt(1 + 1 / count + ((x - mean_x) ** 2 / sxx if sxx else 0))
        estimates.append(estimate)
        ranges.append(round(1.96 * rmse * leverage))
    return estimates, ranges


def forecast_income_expense(
    transactions: list[dict], banks: list[dict], settings: dict,
    opening_entries: list[dict] | None = None, *, now: datetime | None = None,
) -> dict:
    """Forecast the next three months from the six most recently completed months."""
    now = now or datetime.now(BUSINESS_TZ)
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    current_index = now.year * 12 + now.month - 1
    indices = list(range(current_index - 6, current_index))
    buckets = {index: {"income": 0, "expense": 0} for index in indices}
    active_indices: set[int] = set()

    def month_index(timestamp: int) -> int:
        date = datetime.fromtimestamp(timestamp / 1000, tz=BUSINESS_TZ)
        return date.year * 12 + date.month - 1

    bank_kinds = {bank["id"]: bank["kind"] for bank in banks}
    loan_accounts = loan_account_map(transactions)
    costs = estimated_costs(transactions)
    for transaction in transactions:
        if transaction.get("deletedAt") is not None:
            continue
        index = month_index(transaction["occurredAt"])
        bucket = buckets.get(index)
        if bucket is None:
            continue
        has_activity = False
        for line in journal_for(transaction, bank_kinds, loan_accounts, costs):
            amount = line["amount"]
            if transaction["currency"] != currency:
                exchange_rate = transaction.get("exchangeRate", rate)
                amount = round(amount * exchange_rate / 100) if transaction["currency"] == "USD" else round(amount * 100 / exchange_rate)
            code, side = line["accountCode"], line["side"]
            if code in REVENUE_ACCOUNTS:
                bucket["income"] += amount if side == "credit" else -amount
                has_activity = True
            elif code in EXPENSE_ACCOUNTS:
                bucket["expense"] += amount if side == "debit" else -amount
                has_activity = True
        if has_activity:
            active_indices.add(index)

    opening = [row for row in (opening_entries or []) if row.get("section") == "balance_sheet"]
    opening_as_of = max((row.get("asOf") or 0 for row in opening), default=0)
    for entry in depreciation_entries(transactions, after=opening_as_of):
        index = month_index(entry["date"])
        if index not in buckets:
            continue
        amount = entry["lines"][0]["amount"]
        if entry["currency"] != currency:
            amount = round(amount * rate / 100) if entry["currency"] == "USD" else round(amount * 100 / rate)
        buckets[index]["expense"] += amount
        active_indices.add(index)

    history = []
    for index in indices:
        year, month_zero = divmod(index, 12)
        history.append({"month": f"{year:04d}-{month_zero + 1:02d}", **buckets[index]})

    active_months = len(active_indices)
    total_income = sum(point["income"] for point in history)
    total_expense = sum(point["expense"] for point in history)
    readiness = "low" if active_months < 3 else "moderate" if active_months < 6 else "high"
    if active_months == 0:
        rule_insight = "no_recent_activity"
    elif active_months < 3:
        rule_insight = "early_data"
    elif total_income == 0:
        rule_insight = "no_recorded_income"
    elif total_expense > total_income:
        rule_insight = "expenses_exceed_income"
    else:
        rule_insight = "income_covers_expenses"
    result = {
        "model": "linear_trend_v1",
        "currency": currency,
        "history": history,
        "activeMonths": active_months,
        "readiness": {
            "level": readiness,
            "activeMonths": active_months,
            "windowMonths": 6,
            "forecastEligible": active_months >= 6,
        },
        "basicAnalysis": {
            "totalIncome": total_income,
            "totalExpense": total_expense,
            "net": total_income - total_expense,
            "averageIncomePerActiveMonth": round(total_income / active_months) if active_months else 0,
            "averageExpensePerActiveMonth": round(total_expense / active_months) if active_months else 0,
        },
        "ruleInsight": rule_insight,
        "forecast": [],
        "available": active_months >= 6,
        "note": "Experimental trend estimate from six completed months. It is not a guarantee or accounting advice.",
    }
    if active_months < 6:
        result["reason"] = "Six active completed months are needed before a forecast is shown. Basic totals are available now."
        return result

    incomes, income_ranges = _fit_trend([point["income"] for point in history], 3)
    expenses, expense_ranges = _fit_trend([point["expense"] for point in history], 3)
    for step, (income, expense) in enumerate(zip(incomes, expenses), start=1):
        index = current_index + step
        year, month_zero = divmod(index, 12)
        net = income - expense
        spread = round(sqrt(income_ranges[step - 1] ** 2 + expense_ranges[step - 1] ** 2))
        result["forecast"].append({
            "month": f"{year:04d}-{month_zero + 1:02d}",
            "income": income,
            "expense": expense,
            "net": net,
            "netLower": net - spread,
            "netUpper": net + spread,
        })
    return result
