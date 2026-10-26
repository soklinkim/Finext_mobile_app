"""Stage A of the AI pipeline: one financial feature snapshot per business per month.

Pure functions over the same rows the API stores (transactions, banks, settings, onboarding entries), using
the same posting rules as the statements, so the app, the lender portal and any future model trained on
FINEXT records all compute features identically. No database access here.

A snapshot is created only when the books balance at that month end (trial balance and assets =
liabilities + equity); otherwise the month gets an integrity warning instead of features.

Every feature is a number or None. A None always has a reason in `reasons`:
  not_yet_available - not enough history yet (e.g. growth in the first month)
  not_applicable    - the metric does not apply (e.g. inventory days for a service business, margins with no revenue)
  no_data           - the data needed is not recorded (e.g. receipts, bank matching, a loan without a schedule)
"""
from __future__ import annotations

import statistics
from calendar import monthrange
from datetime import datetime, timedelta
from typing import Any

from app import loan_schedule
from app.bookkeeping import (
    REVERSAL, WRITE_OFF, _meta, depreciation_entries, estimated_costs, journal_for, loan_account_map,
    open_items, reversed_ids,
)
from app.business_time import BUSINESS_TZ
from app.financial_statement import DEBIT_NORMAL_ACCOUNTS, ONBOARDING_ACCOUNT_MAP, natural_balance
from app.health_ratio import RATIO_RULES, ratio_status

DAY_MS = 86_400_000
NOT_YET, NOT_APPLICABLE, NO_DATA = "not_yet_available", "not_applicable", "no_data"
OPERATING = ("6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990")
DEBT = ("2400", "2500", "2600", "2700")
SALES_TYPES = {"product_sale", "service_income"}
SNAPSHOT_VERSION = "stage-a-1"

# Pipeline spec B4: which ratios feed which financial dimension (Layer 1 summary features).
DIMENSIONS = {
    "profitability": ("revenue_growth", "gross_margin", "net_margin", "ebitda_margin", "operating_expense_ratio"),
    "liquidity": ("current_ratio",),
    "debt": ("debt_to_equity", "debt_to_asset", "interest_coverage", "dscr"),
    "working_capital": ("inventory_days", "receivable_days"),
}


def _month_index(moment: datetime) -> int:
    return moment.year * 12 + moment.month - 1


def _month_bounds(index: int) -> tuple[datetime, datetime]:
    year, zero = divmod(index, 12)
    start = datetime(year, zero + 1, 1, tzinfo=BUSINESS_TZ)
    year2, zero2 = divmod(index + 1, 12)
    return start, datetime(year2, zero2 + 1, 1, tzinfo=BUSINESS_TZ)


def _ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


def _convert(amount: int, source: str, target: str, rate: int) -> int:
    if source == target or rate <= 0:
        return amount
    return round(amount * rate / 100) if source == "USD" else round(amount * 100 / rate)


class _Features:
    """Collects one month's values and the reason for every missing one."""

    def __init__(self):
        self.values: dict[str, float | None] = {}
        self.reasons: dict[str, str] = {}

    def set(self, name: str, value: float | None, reason: str = NOT_APPLICABLE) -> None:
        self.values[name] = value
        if value is None:
            self.reasons[name] = reason

    def ratio(self, name: str, numerator: float, denominator: float, reason: str = NOT_APPLICABLE, scale: float = 1) -> None:
        self.set(name, numerator / denominator * scale if denominator > 0 else None, reason)


