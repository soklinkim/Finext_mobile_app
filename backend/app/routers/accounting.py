from fastapi import APIRouter, Body, Depends, HTTPException, Query
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from app.business_time import BUSINESS_TZ
from typing import Annotated
import json

from app import db, loan_schedule, risk
from app.bookkeeping import PostingError, depreciation_entries, estimated_costs, journal_for, journal_response, loan_account_map, open_items, preview_impact, reversed_ids
from app.auth import current_sme
from app.accounting_validation import validate_bookkeeping_data, validate_opening_balances
from app.financial_statement import ACCOUNT_NAMES, DEBIT_NORMAL_ACCOUNTS, ONBOARDING_ACCOUNT_MAP, natural_balance
from app.health_ratio import RATIO_RULES, ratio_status
from app.snapshots import monthly_snapshots
from app.forecasting import forecast_income_expense
from app.loan_notifications import loan_notifications

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _validation_issues(user_id: str) -> list[dict[str, str]]:
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((row for row in db.get_table_rows(user_id, "settings") if row.get("id") == "app"), {})
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    return validate_bookkeeping_data(transactions, banks) + validate_opening_balances(opening, currency, rate)


def _ensure_valid_bookkeeping(user_id: str) -> None:
    issues = _validation_issues(user_id)
    if issues:
        detail = "; ".join(f"{issue['rowId']}: {issue['message']}" for issue in issues[:8])
        extra = f" (and {len(issues) - 8} more)" if len(issues) > 8 else ""
        raise HTTPException(status_code=422, detail=f"Bookkeeping validation failed: {detail}{extra}")

@router.get("/journal")
def journal(user_id: str = Depends(current_sme)):
    """Return generated double-entry postings for the signed-in user's synced entries."""
    _ensure_valid_bookkeeping(user_id)
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    depreciation_after = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
    return {"entries": journal_response(transactions, banks, depreciation_after)}


@router.get("/validation")
def validate_bookkeeping(user_id: str = Depends(current_sme)):
    issues = _validation_issues(user_id)
    return {"valid": not issues, "issues": issues}


@router.get("/accounts")
def accounts(user_id: str = Depends(current_sme)):
    # Authentication is intentional: all accounting endpoints share the same account boundary.
    return {"accounts": [{"code": code, "name": name} for code, name in ACCOUNT_NAMES.items()]}


