"""FINEXT's deterministic double-entry posting rules.

Money is kept in the transaction's integer minor units (USD cents or KHR riel).
Each journal balances within a single transaction and currency.
"""
import json
from typing import Any
from calendar import monthrange
from datetime import datetime, timezone
from app.business_time import BUSINESS_TZ


class PostingError(ValueError):
    pass


EXPECTED_DIRECTIONS = {
    "product_sale": "in", "service_income": "in", "customer_deposit": "in", "loan_received": "in",
    "owner_capital": "in", "other_income": "in", "rent": "out", "wages": "out", "utilities": "out",
    "transport": "out", "marketing": "out", "repairs": "out", "fees_licences": "out", "other_cost": "out",
    "stock_materials": "out", "equipment_purchase": "out", "loan_repayment": "out", "income_tax": "out",
    "owner_drawings": "out", "transfer": "move",
    # "Mark as paid" (spec: Actions): settle a pay-later entry, fully or in part.
    "customer_payment": "in", "supplier_payment": "out",
    # "Write off unpaid amount" (spec: Actions): the customer will not pay. A cost, so "out".
    "write_off": "out",
}
# "Edit or reverse" (spec: Actions): swaps every debit and credit of the original entry.
# Its direction is the opposite of the original's ("move" stays "move").
REVERSAL = "reversal"
OPPOSITE_DIRECTION = {"in": "out", "out": "in", "move": "move"}
PAYMENT_TYPES = {"customer_payment", "supplier_payment"}
WRITE_OFF = "write_off"
# Entries that reduce what is still owed on a pay-later entry.
SETTLEMENT_TYPES = PAYMENT_TYPES | {WRITE_OFF}


def _meta(transaction: dict[str, Any]) -> dict[str, Any]:
    raw = transaction.get("meta")
    if not raw:
        return {}
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError) as exc:
        raise PostingError("meta must be valid JSON") from exc
    if not isinstance(value, dict):
        raise PostingError("meta must be a JSON object")
    return value


def _line(side: str, account: str, amount: int) -> dict[str, Any]:
    return {"side": side, "accountCode": account, "amount": amount}


def loan_account_map(transactions: list[dict[str, Any]]) -> dict[str, str]:
    accounts: dict[str, set[str]] = {}
    for tx in transactions:
        if tx.get("typeId") != "loan_received" or tx.get("deletedAt") is not None:
            continue
        meta = _meta(tx)
        lender = str(meta.get("lender") or tx.get("counterparty") or "").strip().casefold()
        if not lender:
            continue
        try:
            term = int(meta.get("termMonths") or 12)
        except (TypeError, ValueError):
            continue
        lender_type = meta.get("lenderType")
        code = "2600" if term > 12 else "2400" if lender_type == "bank_mfi" else "2500"
        accounts.setdefault(lender, set()).add(code)
    return {name: next(iter(codes)) if len(codes) == 1 else "ambiguous" for name, codes in accounts.items()}


# Rules §12 Q4: a product sale with no cost uses the cost share of the sales with an entered cost in the
# three complete months before the sale's month, or the 33% benchmark gross margin until there are any.
BENCHMARK_COST_SHARE = (67, 100)
COST_HISTORY_MONTHS = 3