def monthly_snapshots(transactions: list[dict], banks: list[dict], settings: dict | None = None,
                      opening: list[dict] | None = None, through: datetime | None = None) -> list[dict]:
    """Snapshots for every complete month from the business's first records up to `through` (default: now)."""
    settings = settings or {}
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    through = through or datetime.now(BUSINESS_TZ)
    live = [tx for tx in transactions if tx.get("deletedAt") is None]
    cancelled = reversed_ids(live)
    effective = [tx for tx in live if tx["id"] not in cancelled and tx.get("typeId") != REVERSAL]
    effective_ids = {tx["id"] for tx in effective}
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(live)
    costs = estimated_costs(live)

    opening_rows = [r for r in (opening or []) if r.get("section") == "balance_sheet" and ONBOARDING_ACCOUNT_MAP.get(r.get("entryKey"))]
    opening_as_of = max((r.get("asOf") or 0 for r in opening_rows), default=0)
    starts = [r["asOf"] for r in opening_rows if r.get("asOf")] + [tx["occurredAt"] for tx in live]
    if not starts:
        return []
    first_ms = min(starts)
    first_index = _month_index(datetime.fromtimestamp(first_ms / 1000, tz=BUSINESS_TZ))
    last_index = _month_index(through) - 1  # complete months only (month-end close)
    if last_index < first_index:
        return []

    # Signed (debit +) account movements per month, from every posting source the statements use.
    movements: dict[int, dict[str, int]] = {}

    def post(when_ms: int, code: str, signed: int) -> None:
        index = _month_index(datetime.fromtimestamp(when_ms / 1000, tz=BUSINESS_TZ))
        month = movements.setdefault(index, {})
        month[code] = month.get(code, 0) + signed

    credit_sales: dict[int, int] = {}
    for tx in live:
        for line in journal_for(tx, bank_kinds, loan_accounts, costs):
            amount = _convert(line["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
            post(tx["occurredAt"], line["accountCode"], amount if line["side"] == "debit" else -amount)
        if tx["id"] in effective_ids and tx["typeId"] in SALES_TYPES and tx.get("payMethod") == "later":
            index = _month_index(datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ))
            credit_sales[index] = credit_sales.get(index, 0) + _convert(tx["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
    for entry in depreciation_entries(live, after=opening_as_of, through=_ms(_month_bounds(last_index)[1]) - 1):
        for line in entry["lines"]:
            amount = _convert(line["amount"], entry["currency"], currency, rate)
            post(entry["date"], line["accountCode"], amount if line["side"] == "debit" else -amount)
    for row in opening_rows:
        code = ONBOARDING_ACCOUNT_MAP[row["entryKey"]]
        amount = _convert(row["amount"], row["currency"], currency, rate)
        post(row["asOf"], code, amount if code in DEBIT_NORMAL_ACCOUNTS else -amount)

    snapshots: list[dict] = []
    balances: dict[str, int] = {}
    history: list[dict[str, Any]] = []  # earlier months' values, for trends
    for index in range(first_index, last_index + 1):
        start, end = _month_bounds(index)
        month = movements.get(index, {})
        opening_balances = dict(balances)
        for code, signed in month.items():
            balances[code] = balances.get(code, 0) + signed

        # Integrity: the trial balance must net to zero, and assets = liabilities + equity.
        trial = sum(balances.values())
        if trial != 0:
            snapshots.append({"period": f"{start:%Y-%m}", "monthEnd": _ms(end) - 1, "version": SNAPSHOT_VERSION,
                              "integrity": {"ok": False, "trialBalance": trial}, "features": None, "reasons": None})
            history.append({})
            continue

        f = _Features()
        nat = lambda codes, values=balances: natural_balance(codes, values)  # noqa: E731
        days = (end - start).days
        complete = first_ms <= _ms(start)  # records cover the whole month (spec: flow ratios from the first complete month)
        months_of_history = index - first_index + 1
        f.set("months_of_history", months_of_history)

        # A1: main figures for the month (flows) and at month end (balances).
        revenue = nat(("4000", "4100"), month) - nat(("4900",), month)
        cogs = nat(("5000",), month)
        operating = nat(OPERATING, month)
        depreciation = nat(("6800",), month)
        ebit = revenue - cogs - operating  # without other income (rules §12 Q7)
        other_income = -month.get("4200", 0)
        interest = nat(("7000",), month)
        tax = nat(("7100",), month)
        net_profit = ebit + other_income - interest - tax
        cash = nat(("1000", "1010"))
        receivables, inventory, prepaid = nat(("1100",)), nat(("1200",)), nat(("1300",))
        payables = nat(("2000",))
        current_assets = nat(("1000", "1010", "1100", "1200", "1300"))
        total_assets = nat(("1000", "1010", "1100", "1200", "1300", "1500", "1600")) - nat(("1590",))
        current_liabilities = nat(("2000", "2100", "2200", "2300", "2400", "2500"))
        total_liabilities = current_liabilities + nat(("2600", "2700"))
        debt = nat(DEBT)
        # Equity from the books: capital, retained earnings and all profit to date, less drawings (credit balances).
        equity = -sum(signed for code, signed in balances.items() if code[0] in "34567")
        change = lambda code: natural_balance((code,), month)  # noqa: E731
        ocf = (net_profit + depreciation - change("1100") - change("1200") - change("1300")
               + change("2000") + change("2100") + change("2200") + change("2300"))
        drawings = nat(("3200",), month)
        for name, value in (("revenue", revenue), ("cogs", cogs), ("operating_expenses", operating), ("depreciation", depreciation),
                            ("ebit", ebit), ("ebitda", ebit + depreciation), ("other_income", other_income), ("interest", interest),
                            ("tax", tax), ("net_profit", net_profit), ("cash", cash), ("receivables", receivables),
                            ("inventory", inventory), ("payables", payables), ("current_assets", current_assets),
                            ("current_liabilities", current_liabilities), ("total_assets", total_assets),
                            ("total_liabilities", total_liabilities), ("debt", debt), ("equity", equity),
                            ("owner_capital", nat(("3000",))), ("ocf", ocf),
                            ("credit_sales", credit_sales.get(index, 0)), ("owner_drawings", drawings)):
            f.set(name, value)
        f.set("balance_check", total_assets - total_liabilities - equity)

        previous = history[-1] if history else {}
        last3 = [h for h in history[-2:] if h] + [{"cogs": cogs, "operating_expenses": operating, "depreciation": depreciation}]
        if len(history) >= 2 and all(history[-2:]):
            usual = statistics.fmean(h["cogs"] + h["operating_expenses"] - h["depreciation"] for h in last3)
            f.set("usual_monthly_expenses", usual)
            f.ratio("cash_runway", cash, usual)
        else:
            f.set("usual_monthly_expenses", None, NOT_YET)
            f.set("cash_runway", None, NOT_YET)

        # A2: ratios. Flow ratios wait for the first complete month; a zero denominator is "not applicable".
        flow_reason = NOT_APPLICABLE if complete else NOT_YET
        f.ratio("current_ratio", current_assets, current_liabilities)
        f.ratio("cash_ratio", cash, current_liabilities)
        if total_assets > 0 or total_liabilities > 0:
            f.ratio("debt_to_equity", debt, equity)
            f.ratio("liabilities_to_equity", total_liabilities, equity)
            f.ratio("debt_to_asset", debt, total_assets)
            f.set("negative_equity", 1.0 if equity <= 0 else 0.0)
        else:
            for name in ("debt_to_equity", "liabilities_to_equity", "debt_to_asset", "negative_equity"):
                f.set(name, None, NO_DATA)
        avg = lambda code: (natural_balance((code,), opening_balances) + natural_balance((code,), balances)) / 2  # noqa: E731
        if complete:
            f.ratio("gross_margin", revenue - cogs, revenue)
            f.ratio("net_margin", net_profit, revenue)
            f.ratio("ebitda_margin", ebit + depreciation, revenue)
            f.ratio("operating_expense_ratio", operating, revenue)
            holds_stock = inventory > 0 or cogs > 0 or any(h.get("inventory") for h in history if h)
            if holds_stock:
                f.ratio("inventory_days", avg("1200"), cogs, scale=days)
            else:
                f.set("inventory_days", None, NOT_APPLICABLE)  # service business: no stock
            f.ratio("receivable_days", avg("1100"), credit_sales.get(index, 0), scale=days)
            f.ratio("payable_days", avg("2000"), cogs, scale=days)
        else:
            for name in ("gross_margin", "net_margin", "ebitda_margin", "operating_expense_ratio",
                         "inventory_days", "receivable_days", "payable_days"):
                f.set(name, None, NOT_YET)
        if previous and previous.get("_complete") and complete:
            f.ratio("revenue_growth", revenue - previous["revenue"], previous["revenue"])
        else:
            f.set("revenue_growth", None, NOT_YET)

        # Coverage ratios on a rolling 3-month basis (spec B2 trigger 13 monthly review).
        window = [h for h in history[-2:] if h] + [{"ebit": ebit, "ebitda": ebit + depreciation, "interest": interest}]
        quarter_ready = len(window) == 3 and all(h.get("_complete", True) for h in history[-2:]) and complete
        due, schedule_missing = _debt_service(effective, currency, rate, _month_bounds(index - 2)[0], end)
        if not quarter_ready:
            f.set("interest_coverage", None, NOT_YET)
            f.set("dscr", None, NOT_YET)
        else:
            f.ratio("interest_coverage", sum(h["ebit"] for h in window), sum(h["interest"] for h in window))
            if schedule_missing:
                f.set("dscr", None, NO_DATA)
            else:
                f.ratio("dscr", sum(h["ebitda"] for h in window), due)
        f.set("debt_service_3m", due if not schedule_missing else None, NO_DATA)

        # A3: changes, averages, volatility, streaks.
        series = [h for h in history if h] + [{"revenue": revenue, "ocf": ocf, "cash": cash}]
        recent = series[-6:]
        f.set("revenue_change", revenue - previous["revenue"] if previous else None, NOT_YET)
        f.set("cash_change", cash - previous["cash"] if previous else None, NOT_YET)
        f.set("revenue_avg_3m", statistics.fmean(h["revenue"] for h in series[-3:]) if len(series) >= 3 else None, NOT_YET)
        f.set("ocf_avg_3m", statistics.fmean(h["ocf"] for h in series[-3:]) if len(series) >= 3 else None, NOT_YET)
        year_ago = history[-12] if len(history) >= 12 else None
        f.set("revenue_yoy", (revenue / year_ago["revenue"] - 1) if year_ago and year_ago.get("revenue", 0) > 0 else None,
              NOT_YET if len(history) < 12 else NOT_APPLICABLE)
        for key in ("revenue", "ocf"):
            values = [h[key] for h in recent]
            if len(values) >= 3:
                spread = statistics.pstdev(values)
                mean = statistics.fmean(values)
                f.set(f"{key}_volatility", spread)
                f.set(f"{key}_cv", spread / abs(mean) if mean else None, NOT_APPLICABLE)
            else:
                f.set(f"{key}_volatility", None, NOT_YET)
                f.set(f"{key}_cv", None, NOT_YET)
        net_margin = f.values.get("net_margin")
        f.set("negative_ocf_streak", _streak(history, "ocf", lambda v: v < 0, ocf < 0))
        f.set("falling_cash_streak", _streak(history, "cash_change", lambda v: v is not None and v < 0,
                                             previous and cash < previous["cash"]))
        f.set("low_margin_streak", _streak(history, "net_margin", lambda v: v is not None and v <= RATIO_RULES["net_margin"]["yellow"],
                                           net_margin is not None and net_margin <= RATIO_RULES["net_margin"]["yellow"]))

        # A3: overdue customer and supplier balances at month end.
        month_end_ms = _ms(end) - 1
        as_of = [tx for tx in live if tx["occurredAt"] <= month_end_ms]
        for direction, prefix in (("in", "ar"), ("out", "ap")):
            buckets = {"0_30": 0, "31_60": 0, "61_plus": 0}
            oldest = 0
            for item in open_items(as_of):
                if item["direction"] != direction:
                    continue
                late = (month_end_ms - item["dueAt"]) // DAY_MS
                if late < 0:
                    continue
                amount = _convert(item["open"], item["currency"], currency, item.get("exchangeRate") or rate)
                buckets["0_30" if late <= 30 else "31_60" if late <= 60 else "61_plus"] += amount
                oldest = max(oldest, late)
            for bucket, amount in buckets.items():
                f.set(f"{prefix}_overdue_{bucket}", amount)
            f.set(f"{prefix}_oldest_overdue_days", oldest)

        # A3: loans.
        loans = _loan_features(effective, currency, rate, end, month_end_ms)
        for name, value in loans.items():
            f.set(name, value, NO_DATA)

        # A3: owner behaviour and data quality.
        f.ratio("drawings_to_profit", drawings, net_profit)
        f.ratio("drawings_to_ocf", drawings, ocf)
        in_month = [tx for tx in live if _ms(start) <= tx["occurredAt"] < _ms(end)]
        entry_days = {datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ).day for tx in in_month}
        f.set("days_without_entries", days - len(entry_days) if complete else None, NOT_YET)
        sales = [tx for tx in in_month if tx["typeId"] == "product_sale" and tx["id"] not in cancelled]
        sales_total = sum(tx["amount"] for tx in sales)
        estimated = sum(tx["amount"] for tx in sales if _meta(tx).get("cost") is None)
        f.ratio("estimated_cogs_share", estimated, sales_total)
        f.set("reversals", sum(1 for tx in in_month if tx["typeId"] == REVERSAL))
        f.set("review_flags", sum(1 for tx in in_month if tx.get("reviewFlag")))
        f.set("write_offs", sum(1 for tx in in_month if tx["typeId"] == WRITE_OFF))
        f.set("receipt_share", None, NO_DATA)      # entries do not record receipts yet
        f.set("bank_matched_share", None, NO_DATA)  # no bank / wallet / KHQR matching yet

        statuses = rule_statuses(f.values)
        snapshot = {"period": f"{start:%Y-%m}", "monthEnd": month_end_ms, "version": SNAPSHOT_VERSION,
                    "complete": complete, "integrity": {"ok": True, "trialBalance": 0}, "features": f.values, "reasons": f.reasons,
                    "ratioStatus": statuses, "dimensions": dimension_summary(statuses)}
        snapshots.append(snapshot)
        history.append({**f.values, "_complete": complete})
    return snapshots


def _streak(history: list[dict], key: str, holds, now: bool) -> int:
    """Months in a row, ending this month, where the condition holds."""
    if not now:
        return 0
    count = 1
    for h in reversed(history):
        if h and holds(h.get(key)):
            count += 1
        else:
            break
    return count


def _loan_book(transactions: list[dict]):
    loans, repaid = [], {}
    for tx in transactions:
        meta = _meta(tx)
        if tx["typeId"] == "loan_received":
            loans.append((tx, meta, str(meta.get("lender") or tx.get("counterparty") or "").strip().casefold()))
        elif tx["typeId"] == "loan_repayment":
            name = str(meta.get("loanName") or "").strip().casefold()
            repaid.setdefault(name, []).append(tx)
    return loans, repaid


def _debt_service(transactions: list[dict], currency: str, rate: int, start: datetime, end: datetime) -> tuple[int, bool]:
    """Scheduled instalments due in [start, end) on loans still open at `end`, and whether any open loan has no schedule."""
    loans, repaid = _loan_book([tx for tx in transactions if tx["occurredAt"] < _ms(end)])
    total, missing = 0, False
    for loan, meta, name in loans:
        principal_repaid = sum(tx["amount"] - int(_meta(tx).get("interest") or 0) for tx in repaid.get(name, []))
        if loan["amount"] - principal_repaid <= 0:
            continue
        instalments, source = loan_schedule.schedule(loan, meta)
        if source == "missing":
            missing = True
            continue
        total += sum(_convert(amount, loan["currency"], currency, loan.get("exchangeRate", rate))
                     for due, amount in instalments if start <= due < end)
    return total, missing


def _loan_features(transactions: list[dict], currency: str, rate: int, end: datetime, month_end_ms: int) -> dict[str, float | None]:
    known = [tx for tx in transactions if tx["occurredAt"] <= month_end_ms]
    loans, repaid = _loan_book(known)
    active = 0
    for loan, meta, name in loans:
        principal_repaid = sum(tx["amount"] - int(_meta(tx).get("interest") or 0) for tx in repaid.get(name, []))
        active += loan["amount"] - principal_repaid > 0
    due_14, missing = _debt_service(known, currency, rate, end, end + timedelta(days=14))
    next_end = _month_bounds(_month_index(end) + 1)[0]
    due_next_month, _ = _debt_service(known, currency, rate, end, next_end)
    six_months_ago = _ms(_month_bounds(_month_index(end) - 6)[0])
    new = [tx for tx, _, _ in loans if tx["occurredAt"] >= six_months_ago]
    return {
        "active_loans": active,
        "instalments_due_14d": None if missing else due_14,
        "debt_service_next_month": None if missing else due_next_month,
        "new_loans_6m": len(new),
        "new_borrowing_6m": sum(_convert(tx["amount"], tx["currency"], currency, tx.get("exchangeRate", rate)) for tx in new),
    }


def rule_statuses(values: dict[str, float | None]) -> dict[str, str]:
    """Layer 1 (spec B1): each ratio's colour with the shared thresholds; missing ratios are "not_available"."""
    statuses = {}
    for key, rule in RATIO_RULES.items():
        value = values.get(key)
        if key == "debt_to_equity" and values.get("negative_equity") == 1:
            statuses[key] = "red"  # spec A2: undefined with zero or negative equity, treated as red
        elif key == "current_ratio" and value is None and values.get("current_liabilities") == 0:
            statuses[key] = "green"  # spec A2: no current liabilities is healthy
        else:
            statuses[key] = ratio_status(value, rule, True)[0]
    return statuses


def dimension_summary(statuses: dict[str, str]) -> dict[str, dict[str, int]]:
    """Counts of yellow and red ratios per financial dimension (Layer 1 features for the ML ablation)."""
    return {name: {"yellow": sum(statuses.get(k) == "yellow" for k in keys), "red": sum(statuses.get(k) == "red" for k in keys)}
            for name, keys in DIMENSIONS.items()}