@router.post("/preview")
def preview_entry(payload: dict = Body(...), user_id: str = Depends(current_sme)):
    """Preview the profit impact using the same server journal rules used on sync."""
    try:
        return preview_impact(payload, db.get_table_rows(user_id, "banks"), db.get_table_rows(user_id, "transactions"))
    except (PostingError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _effective_transactions(user_id: str) -> list[dict]:
    """Live entries minus reversed ones, for checks that read entries by type rather than via the journal.

    (Journal-based figures need no filter: a reversal posts the opposite lines.)"""
    rows = [tx for tx in db.get_table_rows(user_id, "transactions") if tx.get("deletedAt") is None]
    cancelled = reversed_ids(rows)
    return [tx for tx in rows if tx["id"] not in cancelled]


def _business_start(user_id: str) -> datetime | None:
    """When the business's records begin, for the ratio timeline (rules §10: "after the first complete month").

    Uses the profile's start date (the app stores DD/MM/YY; ISO is also accepted). A business that
    started fresh in Finext has none, so fall back to its opening balance date, then its first entry.
    """
    settings = next((s for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), {})
    raw = (settings.get("startOperationDate") or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).replace(tzinfo=BUSINESS_TZ)
        except ValueError:
            continue
    opening = [row.get("asOf") for row in db.get_table_rows(user_id, "onboarding_financial_entries") if row.get("asOf")]
    first_entry = [tx["occurredAt"] for tx in _effective_transactions(user_id)]
    candidates = opening or first_entry
    if not candidates:
        return None
    return datetime.fromtimestamp(min(candidates) / 1000, tz=BUSINESS_TZ)


def _minor_amount(amount: int, source: str, target: str, rate: int) -> int:
    if source == target:
        return amount
    if rate <= 0:
        return amount
    return round(amount * rate / 100) if source == "USD" else round(amount * 100 / rate)


def _statement_period(now: datetime, period: str):
    """Return comparable date windows and labels for a statement preset."""
    if period == "weekly":
        current_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        prior_start = current_start - timedelta(days=7)
        elapsed = now - current_start + timedelta(milliseconds=1)
        return (current_start, now + timedelta(milliseconds=1), prior_start, prior_start + elapsed,
                f"Week of {current_start.strftime('%d %b %Y')}", f"Week of {prior_start.strftime('%d %b %Y')}")

    if period == "monthly":
        current_start = datetime(now.year, now.month, 1, tzinfo=BUSINESS_TZ)
        prior_month = 12 if now.month == 1 else now.month - 1
        prior_year = now.year - 1 if now.month == 1 else now.year
        prior_start = datetime(prior_year, prior_month, 1, tzinfo=BUSINESS_TZ)
        elapsed = now - current_start + timedelta(milliseconds=1)
        prior_end = min(prior_start + elapsed, current_start)
        return (current_start, now + timedelta(milliseconds=1), prior_start, prior_end,
                current_start.strftime("%B %Y"), prior_start.strftime("%B %Y"))

    if period == "annual":
        current_start = datetime(now.year, 1, 1, tzinfo=BUSINESS_TZ)
        prior_start = datetime(now.year - 1, 1, 1, tzinfo=BUSINESS_TZ)
        # Same calendar date last year, not the same number of days: a leap year would shift it by one.
        try:
            prior_now = now.replace(year=now.year - 1)
        except ValueError:  # 29 February: compare with all of February last year
            prior_now = datetime(now.year - 1, 3, 1, tzinfo=BUSINESS_TZ) - timedelta(milliseconds=1)
        return (current_start, now + timedelta(milliseconds=1), prior_start, prior_now + timedelta(milliseconds=1),
                f"Year to date {now.year}", f"Year to date {now.year - 1}")

    raise HTTPException(status_code=400, detail="period must be weekly, monthly, or annual")


def _long_date(moment: datetime) -> str:
    return f"{moment.day} {moment.strftime('%B %Y')}"


def _heading_period(period: str, start: datetime, today: datetime) -> str:
    """"For the year ended 31 December 2025" once the period is over, else "For the period from ... to ..."."""
    if period == "weekly":
        last_day, word = start + timedelta(days=6), "week"
    elif period == "monthly":
        last_day, word = start.replace(day=monthrange(start.year, start.month)[1]), "month"
    else:
        last_day, word = start.replace(month=12, day=31), "year"
    if today.date() == last_day.date():
        return f"For the {word} ended {_long_date(today)}"
    return f"For the period from {_long_date(start)} to {_long_date(today)}"


@router.get("/statements")
def statements(user_id: str = Depends(current_sme), period: Annotated[str, Query()] = "monthly"):
    """Return statements for a selected period and comparable prior-period totals."""
    _ensure_valid_bookkeeping(user_id)
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    today = datetime.now(BUSINESS_TZ)
    current_start, current_end, prior_start, prior_end, period_name, prior_name = _statement_period(today, period)
    # Formal heading at the top of each statement: business, statement name, period (or "as at" date).
    business = (settings.get("businessName") or "FINEXT").strip().upper()
    for_period = _heading_period(period, current_start, today).upper()
    headings = {"income": [business, "STATEMENT OF COMPREHENSIVE INCOME", for_period],
                "balance": [business, "STATEMENT OF FINANCIAL POSITION", f"AS AT {_long_date(today).upper()}"],
                "cashflow": [business, "STATEMENT OF CASH FLOWS", for_period]}
    current_lines: dict[str, int] = {}
    prior_lines: dict[str, int] = {}
    historical_lines: dict[str, int] = {}
    balances: dict[str, int] = {}
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(transactions)
    costs = estimated_costs(transactions)

    def signed(line: dict, amount: int) -> int:
        return amount if line["side"] == "debit" else -amount

    for tx in transactions:
        if tx.get("deletedAt") is not None:
            continue
        lines = journal_for(tx, bank_kinds, loan_accounts, costs)
        when = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
        for line in lines:
            amount = _minor_amount(line["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
            code = line["accountCode"]
            balances[code] = balances.get(code, 0) + signed(line, amount)
            target = current_lines if current_start <= when < current_end else prior_lines if prior_start <= when < prior_end else None
            if target is not None:
                target[code] = target.get(code, 0) + signed(line, amount)
            if when < current_start:
                historical_lines[code] = historical_lines.get(code, 0) + signed(line, amount)

    # Balances entered during onboarding are opening positions. The source captures
    # assets separately in business_assets and statement values in this table.
    opening = [r for r in db.get_table_rows(user_id, "onboarding_financial_entries")
               if r.get("section") == "balance_sheet" and (r.get("asOf") or 0) <= int(today.timestamp() * 1000)]
    opening_as_of = max((row.get("asOf") or 0 for row in opening), default=0)
    for entry in depreciation_entries(transactions, after=opening_as_of):
        when = datetime.fromtimestamp(entry["date"] / 1000, tz=BUSINESS_TZ)
        for line in entry["lines"]:
            amount = _minor_amount(line["amount"], entry["currency"], currency, rate)
            code = line["accountCode"]
            balances[code] = balances.get(code, 0) + signed(line, amount)
            target = current_lines if current_start <= when < current_end else prior_lines if prior_start <= when < prior_end else None
            if target is not None:
                target[code] = target.get(code, 0) + signed(line, amount)
            if when < current_start:
                historical_lines[code] = historical_lines.get(code, 0) + signed(line, amount)
    for row in opening:
        code = ONBOARDING_ACCOUNT_MAP.get(row["entryKey"])
        if not code:
            continue
        amount = _minor_amount(row["amount"], row["currency"], currency, rate)
        balances[code] = balances.get(code, 0) + (amount if code in DEBIT_NORMAL_ACCOUNTS else -amount)

    def natural(codes: tuple[str, ...], period: dict[str, int] | None = None) -> int:
        values = period if period is not None else balances
        return natural_balance(codes, values)

    def pnl(values: dict[str, int]) -> dict[str, int]:
        revenue = natural(("4000", "4100"), values) - natural(("4900",), values)
        cogs = natural(("5000",), values)
        operating = natural(("6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990"), values)
        other = -values.get("4200", 0)
        interest = natural(("7000",), values)
        tax = natural(("7100",), values)
        gross = revenue - cogs
        operating_profit = gross - operating
        net = operating_profit + other - interest - tax
        return {"revenue": revenue, "cogs": cogs, "gross": gross, "operating": operating,
                "operating_profit": operating_profit, "other": other, "interest": interest, "tax": tax, "net": net}

    cur, prev = pnl(current_lines), pnl(prior_lines)

    def line(key: str, label: str, current: int, previous: int | None = None, style: str = "line"):
        value = {"key": key, "label": label, "current": current, "style": style}
        if previous is not None:
            value["prior"] = previous
        return value

    def operating_lines(values: dict[str, int], previous_values: dict[str, int]):
        groups = [
            ("salaries", "Salaries & wages", ("6100",)),
            ("rent", "Rent", ("6000",)),
            ("utilities", "Utilities", ("6200", "6300")),
            ("marketing", "Marketing & advertising", ("6500",)),
            ("transport", "Transport & delivery", ("6400",)),
            ("depreciation", "Depreciation", ("6800",)),
            ("otherOperating", "Other operating expenses", ("6600", "6700", "6900", "6950", "6990")),
        ]
        return [line(key, label, -natural(codes, values), -natural(codes, previous_values)) for key, label, codes in groups]

    income = {"kind": "income", "title": "Income Statement", "heading": headings["income"], "periodLabel": period_name, "currency": currency,
        "kpis": [{"label": "Revenue", "value": cur["revenue"], "format": "money"}, {"label": "Net profit", "value": cur["net"], "format": "money", "highlight": True}],
        "columnHeaders": [period_name, prior_name], "sections": [
            {"heading": "Revenue", "lines": [line("sales", "Sales revenue", cur["revenue"], prev["revenue"]), line("cogs", "Cost of goods sold", -cur["cogs"], -prev["cogs"]), line("gross", "Gross profit", cur["gross"], prev["gross"], style="subtotal")]},
            {"heading": "Operating expenses", "lines": operating_lines(current_lines, prior_lines) + [line("operating", "Total operating expenses", -cur["operating"], -prev["operating"], style="subtotal"), line("operatingProfit", "Operating profit", cur["operating_profit"], prev["operating_profit"], style="subtotal"), line("otherIncome", "Other income", cur["other"], prev["other"]), line("interest", "Interest expense", -cur["interest"], -prev["interest"]), line("pbt", "Profit before tax", cur["operating_profit"] + cur["other"] - cur["interest"], prev["operating_profit"] + prev["other"] - prev["interest"], style="subtotal"), line("tax", "Income tax", -cur["tax"], -prev["tax"]), line("net", "Net profit", cur["net"], prev["net"], style="total")]},
        ], "quickRatios": ([{"label": "Gross margin", "current": cur["gross"] / cur["revenue"], **({"prior": prev["gross"] / prev["revenue"]} if prev["revenue"] else {})}, {"label": "Net margin", "current": cur["net"] / cur["revenue"], **({"prior": prev["net"] / prev["revenue"]} if prev["revenue"] else {})}] if cur["revenue"] else [])}

    assets = natural(("1000", "1010", "1100", "1200", "1300", "1500", "1600")) - natural(("1590",))
    current_assets = natural(("1000", "1010", "1100", "1200", "1300"))
    current_liabilities = natural(("2000", "2100", "2200", "2300", "2400", "2500"))
    liabilities = current_liabilities + natural(("2600", "2700"))
    capital = natural(("3000",))
    # StatementMap: retained earnings brought forward = 3100 at the start of the period plus earlier
    # periods' net profit less earlier drawings; the drawings line shows this period's drawings only.
    drawings = natural(("3200",), current_lines)
    earlier_drawings = natural(("3200",)) - drawings
    historical_profit = pnl(historical_lines)["net"]
    retained = natural(("3100",)) + historical_profit - earlier_drawings
    equity_before_profit = capital + retained - drawings
    equity = equity_before_profit + cur["net"]
    balance_check = assets - liabilities - equity
    balance = {"kind": "balance", "title": "Balance Sheet", "heading": headings["balance"], "periodLabel": f"As at {today.strftime('%d %B %Y')}", "currency": currency,
        "kpis": [{"label": "Total assets", "value": assets, "format": "money"}, {"label": "Total liabilities", "value": liabilities, "format": "money"}, {"label": "Owner's equity", "value": equity, "format": "money"}],
        "columnHeaders": [today.strftime("%d %b %Y")], "sections": [
            {"heading": "Assets", "lines": [line("cash", "Cash & bank balances", natural(("1000", "1010"))), line("receivables", "Accounts receivable", natural(("1100",))), line("inventory", "Inventory", natural(("1200",))), line("prepaid", "Prepaid expenses", natural(("1300",))), line("currentAssets", "Total current assets", current_assets, style="subtotal"), line("equipment", "Property, equipment & vehicles (net)", natural(("1500",)) - natural(("1590",))), line("longAssets", "Other long-term assets", natural(("1600",))), line("assets", "TOTAL ASSETS", assets, style="total")]},
            {"heading": "Liabilities & owner's equity", "lines": [line("payables", "Accounts payable", natural(("2000",))), line("deposits", "Customer deposits", natural(("2100",))), line("accrued", "Accrued expenses & taxes payable", natural(("2200", "2300"))), line("shortLoans", "Short-term loans (bank / MFI)", natural(("2400",))), line("otherBorrowings", "Other short-term borrowings", natural(("2500",))), line("longLoans", "Long-term loans", natural(("2600",))), line("leases", "Lease obligations", natural(("2700",))), line("liabilities", "TOTAL LIABILITIES", liabilities, style="subtotal"), line("capital", "Owner's capital", capital), line("retained", "Retained earnings", retained), line("profit", "Net profit for the period", cur["net"]), line("drawings", "Less: owner's drawings", -drawings), line("equity", "TOTAL OWNER'S EQUITY", equity, style="subtotal"), line("totalLE", "TOTAL LIABILITIES & OWNER'S EQUITY", liabilities + equity, style="total")]},
        ], "check": {"label": "Balance check", "difference": balance_check}, "quickRatios": ([{"label": "Current ratio", "current": current_assets / current_liabilities}] if current_liabilities else []) + ([{"label": "Liabilities-to-equity", "current": liabilities / equity}] if equity else [])}

    cash = natural(("1000", "1010"))
    change = lambda code: natural((code,), current_lines)
    depreciation = natural(("6800",), current_lines)
    cash_operating = (cur["net"] + depreciation - change("1100") - change("1200") - change("1300")
                      + change("2000") + change("2100") + change("2200") + change("2300"))
    cash_investing = -(change("1500") - change("1590") + depreciation) - change("1600")
    cash_financing = (change("2400") + change("2500") + change("2600") + change("2700")
                      + change("3000") - change("3200"))
    net_cash_change = cash_operating + cash_investing + cash_financing
    opening_cash = cash - natural(("1000", "1010"), current_lines)
    cashflow = {"kind": "cashflow", "title": "Cash Flow Statement", "heading": headings["cashflow"], "periodLabel": period_name, "currency": currency,
        "kpis": [{"label": "Net cash change", "value": net_cash_change, "format": "money", "highlight": True}], "columnHeaders": [period_name],
        "sections": [{"heading": "Operating activities", "lines": [line("netProfit", "Net profit", cur["net"]), line("depreciation", "Add back: depreciation", depreciation), line("receivables", "Change in accounts receivable", -change("1100")), line("inventory", "Change in inventory", -change("1200")), line("prepaid", "Change in prepaid assets", -change("1300")), line("payables", "Change in accounts payable", change("2000")), line("deposits", "Change in customer deposits", change("2100")), line("accrued", "Change in accrued expenses & tax", change("2200") + change("2300")), line("operatingCash", "Net cash from operating activities", cash_operating, style="subtotal")]},
                      {"heading": "Investing activities", "lines": [line("equipmentCash", "Property & equipment", -(change("1500") - change("1590") + depreciation)), line("otherAssetsCash", "Other long-term assets", -change("1600")), line("investingCash", "Net cash from investing activities", cash_investing, style="subtotal")]},
                      {"heading": "Financing activities", "lines": [line("debtCash", "Loans & lease obligations", change("2400") + change("2500") + change("2600") + change("2700")), line("capitalCash", "Owner's capital contributed", change("3000")), line("drawingsCash", "Less: owner's drawings", -change("3200")), line("financingCash", "Net cash from financing activities", cash_financing, style="subtotal"), line("netCash", "Net increase / (decrease) in cash", net_cash_change, style="total"), line("openingCash", "Cash at start of period", opening_cash), line("closingCash", "Cash at end of period", opening_cash + net_cash_change)]}],
        "check": {"label": "Cash flow check", "difference": cash - (opening_cash + net_cash_change)}}
    return {"business": settings.get("businessName") or "FINEXT", "period": period_name,
            "income": income, "balance": balance, "cashflow": cashflow,
            "_metrics": {"current": cur, "prior": prev, "balances": balances,
                         "periodMovements": current_lines, "cashOperating": cash_operating,
                         "cashInvesting": cash_investing, "cashFinancing": cash_financing}}


@router.get("/snapshots")
def snapshots(user_id: str = Depends(current_sme)):
    """Stage A monthly feature snapshots (AI pipeline spec §2), one per complete month."""
    _ensure_valid_bookkeeping(user_id)
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    return {"snapshots": monthly_snapshots(db.get_table_rows(user_id, "transactions"),
                                           db.get_table_rows(user_id, "banks", include_deleted=True), settings,
                                           db.get_table_rows(user_id, "onboarding_financial_entries"))}


def _risk(user_id: str, proposed: dict | None = None) -> dict:
    _ensure_valid_bookkeeping(user_id)
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    return risk.assess(db.get_table_rows(user_id, "transactions"), db.get_table_rows(user_id, "banks", include_deleted=True),
                       settings, db.get_table_rows(user_id, "onboarding_financial_entries"), proposed)


@router.get("/risk")
def future_risk(user_id: str = Depends(current_sme)):
    """Layer 2 for the financial health dashboard: distress risk within 12 months (model) and debt capacity."""
    return _risk(user_id)


@router.post("/risk/loan-check")
def loan_check(loan: Annotated[dict, Body()], user_id: str = Depends(current_sme)):
    """The same, as if a proposed loan (amount, termMonths, annualInterestRate, rateType, repaymentFrequency,
    optional installmentAmount) were taken: can the business afford it, and how does its risk change?"""
    try:
        proposed = risk.validate_proposed_loan(loan)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _risk(user_id, proposed)


@router.get("/summary")
def summary(user_id: str = Depends(current_sme)):
    """Return server-calculated bookkeeping totals for the summary hero."""
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(transactions)
    costs = estimated_costs(transactions)
    revenue_codes = {"4000", "4100", "4200", "4900"}
    expense_codes = {"5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    total_income = total_expense = 0
    for tx in transactions:
        if tx.get("deletedAt") is not None:
            continue
        for posting in journal_for(tx, bank_kinds, loan_accounts, costs):
            amount = _minor_amount(posting["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
            code = posting["accountCode"]
            if code in revenue_codes:
                total_income += amount if posting["side"] == "credit" else -amount
            elif code in expense_codes:
                total_expense += amount if posting["side"] == "debit" else -amount
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    opening_as_of = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
    for entry in depreciation_entries(transactions, after=opening_as_of):
        total_expense += _minor_amount(entry["lines"][0]["amount"], entry["currency"], currency, rate)

    report = statements(user_id, period="monthly")
    cash = next((line["current"] for section in report["balance"]["sections"] for line in section["lines"] if line["key"] == "cash"), 0)
    budget = next((b for b in db.get_table_rows(user_id, "budgets") if b.get("deletedAt") is None), None)
    target = _minor_amount(budget["targetAmount"], budget["currency"], currency, rate) if budget else 0
    percent = round(total_expense / target * 100) if target > 0 else 0
    status = "danger" if percent >= 100 else "warning" if percent >= 70 else "ok"
    return {"displayCurrency": currency, "totalBalance": cash, "totalExpense": total_expense,
            "totalIncome": total_income, "budgetTarget": target, "budgetPercent": percent,
            "budgetStatus": status}


def _complete_quarter(now: datetime) -> tuple[datetime, datetime]:
    first_month = ((now.month - 1) // 3) * 3 + 1
    end = datetime(now.year, first_month, 1, tzinfo=BUSINESS_TZ)
    start_month = first_month - 3
    year = now.year
    if start_month <= 0:
        start_month += 12
        year -= 1
    return datetime(year, start_month, 1, tzinfo=BUSINESS_TZ), end


def _quarter_profit(user_id: str, currency: str, rate: int, start: datetime, end: datetime) -> dict[str, int]:
    tx_rows = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(tx_rows)
    costs = estimated_costs(tx_rows)
    activity: dict[str, int] = {}
    for tx in tx_rows:
        if tx.get("deletedAt") is not None:
            continue
        occurred = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
        if not start <= occurred < end:
            continue
        for posting in journal_for(tx, bank_kinds, loan_accounts, costs):
            amount = _minor_amount(posting["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
            activity[posting["accountCode"]] = activity.get(posting["accountCode"], 0) + (amount if posting["side"] == "debit" else -amount)
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    opening_as_of = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
    for entry in depreciation_entries(tx_rows, after=opening_as_of):
        booked = datetime.fromtimestamp(entry["date"] / 1000, tz=BUSINESS_TZ)
        if not start <= booked < end:
            continue
        for posting in entry["lines"]:
            amount = _minor_amount(posting["amount"], entry["currency"], currency, rate)
            activity[posting["accountCode"]] = activity.get(posting["accountCode"], 0) + (amount if posting["side"] == "debit" else -amount)
    debit = {"4900", "5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    natural = lambda codes: sum(activity.get(code, 0) if code in debit else -activity.get(code, 0) for code in codes)
    revenue = natural(("4000", "4100")) - natural(("4900",))
    cogs = natural(("5000",))
    operating = natural(("6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990"))
    other = -activity.get("4200", 0)
    interest = natural(("7000",))
    operating_profit = revenue - cogs - operating
    depreciation = natural(("6800",))
    # Rules §9.3 / §12 Q7: EBIT = operating profit and EBITDA = operating profit + depreciation, both without
    # other income (4200), so a one-off grant or asset sale does not flatter normal performance.
    return {"revenue": revenue, "cogs": cogs, "operating": operating, "other": other, "interest": interest,
            "depreciation": depreciation, "ebit": operating_profit, "ebitda": operating_profit + depreciation}


def _scheduled_debt_service(user_id: str, currency: str, rate: int, start: datetime, end: datetime) -> tuple[int, bool]:
    tx_rows = _effective_transactions(user_id)
    repaid: dict[str, int] = {}
    loans = []
    for tx in tx_rows:
        if tx.get("deletedAt") is not None:
            continue
        try:
            meta = json.loads(tx.get("meta") or "{}")
        except (TypeError, json.JSONDecodeError):
            meta = {}
        if tx["typeId"] == "loan_received":
            loans.append((tx, meta, str(meta.get("lender") or tx.get("counterparty") or "").strip().casefold()))
        elif tx["typeId"] == "loan_repayment":
            name = str(meta.get("loanName") or "").strip().casefold()
            principal = max(0, tx["amount"] - int(meta.get("interest") or 0))
            repaid[name] = repaid.get(name, 0) + _minor_amount(principal, tx["currency"], currency, tx.get("exchangeRate", rate))

    due_total = 0
    missing_schedule = False
    for loan, meta, name in loans:
        principal = _minor_amount(loan["amount"], loan["currency"], currency, loan.get("exchangeRate", rate))
        if principal - repaid.get(name, 0) <= 0:
            continue
        instalments, source = loan_schedule.schedule(loan, meta)
        if source == "missing":
            missing_schedule = True
            continue
        for due, amount in instalments:
            if start <= due < end:
                due_total += _minor_amount(amount, loan["currency"], currency, loan.get("exchangeRate", rate))
    return due_total, missing_schedule


@router.get("/ratios")
def ratios(user_id: str = Depends(current_sme)):
    """Calculate supported workbook ratios and apply inclusive yellow/red thresholds."""
    report = statements(user_id, period="monthly")
    metrics = report["_metrics"]
    pnl = metrics["current"]
    prev = metrics["prior"]
    balances = metrics["balances"]
    movements = metrics["periodMovements"]
    income_lines = {line["key"]: line["current"] for section in report["income"]["sections"] for line in section["lines"]}
    balance_lines = {line["key"]: line["current"] for section in report["balance"]["sections"] for line in section["lines"]}
    days = datetime.now(BUSINESS_TZ).day
    month_start = datetime.now(BUSINESS_TZ).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    now = datetime.now(BUSINESS_TZ)
    enough_month = False
    enough_quarter = False
    began = _business_start(user_id)
    if began:
        due_year = began.year + (1 if began.month == 12 else 0)
        due_month = 1 if began.month == 12 else began.month + 1
        due_day = min(began.day, monthrange(due_year, due_month)[1])
        enough_month = now >= began.replace(year=due_year, month=due_month, day=due_day)
    quarter_start, quarter_end = _complete_quarter(now)
    if began:
        enough_quarter = began <= quarter_start
    revenue = pnl["revenue"]
    ebitda = pnl["operating_profit"] + movements.get("6800", 0)
    assets = balance_lines.get("assets", 0)
    equity = balance_lines.get("equity", 0)
    current_assets = balance_lines.get("currentAssets", 0)
    current_liabilities = sum(balance_lines.get(k, 0) for k in ("payables", "deposits", "accrued", "shortLoans", "otherBorrowings"))
    debt = sum(max(0, -balances.get(k, 0)) for k in ("2400", "2500", "2600", "2700"))
    # Balance-sheet ratios start at onboarding, but only once something is recorded: with nothing yet,
    # equity is 0 and debt-to-equity would read as "negative equity".
    has_position = assets > 0 or balance_lines.get("liabilities", 0) > 0
    interest = pnl["interest"]
    # Convert credit sales to the report currency using each transaction's saved rate.
    currency = report["balance"]["currency"]
    rate = next((s.get("rateKhrPerUsd", 4000) for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), 4000)
    quarter_pnl = _quarter_profit(user_id, currency, rate, quarter_start, quarter_end)
    scheduled_due, missing_schedule = _scheduled_debt_service(user_id, currency, rate, quarter_start, quarter_end)
    credit_sales = sum(_minor_amount(tx["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
                       for tx in _effective_transactions(user_id)
                       if tx.get("payMethod") == "later" and tx.get("typeId") in {"product_sale", "service_income"}
                       and datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ) >= month_start)
    current_inventory = balance_lines.get("inventory", 0)
    opening_inventory = current_inventory - movements.get("1200", 0)
    average_inventory = (current_inventory + opening_inventory) / 2
    current_receivable = balance_lines.get("receivables", 0)
    opening_receivable = current_receivable - movements.get("1100", 0)
    average_receivable = (current_receivable + opening_receivable) / 2
    specs = [
        ("current_ratio", "Current ratio", current_assets / current_liabilities if current_liabilities else None, True),
        ("gross_margin", "Gross profit margin", pnl["gross"] / revenue if revenue else None, enough_month),
        ("net_margin", "Net profit margin", pnl["net"] / revenue if revenue else None, enough_month),
        ("ebitda_margin", "EBITDA margin", ebitda / revenue if revenue else None, enough_month),
        ("inventory_days", "Inventory days", average_inventory / pnl["cogs"] * days if pnl["cogs"] else None, enough_month),
        ("receivable_days", "Receivable days", average_receivable / credit_sales * days if credit_sales else None, enough_month),
        ("revenue_growth", "Revenue growth", (revenue - prev["revenue"]) / prev["revenue"] if prev["revenue"] else None, bool(prev["revenue"])),
        ("operating_expense_ratio", "Operating expense ratio", pnl["operating"] / revenue if revenue else None, enough_month),
        ("debt_to_equity", "Debt-to-equity", debt / equity if equity > 0 else None, has_position),
        ("interest_coverage", "Interest coverage", quarter_pnl["ebit"] / quarter_pnl["interest"] if quarter_pnl["interest"] else None, enough_quarter),
        ("debt_to_asset", "Debt-to-asset", debt / assets if assets > 0 else None, True),
        ("dscr", "Debt service coverage", quarter_pnl["ebitda"] / scheduled_due if scheduled_due else None, enough_quarter and not missing_schedule),
    ]
    results = []
    for key, label, value, started in specs:
        rule = RATIO_RULES[key]
        if key == "debt_to_equity" and has_position and equity <= 0:
            status, message = "red", "Negative equity"
        elif key == "interest_coverage" and quarter_pnl["interest"] == 0:
            status, message = "green", "No interest"
            value = None
        elif key == "dscr" and missing_schedule:
            status, message = "not_available", "Loan repayment schedule is not available"
        elif key == "dscr" and scheduled_due == 0:
            status, message = "green", "No repayments due"
            value = None
        elif value is None or not started:
            status, message = "not_available", ("Complete quarter data is not available" if key in {"interest_coverage", "dscr"} else "Not enough data yet")
        else:
            status, message = ratio_status(value, rule, started)
        results.append({"id": key, "label": label, "value": value, "status": status,
                        "benchmark": rule["benchmark"], "yellow": rule["yellow"], "red": rule["red"], "betterWhen": rule["better"],
                        "message": message})
    return {"period": report["period"], "ratios": results}


def either_or_both(first: str, second: str) -> str | None:
    """Pipeline spec B2, triggers 4, 12 and 13: either ratio at its line raises the alert;
    both at their lines raise its severity by one level (yellow becomes red)."""
    flagged = [status for status in (first, second) if status in {"yellow", "red"}]
    if not flagged:
        return None
    return "red" if "red" in flagged or len(flagged) == 2 else "yellow"


@router.get("/health")
def health(user_id: str = Depends(current_sme)):
    result = ratios(user_id)
    now_dt = datetime.now(BUSINESS_TZ)
    now = int(now_dt.timestamp() * 1000)
    ratio_map = {item["id"]: item for item in result["ratios"]}
    generated: list[dict] = []

    def alert(trigger: str, title: str, level: str, body: str, action: str, values: dict):
        generated.append({"id": f"{trigger}-{result['period']}", "triggerId": trigger,
                          "group": "today", "type": "advice", "title": title, "body": body,
                          "detail": action, "at": now, "level": level, "values": values})

    def single(trigger: str, ratio_id: str, title: str, action: str):
        item = ratio_map[ratio_id]
        if item["status"] in {"yellow", "red"}:
            value = item["value"]
            display = f"{value:.2f}" if value is not None else item.get("message", "unavailable")
            alert(trigger, title, item["status"], f"{item['label']}: {display}.", action,
                  {"ratio": ratio_id, "value": value})

    single("sales_fall", "revenue_growth", "Sales are falling", "Compare with the same month last year and review top customers and products.")
    single("gross_margin", "gross_margin", "Gross margin is low", "Compare unit costs with recent purchases and review discounts.")
    single("overheads", "operating_expense_ratio", "Overheads are high", "Compare expense categories with bills and freeze non-essential spend.")
    single("stock_days", "inventory_days", "Stock is taking longer to sell", "Review slow-moving stock and check the latest stock count.")
    single("liquidity", "current_ratio", "Short-term bills may be at risk", "Collect receivables, reduce slow stock, and review short-term debt.")

    def paired(trigger: str, title: str, first_id: str, second_id: str, action: str) -> None:
        first, second = ratio_map[first_id], ratio_map[second_id]
        level = either_or_both(first["status"], second["status"])
        if level:
            flagged = [item["label"] for item in (first, second) if item["status"] in {"yellow", "red"}]
            alert(trigger, title, level, " and ".join(flagged) + (" are" if len(flagged) == 2 else " is") + " past the watch level.",
                  action, {first_id: first["value"], second_id: second["value"]})

    paired("thin_profit", "Profit margins need attention", "net_margin", "ebitda_margin",
           "Review which cost lines and products are driving the change.")
    paired("debt_load", "Debt load is high", "debt_to_equity", "debt_to_asset",
           "Avoid new borrowing, retain earnings, and review owner drawings.")
    paired("loan_coverage", "Loan payments may be difficult", "interest_coverage", "dscr",
           "Talk to the lender early, cut costs, and delay equipment purchases.")

    runway, runway_values = _cash_runway(user_id)
    if runway is not None and runway < 1:
        level = "red" if runway < 0.5 else "yellow"
        alert("cash_runway", "Cash runway is short", level, f"Cash covers about {runway:.1f} months of usual expenses.",
              "Delay non-urgent purchases, chase receivables, and list payments due in 14 days.", runway_values)

    falling_cash = _cash_profit_trend(user_id)
    if len(falling_cash) >= 2 and all(item["cashChange"] < 0 and item["profit"] > 0 for item in falling_cash[-2:]):
        red = len(falling_cash) >= 3 and all(item["cashChange"] < 0 and item["profit"] > 0 for item in falling_cash[-3:])
        alert("profit_not_cash", "Profit is not turning into cash", "red" if red else "yellow",
              f"Cash fell for {3 if red else 2} months while reported profit remained positive.",
              "Review whether cash is tied up in stock, unpaid customer balances, debt repayments, or drawings.",
              {"months": falling_cash[-3:] if red else falling_cash[-2:]})

    spike, spike_values = _sales_spike(user_id)
    if spike is not None and spike >= 1.5:
        level = "red" if spike >= 2 else "yellow"
        alert("sales_spike", "Sales are unusually high", level,
              f"Projected revenue is {spike:.0%} of the average for the last three complete months.",
              "Confirm large entries and check for duplicates or customer deposits entered as sales.", spike_values)

    # Spec triggers 7 and 8: pay-later amounts left unpaid for too long (days since the entry).
    settings_row = next((s for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), {})
    display_currency = settings_row.get("displayCurrency", "USD")
    day_ms = 86_400_000
    # Customers: days past their payment terms (trigger 7). Suppliers: days since the bill (trigger 8).
    owed: dict[str, list[tuple[int, int]]] = {"in": [], "out": []}  # direction -> [(days, amount)]
    for item in open_items(db.get_table_rows(user_id, "transactions")):
        amount = _minor_amount(item["open"], item["currency"], display_currency, item.get("exchangeRate") or settings_row.get("rateKhrPerUsd", 4000))
        since = item["dueAt"] if item["direction"] == "in" else item["occurredAt"]
        owed[item["direction"]].append(((now - since) // day_ms, amount))

    def overdue(direction: str, yellow_days: int, red_days: int) -> tuple[str | None, dict]:
        late = [(age, amount) for age, amount in owed[direction] if age >= yellow_days]
        values = {"count": len(late), "amount": sum(a for _, a in late), "oldestDays": max((age for age, _ in late), default=0),
                  "currency": display_currency}
        if any(age >= red_days for age, _ in late):
            return "red", values
        return ("yellow" if late else None), values

    level, values = overdue("in", 30, 60)
    receivable = ratio_map["receivable_days"]["status"]
    if receivable == "red" or (receivable == "yellow" and level is None):
        level = receivable
    if level:
        alert("slow_customers", "Customers are slow to pay", level,
              f"{values['count']} unpaid customer balance(s) are {values['oldestDays']}+ days past their payment terms." if values["count"]
              else "Customers are taking longer than usual to pay.",
              "Remind the largest overdue accounts first, ask for a deposit, shorten terms, or pause credit.", values)

    level, values = overdue("out", 45, 60)
    if level:
        alert("overdue_suppliers", "Supplier bills are overdue", level,
              f"{values['count']} supplier bill(s) unpaid for {values['oldestDays']}+ days.",
              "Pay the oldest and smallest bills first, and record payments with Mark as paid.", values)

    month_start = datetime(now_dt.year, now_dt.month, 1, tzinfo=BUSINESS_TZ)
    new_loan = any(tx["typeId"] == "loan_received"
                   and datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ) >= month_start
                   for tx in _effective_transactions(user_id))
    if new_loan and (ratio_map["dscr"]["status"] in {"yellow", "red"} or (runway is not None and runway < 0.5)):
        alert("new_loan_while_weak", "New borrowing while cash is tight", "red",
              "A new loan was recorded while debt coverage or cash runway is below its safe level.",
              "Review the instalment schedule and cash forecast before committing to more borrowing.",
              {"dscr": ratio_map["dscr"]["value"], "cashRunway": runway})

    # Partner-bank updates (opened, reviewing, decided) appear first, at the time they happened.
    generated = loan_notifications(user_id) + generated

    # Reuse a stable id for each trigger and month. Persist values and preserve dismissal.
    existing = {row["id"]: row for row in db.get_table_rows(user_id, "health_alerts")}
    stored = []
    to_save = []
    for item in generated:
        old = existing.get(item["id"])
        if old and old.get("dismissedAt") is not None:
            continue
        created = old.get("createdAt") if old else now
        row = {"id": item["id"], "createdAt": created, "updatedAt": now,
               "deletedAt": None, "triggerId": item["triggerId"], "level": item["level"],
               "values": json.dumps(item["values"]), "dismissedAt": None}
        if not old or old.get("updatedAt", 0) < now:
            to_save.append(row)
        stored.append({**item, "at": item["at"] if item["triggerId"].startswith("loan_") else created})
    if to_save:
        db.upsert_rows(user_id, "health_alerts", to_save)  # one round trip for all alerts
    return {"alerts": stored, "ratios": result["ratios"]}


def _cash_runway(user_id: str) -> tuple[float | None, dict]:
    report = statements(user_id, period="monthly")
    currency = report["balance"]["currency"]
    cash = next((line["current"] for section in report["balance"]["sections"] for line in section["lines"] if line["key"] == "cash"), 0)
    settings = next((s for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), {})
    rate = settings.get("rateKhrPerUsd", 4000)
    now = datetime.now(BUSINESS_TZ)
    current_month = datetime(now.year, now.month, 1, tzinfo=BUSINESS_TZ)
    month_index = current_month.year * 12 + current_month.month - 1
    year, month_zero = divmod(month_index - 3, 12)
    start = datetime(year, month_zero + 1, 1, tzinfo=BUSINESS_TZ)
    # Rules §12 Q8: usual monthly expenses = average over the last 3 complete months of COGS + operating
    # expenses - depreciation (depreciation uses no cash). Interest and tax are left out.
    months = _quarter_profit(user_id, currency, rate, start, current_month)
    total = months["cogs"] + months["operating"] - months["depreciation"]
    average = total / 3
    return (cash / average if average > 0 else None), {"cash": cash, "usualMonthlyExpenses": average}


def _sales_spike(user_id: str) -> tuple[float | None, dict]:
    settings = next((s for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), {})
    currency = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    now = datetime.now(BUSINESS_TZ)
    month_start = datetime(now.year, now.month, 1, tzinfo=BUSINESS_TZ)
    month_index = now.year * 12 + now.month - 1
    months: list[tuple[datetime, datetime]] = []
    for offset in (3, 2, 1):
        index = month_index - offset
        year, month_zero = divmod(index, 12)
        start = datetime(year, month_zero + 1, 1, tzinfo=BUSINESS_TZ)
        end_index = index + 1
        end_year, end_month_zero = divmod(end_index, 12)
        months.append((start, datetime(end_year, end_month_zero + 1, 1, tzinfo=BUSINESS_TZ)))
    # Rules §12 Q11: only from month 4, once three complete months of records exist to average.
    began = _business_start(user_id)
    if began is None or began > months[0][0]:
        return None, {}
    txs = _effective_transactions(user_id)
    history = [0, 0, 0]
    current = 0
    for tx in txs:
        if tx["typeId"] not in {"product_sale", "service_income"}:
            continue
        occurred = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
        amount = _minor_amount(tx["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
        if month_start <= occurred < now:
            current += amount
        for i, (start, end) in enumerate(months):
            if start <= occurred < end:
                history[i] += amount
                break
    average = sum(history) / 3
    if average <= 0:
        return None, {}
    projected = current * monthrange(now.year, now.month)[1] / max(1, now.day)
    value = projected / average
    return value, {"projectedMonthRevenue": projected, "threeMonthAverage": average}


def _cash_profit_trend(user_id: str) -> list[dict]:
    now = datetime.now(BUSINESS_TZ)
    current = datetime(now.year, now.month, 1, tzinfo=BUSINESS_TZ)
    month_index = current.year * 12 + current.month - 1
    windows = []
    for offset in (3, 2, 1):
        index = month_index - offset
        year, month_zero = divmod(index, 12)
        start = datetime(year, month_zero + 1, 1, tzinfo=BUSINESS_TZ)
        end_index = index + 1
        end_year, end_month_zero = divmod(end_index, 12)
        windows.append((start, datetime(end_year, end_month_zero + 1, 1, tzinfo=BUSINESS_TZ)))
    tx_rows = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((s for s in db.get_table_rows(user_id, "settings") if s.get("id") == "app"), {})
    currency, rate = settings.get("displayCurrency", "USD"), settings.get("rateKhrPerUsd", 4000)
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(tx_rows)
    costs = estimated_costs(tx_rows)
    output = []
    revenue_codes = {"4000", "4100", "4200", "4900"}
    expense_codes = {"5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    debit_codes = {"4900", "5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    for start, end in windows:
        p_and_l: dict[str, int] = {}
        cash_change = 0
        for tx in tx_rows:
            if tx.get("deletedAt") is not None:
                continue
            occurred = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
            if not start <= occurred < end:
                continue
            for line in journal_for(tx, bank_kinds, loan_accounts, costs):
                code = line["accountCode"]
                value = _minor_amount(line["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
                signed = value if line["side"] == "debit" else -value
                if code in {"1000", "1010"}:
                    cash_change += signed
                if code in revenue_codes or code in expense_codes:
                    p_and_l[code] = p_and_l.get(code, 0) + signed
        opening = db.get_table_rows(user_id, "onboarding_financial_entries")
        opening_as_of = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
        for entry in depreciation_entries(tx_rows, after=opening_as_of):
            booked = datetime.fromtimestamp(entry["date"] / 1000, tz=BUSINESS_TZ)
            if start <= booked < end:
                amount = _minor_amount(entry["lines"][0]["amount"], entry["currency"], currency, rate)
                p_and_l["6800"] = p_and_l.get("6800", 0) + amount
        def natural(codes):
            return sum(p_and_l.get(code, 0) if code in debit_codes else -p_and_l.get(code, 0) for code in codes)
        revenue = natural(("4000", "4100")) - natural(("4900",))
        cogs = natural(("5000",))
        operating = natural(("6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990"))
        net = revenue - cogs - operating + natural(("4200",)) - natural(("7000",)) - natural(("7100",))
        output.append({"month": start.strftime("%Y-%m"), "cashChange": cash_change, "profit": net})
    return output


@router.post("/health/{alert_id}/dismiss")
def dismiss_health_alert(alert_id: str, user_id: str = Depends(current_sme)):
    row = next((item for item in db.get_table_rows(user_id, "health_alerts") if item["id"] == alert_id), None)
    if row is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="alert not found")
    now = int(datetime.now(BUSINESS_TZ).timestamp() * 1000)
    row["dismissedAt"] = now
    row["updatedAt"] = now
    db.upsert_rows(user_id, "health_alerts", [row])
    return {"dismissed": True}


def _activity_rows(user_id: str):
    _ensure_valid_bookkeeping(user_id)
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    target = settings.get("displayCurrency", "USD")
    rate = settings.get("rateKhrPerUsd", 4000)
    kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(transactions)
    costs = estimated_costs(transactions)
    expenses = {"5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    revenue = {"4000", "4100", "4200", "4900"}
    output = []
    for tx in transactions:
        if tx.get("deletedAt") is not None:
            continue
        inc = exp = 0
        for line in journal_for(tx, kinds, loan_accounts, costs):
            amount = _minor_amount(line["amount"], tx["currency"], target, tx.get("exchangeRate", rate))
            code = line["accountCode"]
            if code in revenue:
                inc += amount if line["side"] == "credit" else -amount
            elif code in expenses:
                exp += amount if line["side"] == "debit" else -amount
        output.append({"date": tx["occurredAt"], "income": inc, "expense": exp,
                       "typeId": tx["typeId"], "currency": target})
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    opening_as_of = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
    for entry in depreciation_entries(transactions, after=opening_as_of):
        amount = _minor_amount(entry["lines"][0]["amount"], entry["currency"], target, rate)
        output.append({"date": entry["date"], "income": 0, "expense": amount,
                       "typeId": "system_depreciation", "currency": target})
    return output, target


@router.get("/forecast")
def forecast(user_id: str = Depends(current_sme)):
    """Return an experimental, user-scoped income and expense trend forecast."""
    _ensure_valid_bookkeeping(user_id)
    transactions = db.get_table_rows(user_id, "transactions")
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    settings = next((row for row in db.get_table_rows(user_id, "settings") if row.get("id") == "app"), {})
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    return forecast_income_expense(transactions, banks, settings, opening)


@router.get("/analysis")
def analysis(period: str = "daily", user_id: str = Depends(current_sme)):
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="period must be daily, weekly, monthly, or yearly")
    rows, currency = _activity_rows(user_id)
    now = datetime.now(BUSINESS_TZ)
    if period == "daily":
        # This week, Monday to Sunday (days still to come show as empty bars), matching "weekly".
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        monday = today - timedelta(days=today.weekday())
        starts = [monday + timedelta(days=i) for i in range(7)]
        labels = [d.strftime("%a") for d in starts]
        buckets = starts
        ends = starts[1:] + [starts[-1] + timedelta(days=1)]
    elif period == "weekly":
        anchor = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = anchor - timedelta(days=anchor.weekday())
        starts = [week_start - timedelta(days=7 * i) for i in range(3, -1, -1)]
        labels = [f"Week {i + 1}" for i in range(4)]
        buckets = starts
        ends = starts[1:] + [starts[-1] + timedelta(days=7)]
    elif period == "monthly":
        starts = [datetime(now.year, m, 1, tzinfo=BUSINESS_TZ) for m in range(1, 13)]
        labels = [d.strftime("%b") for d in starts]
        buckets = starts
        ends = starts[1:] + [datetime(now.year + 1, 1, 1, tzinfo=BUSINESS_TZ)]
    else:
        years = list(range(now.year - 4, now.year + 1))
        starts = [datetime(y, 1, 1, tzinfo=BUSINESS_TZ) for y in years]
        labels = [str(y) for y in years]
        buckets = starts
        ends = starts[1:] + [datetime(now.year + 1, 1, 1, tzinfo=BUSINESS_TZ)]
    incomes = [0] * len(buckets)
    expenses = [0] * len(buckets)
    for row in rows:
        date = datetime.fromtimestamp(row["date"] / 1000, tz=BUSINESS_TZ)
        for i, (start, end) in enumerate(zip(buckets, ends)):
            if start <= date < end:
                incomes[i] += row["income"]
                expenses[i] += row["expense"]
                break
    return {"period": period, "currency": currency, "labels": labels,
            "income": incomes, "expense": expenses,
            "totals": {"income": sum(incomes), "expense": sum(expenses)}}


@router.get("/categories")
def categories(user_id: str = Depends(current_sme)):
    rows, currency = _activity_rows(user_id)
    now = datetime.now(BUSINESS_TZ)
    start = datetime(now.year, now.month, 1, tzinfo=BUSINESS_TZ)
    account_groups: dict[str, int] = {}
    transactions = {tx["id"]: tx for tx in db.get_table_rows(user_id, "transactions") if tx.get("deletedAt") is None}
    banks = db.get_table_rows(user_id, "banks", include_deleted=True)
    kinds = {b["id"]: b["kind"] for b in banks}
    loan_accounts = loan_account_map(list(transactions.values()))
    costs = estimated_costs(list(transactions.values()))
    settings = next((r for r in db.get_table_rows(user_id, "settings") if r.get("id") == "app"), {})
    rate = settings.get("rateKhrPerUsd", 4000)
    expenses = {"5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    for tx in transactions.values():
        if datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ) < start:
            continue
        for line in journal_for(tx, kinds, loan_accounts, costs):
            if line["accountCode"] not in expenses or line["side"] != "debit":
                continue
            code = line["accountCode"]
            amount = _minor_amount(line["amount"], tx["currency"], currency, tx.get("exchangeRate", rate))
            account_groups[code] = account_groups.get(code, 0) + amount
    opening = db.get_table_rows(user_id, "onboarding_financial_entries")
    opening_as_of = max((row.get("asOf") or 0 for row in opening if row.get("section") == "balance_sheet"), default=0)
    for entry in depreciation_entries(list(transactions.values()), after=opening_as_of):
        if datetime.fromtimestamp(entry["date"] / 1000, tz=BUSINESS_TZ) >= start:
            code = "6800"
            amount = _minor_amount(entry["lines"][0]["amount"], entry["currency"], currency, rate)
            account_groups[code] = account_groups.get(code, 0) + amount
    total = sum(account_groups.values())
    return [{"categoryId": code, "name": ACCOUNT_NAMES.get(code, code), "percent": amount / total * 100 if total else 0,
             "amount": amount, "currency": currency}
            for code, amount in sorted(account_groups.items(), key=lambda entry: entry[1], reverse=True)]
