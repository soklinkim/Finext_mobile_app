"""Consistency checks applied before bookkeeping reports are generated."""
from collections import Counter

from app.bookkeeping import PostingError, _meta, journal_for, loan_account_map, reversed_ids
from app.financial_statement import DEBIT_NORMAL_ACCOUNTS, ONBOARDING_ACCOUNT_MAP


def validate_bookkeeping_data(transactions: list[dict], banks: list[dict]) -> list[dict[str, str]]:
    """Validate active entries, their account references, and loan principal balances."""
    issues: list[dict[str, str]] = []
    bank_kinds = {bank["id"]: bank["kind"] for bank in banks}
    duplicates = {tx_id for tx_id, count in Counter(tx.get("id") for tx in transactions).items() if count > 1}
    for tx_id in sorted(item for item in duplicates if item):
        issues.append({"rowId": str(tx_id), "message": "duplicate transaction id"})
    active = [tx for tx in transactions if tx.get("deletedAt") is None]
    try:
        loan_accounts = loan_account_map(active)
    except (PostingError, TypeError, ValueError) as exc:
        issues.append({"rowId": "loans", "message": f"loan records: {exc}"})
        loan_accounts = {}
    loan_principal: dict[str, int] = {}
    repaid_principal: dict[str, int] = {}
    cancelled = reversed_ids(active)
    for tx in active:
        tx_id = str(tx.get("id") or "unknown")
        try:
            if not isinstance(tx.get("amount"), int) or tx["amount"] <= 0:
                raise PostingError("amount must be a positive whole minor-unit value")
            if tx.get("currency") not in {"USD", "KHR"}:
                raise PostingError("currency must be USD or KHR")
            if not isinstance(tx.get("exchangeRate"), int) or tx["exchangeRate"] <= 0:
                raise PostingError("exchange rate must be positive")
            if tx.get("payMethod") != "later" and tx.get("bankId") not in bank_kinds:
                raise PostingError("selected cash or bank account does not exist")
            if tx.get("typeId") == "transfer" and tx.get("toBankId") not in bank_kinds:
                raise PostingError("destination cash or bank account does not exist")
            journal_for(tx, bank_kinds, loan_accounts)
        except (PostingError, TypeError, ValueError, KeyError) as exc:
            issues.append({"rowId": tx_id, "message": str(exc)})
            continue
        meta = _meta(tx)
        if tx_id in cancelled:  # a reversed loan or repayment no longer counts
            continue
        if tx["typeId"] == "loan_received":
            name = str(meta.get("lender") or tx.get("counterparty") or "").strip().casefold()
            loan_principal[name] = loan_principal.get(name, 0) + _to_usd_minor(tx["amount"], tx["currency"], tx["exchangeRate"])
        elif tx["typeId"] == "loan_repayment":
            name = str(meta.get("loanName") or "").strip().casefold()
            principal = tx["amount"] - int(meta.get("interest") or 0)
            repaid_principal[name] = repaid_principal.get(name, 0) + _to_usd_minor(principal, tx["currency"], tx["exchangeRate"])
    for name, repaid in repaid_principal.items():
        if repaid > loan_principal.get(name, 0):
            issues.append({"rowId": name or "loan_repayment", "message": "recorded loan repayments exceed the original loan principal"})
    return issues


def validate_opening_balances(entries: list[dict], currency: str, rate: int) -> list[dict[str, str]]:
    """Check that onboarding opening balances form a balanced opening position."""
    issues: list[dict[str, str]] = []
    if rate <= 0:
        return [{"rowId": "settings", "message": "KHR per USD exchange rate must be positive"}]
    total = 0
    balance_rows = [row for row in entries if row.get("section") == "balance_sheet"]
    for row in balance_rows:
        key = row.get("entryKey")
        code = ONBOARDING_ACCOUNT_MAP.get(key)
        if not code:
            issues.append({"rowId": str(row.get("id") or key or "opening_balance"), "message": f"unknown opening balance field: {key}"})
            continue
        amount = row.get("amount")
        source = row.get("currency")
        if not isinstance(amount, int) or source not in {"USD", "KHR"}:
            issues.append({"rowId": str(row.get("id") or key), "message": "opening balance must use a whole minor-unit amount and valid currency"})
            continue
        if amount < 0 and key != "net_profit_for_period":
            issues.append({"rowId": str(row.get("id") or key), "message": "opening balance cannot be negative"})
            continue
        converted = amount if source == currency else (round(amount * rate / 100) if source == "USD" else round(amount * 100 / rate))
        total += converted if code in DEBIT_NORMAL_ACCOUNTS else -converted
    tolerance = max(1, len(balance_rows))
    if balance_rows and abs(total) > tolerance:
        issues.append({"rowId": "opening_balance", "message": f"opening balance sheet is out of balance by {total} {currency} minor units"})
    return issues


def _to_usd_minor(amount: int, currency: str, rate: int) -> int:
    return amount if currency == "USD" else round(amount * 100 / rate)