def _default_cost(amount: int) -> int:
    cost, sales = BENCHMARK_COST_SHARE
    return (amount * cost + sales // 2) // sales


def _usd_cents(amount: int, transaction: dict[str, Any]) -> int:
    if transaction.get("currency") == "USD":
        return amount
    return round(amount * 100 / (transaction.get("exchangeRate") or 1))


def estimated_costs(transactions: list[dict[str, Any]]) -> dict[str, int]:
    """Estimated cost of each product sale entered without one, keyed by the sale's id.

    Depends only on the sale's own date and earlier entries, so a sale's journal does not change
    as time passes, and a reversal (which posts from the original's id) mirrors it exactly.
    """
    live = [tx for tx in transactions if tx.get("deletedAt") is None and tx.get("typeId") == "product_sale"]
    cancelled = reversed_ids([tx for tx in transactions if tx.get("deletedAt") is None])
    entered: dict[int, list[int]] = {}  # month index -> [cost, sales] in USD cents
    blank: list[tuple[dict[str, Any], int]] = []
    for tx in live:
        try:
            cost = _meta(tx).get("cost")
        except PostingError:
            continue
        when = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
        month = when.year * 12 + when.month - 1
        if cost is None:
            blank.append((tx, month))
        elif isinstance(cost, int) and not isinstance(cost, bool) and cost >= 0 and tx["id"] not in cancelled:
            totals = entered.setdefault(month, [0, 0])
            totals[0] += _usd_cents(cost, tx)
            totals[1] += _usd_cents(tx["amount"], tx)
    estimates = {}
    for tx, month in blank:
        window = [entered.get(m, (0, 0)) for m in range(month - COST_HISTORY_MONTHS, month)]
        cost, sales = sum(c for c, _ in window), sum(s for _, s in window)
        estimates[tx["id"]] = (tx["amount"] * cost + sales // 2) // sales if sales > 0 else _default_cost(tx["amount"])
    return estimates


def build_journal(transaction: dict[str, Any], bank_kinds: dict[str, str] | None = None,
                  loan_accounts: dict[str, str] | None = None,
                  cost_estimates: dict[str, int] | None = None) -> list[dict[str, Any]]:
    """Map one synced frontend transaction to the workbook's journal lines."""
    type_id = transaction["typeId"]
    amount = transaction["amount"]
    direction = transaction["direction"]
    pay_method = transaction["payMethod"]
    meta = _meta(transaction)
    banks = bank_kinds or {}

    if type_id == REVERSAL:
        # The reversal carries a copy of the original so it posts on its own, wherever it is read.
        original = meta.get("reverses")
        if not isinstance(original, dict) or not meta.get("reversesId"):
            raise PostingError("reversal must include the original entry")
        if original.get("typeId") == REVERSAL:
            raise PostingError("a reversal cannot be reversed")
        if direction != OPPOSITE_DIRECTION.get(original.get("direction")):
            raise PostingError("reversal direction must be the opposite of the original")
        if amount != original.get("amount") or transaction.get("currency") != original.get("currency"):
            raise PostingError("reversal amount and currency must match the original")
        swapped = {"debit": "credit", "credit": "debit"}
        return [{**line, "side": swapped[line["side"]]}
                for line in build_journal({**original, "id": meta["reversesId"]}, bank_kinds, loan_accounts, cost_estimates)]

    if type_id not in EXPECTED_DIRECTIONS:
        raise PostingError(f"unknown entry type: {type_id}")
    if direction != EXPECTED_DIRECTIONS[type_id]:
        raise PostingError(f"{type_id} must have direction {EXPECTED_DIRECTIONS[type_id]}")
    if amount <= 0:
        raise PostingError("amount must be positive")

    if type_id == WRITE_OFF:
        # No money moves: the unpaid amount becomes a bad-debt cost.
        if pay_method != "later":
            raise PostingError("a write-off moves no money; record it against the customer's account")
        if not meta.get("settlesId"):
            raise PostingError("a write-off must say which unpaid sale it clears")
        if not (transaction.get("note") or "").strip():
            raise PostingError("note is required")
        return [_line("debit", "6990", amount), _line("credit", "1100", amount)]

    pay_later = {"product_sale", "service_income", "rent", "wages", "utilities", "transport", "marketing", "repairs", "other_cost", "stock_materials", "equipment_purchase"}
    if pay_method == "later" and type_id not in pay_later:
        raise PostingError(f"{type_id} does not allow pay later")
    if pay_method == "later" and not (transaction.get("counterparty") or "").strip():
        raise PostingError("counterparty is required for pay later")
    if type_id in {"customer_deposit"} and not (transaction.get("counterparty") or "").strip():
        raise PostingError("customer is required")
    if type_id in {"other_income", "other_cost"} and not (transaction.get("note") or "").strip():
        raise PostingError("note is required")
    if type_id == "equipment_purchase":
        if not meta.get("assetName"):
            raise PostingError("asset name is required")
        try:
            useful_life = int(meta.get("usefulLifeYears") or 0)
        except (TypeError, ValueError) as exc:
            raise PostingError("useful life must be a positive number of years") from exc
        if useful_life <= 0:
            raise PostingError("useful life must be a positive number of years")
    if type_id == "loan_received" and not meta.get("lender"):
        raise PostingError("lender is required")

    def pay_account(incoming: bool) -> str:
        if pay_method == "later":
            return "1100" if incoming else "2000"
        bank_id = transaction.get("bankId")
        if not bank_id:
            raise PostingError("cash or bank account is required")
        return "1000" if banks.get(bank_id) == "cash" else "1010"

    if type_id in PAYMENT_TYPES:
        if pay_method == "later":
            raise PostingError("a payment must be made in cash or through a bank account")
        if not meta.get("settlesId"):
            raise PostingError("a payment must say which pay-later entry it settles")
        if type_id == "customer_payment":  # customer pays what they owed you
            return [_line("debit", pay_account(True), amount), _line("credit", "1100", amount)]
        return [_line("debit", "2000", amount), _line("credit", pay_account(False), amount)]  # you pay a supplier

    if type_id == "transfer":
        source, target = transaction.get("bankId"), transaction.get("toBankId")
        if not source or not target or source == target:
            raise PostingError("transfer needs two different accounts")
        return [_line("debit", "1000" if banks.get(target) == "cash" else "1010", amount),
                _line("credit", "1000" if banks.get(source) == "cash" else "1010", amount)]

    if type_id in {"product_sale", "service_income", "customer_deposit", "loan_received", "owner_capital", "other_income"}:
        cash = _line("debit", pay_account(True), amount)
        if type_id == "product_sale":
            cost = meta.get("cost")
            if cost is None:
                cost = (cost_estimates or {}).get(transaction.get("id"))
                if cost is None:
                    cost = _default_cost(amount)
            if not isinstance(cost, int) or cost < 0:
                raise PostingError("cost must be a non-negative integer minor amount")
            lines = [cash, _line("credit", "4000", amount)]
            if cost:
                lines += [_line("debit", "5000", cost), _line("credit", "1200", cost)]
            return lines
        credit = {
            "service_income": "4100", "customer_deposit": "2100", "owner_capital": "3000", "other_income": "4200",
        }.get(type_id)
        if type_id == "loan_received":
            try:
                term = int(meta.get("termMonths") or 0)
            except (TypeError, ValueError) as exc:
                raise PostingError("loan term must be a positive number of months") from exc
            lender_type = meta.get("lenderType")
            if lender_type not in {"bank_mfi", "informal"} or term <= 0:
                raise PostingError("lender type and positive loan term are required")
            if meta.get("installmentAmount") is not None:
                try:
                    installment = int(meta["installmentAmount"])
                except (TypeError, ValueError) as exc:
                    raise PostingError("scheduled instalment must be a positive integer amount") from exc
                if installment <= 0 or meta.get("repaymentFrequency") not in {"weekly", "monthly"}:
                    raise PostingError("scheduled instalment needs a positive amount and weekly or monthly frequency")
            credit = "2600" if term > 12 else ("2400" if lender_type == "bank_mfi" else "2500")
        return [cash, _line("credit", credit, amount)]

    debit = {
        "rent": "6000", "wages": "6100", "utilities": "6200", "transport": "6400",
        "marketing": "6500", "repairs": "6600", "fees_licences": "6950", "other_cost": "6990",
        "stock_materials": "1200", "equipment_purchase": "1500", "income_tax": "7100", "owner_drawings": "3200",
    }.get(type_id)
    if type_id == "loan_repayment":
        interest = meta.get("interest") or 0
        if not isinstance(interest, int) or interest < 0 or interest > amount:
            raise PostingError("interest must be between zero and the repayment amount")
        principal = amount - interest
        loan_name = str(meta.get("loanName") or "").strip().casefold()
        loan_account = str(meta.get("loanAccountCode") or (loan_accounts or {}).get(loan_name) or "")
        if loan_account == "ambiguous":
            raise PostingError("loan name matches loans with different account classifications")
        if loan_account not in {"2400", "2500", "2600", "2700"}:
            raise PostingError("select a repayment loan that matches a recorded loan")
        lines = []
        if principal:
            lines.append(_line("debit", loan_account, principal))
        if interest:
            lines.append(_line("debit", "7000", interest))
        lines.append(_line("credit", pay_account(False), amount))
        return lines
    if type_id == "product_sale":  # already handled above
        raise PostingError("invalid product sale")
    return [_line("debit", debit, amount), _line("credit", pay_account(False), amount)]


def preview_impact(payload: dict[str, Any], banks: list[dict[str, Any]],
                   transactions: list[dict[str, Any]]) -> dict[str, Any]:
    """Use the real posting rules to calculate a prospective profit-and-loss impact."""
    type_id = str(payload.get("typeId") or "")
    amount = payload.get("amount")
    currency = payload.get("currency")
    if not isinstance(amount, int) or amount <= 0 or currency not in {"USD", "KHR"}:
        raise PostingError("a positive amount and valid currency are required")
    direction = EXPECTED_DIRECTIONS.get(type_id)
    if not direction:
        raise PostingError("unknown entry type")
    bank_id = payload.get("bankId") or "__preview_cash__"
    to_bank_id = payload.get("toBankId") or "__preview_destination__"
    bank_kinds = {b["id"]: b["kind"] for b in banks}
    bank_kinds.setdefault(bank_id, "cash")
    bank_kinds.setdefault(to_bank_id, "bank")
    transaction = {
        "id": "__preview__", "typeId": type_id, "direction": direction, "amount": amount,
        "currency": currency, "payMethod": payload.get("payMethod") or "cash",
        "bankId": bank_id, "toBankId": to_bank_id,
        "counterparty": payload.get("counterparty"), "note": payload.get("note"),
        "meta": payload.get("meta") or {},
        "occurredAt": payload.get("occurredAt") if isinstance(payload.get("occurredAt"), int)
        else int(datetime.now(BUSINESS_TZ).timestamp() * 1000),
    }
    lines = journal_for(transaction, bank_kinds, loan_account_map(transactions), estimated_costs(transactions + [transaction]))
    revenue_codes = {"4000", "4100", "4200", "4900"}
    expense_codes = {"5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900", "6950", "6990", "7000", "7100"}
    impact = sum(
        (line["amount"] if line["side"] == "credit" else -line["amount"])
        if line["accountCode"] in revenue_codes else
        (-line["amount"] if line["side"] == "debit" else line["amount"])
        if line["accountCode"] in expense_codes else 0
        for line in lines
    )
    kind_by_type = {
        "product_sale": "sales", "service_income": "sales", "customer_deposit": "deposit",
        "loan_received": "loan_in", "owner_capital": "capital", "other_income": "other_income",
        "loan_repayment": "loan_out", "stock_materials": "stock", "equipment_purchase": "equipment",
        "owner_drawings": "owner", "transfer": "move",
    }
    return {"kind": kind_by_type.get(type_id, "cost"), "value": impact, "currency": currency,
            "tone": "success" if impact > 0 else "alert" if impact < 0 else "neutral"}


def validate_balanced(lines: list[dict[str, Any]]) -> None:
    if not lines:
        raise PostingError("journal must contain at least one debit and credit line")

    for line in lines:
        if line.get("side") not in {"debit", "credit"}:
            raise PostingError("journal lines must be marked debit or credit")
        amount = line.get("amount")
        if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
            raise PostingError("journal line amounts must be positive whole minor-unit values")

    debits = sum(line["amount"] for line in lines if line["side"] == "debit")
    credits = sum(line["amount"] for line in lines if line["side"] == "credit")
    if debits != credits:
        raise PostingError(f"journal is not balanced (debits {debits}, credits {credits})")


def journal_for(transaction: dict[str, Any], bank_kinds: dict[str, str] | None = None,
                loan_accounts: dict[str, str] | None = None,
                cost_estimates: dict[str, int] | None = None) -> list[dict[str, Any]]:
    lines = build_journal(transaction, bank_kinds, loan_accounts, cost_estimates)
    validate_balanced(lines)
    return [{"lineNo": i + 1, **line, "currency": transaction["currency"]} for i, line in enumerate(lines)]


def journal_response(transactions: list[dict[str, Any]], banks: list[dict[str, Any]], depreciation_after: int = 0) -> list[dict[str, Any]]:
    """Build journal entries for a user's synced, non-deleted transactions."""
    bank_kinds = {b["id"]: b["kind"] for b in banks if b.get("deletedAt") is None}
    loan_accounts = loan_account_map(transactions)
    costs = estimated_costs(transactions)
    entries = []
    for transaction in transactions:
        if transaction.get("deletedAt") is not None:
            continue
        entries.append({
            "id": transaction["id"],
            "transactionId": transaction["id"],
            "date": transaction["occurredAt"],
            "source": "user",
            "currency": transaction["currency"],
            "lines": journal_for(transaction, bank_kinds, loan_accounts, costs),
        })
    entries.extend(depreciation_entries(transactions, after=depreciation_after))
    return entries


def depreciation_entries(transactions: list[dict[str, Any]], after: int = 0, through: int | None = None) -> list[dict[str, Any]]:
    """Generate deterministic monthly straight-line depreciation for recorded equipment."""
    through = through or int(datetime.now(BUSINESS_TZ).timestamp() * 1000)
    output = []
    end = datetime.fromtimestamp(through / 1000, tz=BUSINESS_TZ)
    reversed_entries = reversed_ids(transactions)
    for tx in transactions:
        if tx.get("deletedAt") is not None or tx.get("typeId") != "equipment_purchase" or tx["occurredAt"] < after:
            continue
        if tx.get("id") in reversed_entries:  # a reversed purchase is no longer an asset to depreciate
            continue
        meta = _meta(tx)
        try:
            life_months = int(meta.get("usefulLifeYears") or 0) * 12
        except (TypeError, ValueError):
            continue
        if life_months <= 0:
            continue
        purchase = datetime.fromtimestamp(tx["occurredAt"] / 1000, tz=BUSINESS_TZ)
        amount_per_month = max(1, round(tx["amount"] / life_months))
        month_index = purchase.year * 12 + purchase.month
        emitted = 0
        for month_offset in range(1, life_months + 1):
            index = month_index + month_offset - 1
            year, zero_month = divmod(index, 12)
            month = zero_month + 1
            day = monthrange(year, month)[1]
            booked = datetime(year, month, day, 23, 59, 59, tzinfo=BUSINESS_TZ)
            if booked > end:
                break
            value = min(amount_per_month, tx["amount"] - emitted)
            if value <= 0:
                break
            emitted += value
            output.append({"id": f"depreciation-{tx['id']}-{year:04d}-{month:02d}",
                           "transactionId": tx["id"], "date": int(booked.timestamp() * 1000),
                           "source": "system", "currency": tx["currency"],
                           "lines": [{"lineNo": 1, "side": "debit", "accountCode": "6800", "amount": value, "currency": tx["currency"]},
                                     {"lineNo": 2, "side": "credit", "accountCode": "1590", "amount": value, "currency": tx["currency"]}]})
    return output


# ---------------------------------------------------------------- reversals and pay-later settlement

def reversed_ids(transactions: list[dict[str, Any]]) -> set[str]:
    """Ids of entries cancelled by a live reversal."""
    return {
        str(_meta(tx).get("reversesId"))
        for tx in transactions
        if tx.get("typeId") == REVERSAL and tx.get("deletedAt") is None and _meta(tx).get("reversesId")
    }


def open_items(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pay-later entries with money still owed: by customers ('in') or to suppliers ('out')."""
    live = [tx for tx in transactions if tx.get("deletedAt") is None]
    cancelled = reversed_ids(live)
    paid: dict[str, int] = {}
    for tx in live:
        if tx.get("typeId") in SETTLEMENT_TYPES and tx.get("id") not in cancelled:
            settles = str(_meta(tx).get("settlesId") or "")
            paid[settles] = paid.get(settles, 0) + tx["amount"]
    items = []
    for tx in live:
        if tx.get("payMethod") != "later" or tx.get("id") in cancelled or tx.get("typeId") in {REVERSAL, WRITE_OFF}:
            continue
        remaining = tx["amount"] - paid.get(tx["id"], 0)
        if remaining > 0:
            items.append({"id": tx["id"], "direction": tx["direction"], "counterparty": tx.get("counterparty"),
                          "open": remaining, "currency": tx["currency"], "exchangeRate": tx.get("exchangeRate"),
                          "occurredAt": tx["occurredAt"]})
    return items


def relation_errors(row: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> str | None:
    """Rules a payment, write-off or reversal must meet against the entry it points to (spec: Actions guards)."""
    type_id = row.get("typeId")
    if type_id not in SETTLEMENT_TYPES and type_id != REVERSAL:
        return None
    meta = _meta(row)
    others = [tx for tx in by_id.values() if tx.get("id") != row.get("id") and tx.get("deletedAt") is None]
    cancelled = reversed_ids(others)

    if type_id in SETTLEMENT_TYPES:
        original = by_id.get(str(meta.get("settlesId") or ""))
        expected = "out" if type_id == "supplier_payment" else "in"
        if not original or original.get("deletedAt") is not None:
            return "the pay-later entry this payment settles does not exist"
        if original.get("typeId") in SETTLEMENT_TYPES or original.get("typeId") == REVERSAL:
            return "payments can only settle a pay-later entry in the same direction"
        if original.get("payMethod") != "later" or original.get("direction") != expected:
            if type_id == WRITE_OFF:
                return "only an unpaid customer sale can be written off"
            return "payments can only settle a pay-later entry in the same direction"
        if original["id"] in cancelled:
            return "this entry was reversed and can no longer be paid"
        if row.get("currency") != original.get("currency"):
            return "a payment must use the same currency as the entry it settles"
        paid = sum(tx["amount"] for tx in others if tx.get("typeId") in SETTLEMENT_TYPES and tx.get("id") not in cancelled
                   and str(_meta(tx).get("settlesId") or "") == original["id"])
        if paid + row["amount"] > original["amount"]:
            return f"{'write-off' if type_id == WRITE_OFF else 'payment'} is more than the amount still owed"
        return None

    original = by_id.get(str(meta.get("reversesId") or ""))
    if not original or original.get("deletedAt") is not None:
        return "the entry to reverse does not exist"
    if original.get("typeId") == REVERSAL:
        return "a reversal cannot be reversed"
    if original["id"] in cancelled:
        return "this entry has already been reversed"
    snapshot = meta.get("reverses") or {}
    if any(snapshot.get(key) != original.get(key) for key in ("typeId", "amount", "currency", "direction", "payMethod")):
        return "reversal does not match the original entry"
    has_payments = any(tx.get("typeId") in SETTLEMENT_TYPES and tx.get("id") not in cancelled
                       and str(_meta(tx).get("settlesId") or "") == original["id"] for tx in others)
    if has_payments:
        return "reverse the payments recorded against this entry first (including write-offs)"
    return None
