import calendar
from collections import defaultdict
from datetime import datetime, timezone
from app.business_time import BUSINESS_TZ

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError

from app import db
from app.bookkeeping import PostingError, journal_for, loan_account_map, relation_errors
from app.auth import current_sme
from app.schemas.sync import (
    Bank, Budget, BusinessAsset, Category, OnboardingFinancialEntry,
    PullResponse, PushBatch, PushRequest, PushResponse, RejectedRow, Settings, SyncConflict, Transaction,
)

router = APIRouter(prefix="/sync", tags=["sync"])

MODELS = {
    "banks": Bank,
    "categories": Category,
    "transactions": Transaction,
    "business_assets": BusinessAsset,
    "budgets": Budget,
    "onboarding_financial_entries": OnboardingFinancialEntry,
    "settings": Settings,
}
TABLE_ORDER = list(MODELS)  # parents first, so foreign keys resolve
PULL_PAGE_SIZE = 500

BALANCE_SHEET_KEYS = {
    "cash_bank", "receivable", "inventory", "prepaid", "equipment", "other_long_term",
    "accounts_payable", "customer_deposits", "accrued_expenses", "short_term_loans",
    "other_short_borrowings", "long_term_loans", "lease_obligations", "owner_capital",
    "retained_earnings", "net_profit_for_period", "owner_drawings",
}
ASSET_CURRENCIES = {"cash_bank", "receivable", "inventory", "prepaid", "equipment", "other_long_term"}
INCOME_STATEMENT_KEYS = {
    "sales_revenue", "cost_of_goods_sold", "salaries_wages", "rent", "utilities",
    "marketing_advertising", "transport_delivery", "depreciation", "other_operating_expenses",
    "other_income", "interest_expense", "income_tax",
}


def _at_least_one_month(start_ms: int, end_ms: int) -> bool:
    try:
        start = datetime.fromtimestamp(start_ms / 1000, tz=BUSINESS_TZ)
        end = datetime.fromtimestamp(end_ms / 1000, tz=BUSINESS_TZ)
        year = start.year + (1 if start.month == 12 else 0)
        month = start.month % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        earliest_end = start.replace(year=year, month=month, day=day)
        return end >= earliest_end
    except (OverflowError, OSError, ValueError):
        return False


def _completed_onboarding_error(settings: Settings, user_id: str) -> str | None:
    if settings.onboarding_status != "completed":
        return None
    if settings.start_option not in {"new", "existing"}:
        return "settings.startOption: required for completed onboarding"

    # The app writes every row in one completion operation with a shared createdAt.
    by_submission: dict[int, list[dict]] = defaultdict(list)
    for row in db.get_table_rows(user_id, "onboarding_financial_entries"):
        by_submission[row["createdAt"]].append(row)

    for entries in by_submission.values():
        balance = [row for row in entries if row["section"] == "balance_sheet"]
        balance_keys = {row["entryKey"] for row in balance}
        if not BALANCE_SHEET_KEYS.issubset(balance_keys):
            continue
        if any(row.get("asOf") is None for row in balance):
            continue
        as_of_dates = {row["asOf"] for row in balance}
        if len(as_of_dates) != 1:
            continue
        if any(row["amount"] < 0 and row["entryKey"] != "net_profit_for_period" for row in entries):
            continue
        # Each asset line is captured in its selected currency, including explicit zeroes.
        if any(
            not any(row["entryKey"] == key for row in balance)
            for key in ASSET_CURRENCIES
        ):
            continue

        if settings.start_option == "new":
            return None

        income = [row for row in entries if row["section"] == "income_statement"]
        if not INCOME_STATEMENT_KEYS.issubset({row["entryKey"] for row in income}):
            continue
        periods = {(row.get("periodStart"), row.get("periodEnd")) for row in income}
        if len(periods) != 1:
            continue
        start_ms, end_ms = next(iter(periods))
        if start_ms is None or end_ms is None or not _at_least_one_month(start_ms, end_ms):
            continue
        if as_of_dates != {end_ms}:
            continue
        return None

    return "onboarding: a complete balance sheet and valid income statement period are required"


@router.post("/push", response_model=PushResponse)
def push(req: PushRequest, user_id: str = Depends(current_sme)):
    accepted: dict[str, list[str]] = {t: [] for t in MODELS}
    rejected: list[RejectedRow] = []
    conflicts: list[SyncConflict] = []
    postings: dict[str, list[dict]] = {}
    bank_kinds = {
        row["id"]: row["kind"] for row in db.get_table_rows(user_id, "banks")
        if row.get("deletedAt") is None
    }
    all_transactions_by_id = {row["id"]: row for row in db.get_table_rows(user_id, "transactions")}
    # Payments and reversals are checked in order against what is already stored plus the rows
    # accepted earlier in this push, so two payments in one batch can't both pass an overpayment check.
    accepted_transactions = dict(all_transactions_by_id)
    for batch in req.batches:
        if batch.table != "transactions":
            continue
        for row in batch.rows:
            row_id, updated_at = row.get("id"), row.get("updatedAt")
            if not isinstance(row_id, str) or not isinstance(updated_at, int):
                continue
            existing = all_transactions_by_id.get(row_id)
            if existing is None or updated_at >= existing.get("updatedAt", 0):
                if row.get("deletedAt") is not None:
                    all_transactions_by_id.pop(row_id, None)
                else:
                    all_transactions_by_id[row_id] = row
    all_transactions = list(all_transactions_by_id.values())
    loan_rows = []
    for transaction in all_transactions:
        try:
            loan_account_map([transaction])
            loan_rows.append(transaction)
        except (PostingError, TypeError, ValueError):
            continue
    loan_accounts = loan_account_map(loan_rows)

    for batch in sorted(req.batches, key=lambda b: TABLE_ORDER.index(b.table)):
        model = MODELS[batch.table]
        valid = []
        for raw in batch.rows:
            try:
                row = model.model_validate(raw)
            except ValidationError as e:
                err = e.errors()[0]
                where = ".".join(str(p) for p in err["loc"])
                rejected.append(RejectedRow(
                    table=batch.table, id=str(raw.get("id", "?")), reason=f"{where}: {err['msg']}"
                ))
                continue

            if batch.table == "settings":
                onboarding_error = _completed_onboarding_error(row, user_id)
                if onboarding_error:
                    rejected.append(RejectedRow(table=batch.table, id=row.id, reason=onboarding_error))
                    continue

            if batch.table == "transactions" and row.deleted_at is None:
                try:
                    if row.pay_method != "later" and row.bank_id not in bank_kinds:
                        raise PostingError("selected cash or bank account does not exist")
                    if row.type_id == "transfer" and row.to_bank_id not in bank_kinds:
                        raise PostingError("destination cash or bank account does not exist")
                    postings[row.id] = journal_for(row.model_dump(by_alias=True), bank_kinds, loan_accounts)
                    # Payments and reversals must fit the entry they point to (no overpaying, no double reversal).
                    row_data = row.model_dump(by_alias=True)
                    relation_error = relation_errors(row_data, {**accepted_transactions, row.id: row_data})
                    if relation_error:
                        postings.pop(row.id, None)
                        raise PostingError(relation_error)
                    accepted_transactions[row.id] = row_data
                except (PostingError, TypeError, ValueError) as e:
                    rejected.append(RejectedRow(table=batch.table, id=row.id, reason=str(e)))
                    continue

            valid.append(row)

        if valid:
            # Last write wins on updatedAt, enforced in the SQL. A stale row is still
            # "accepted": the server already has newer data and the next pull delivers it.
            stored_rows = db.upsert_rows(
                user_id, batch.table,
                [r.model_dump(by_alias=True, exclude={"sync_status"}) for r in valid],
                return_rows=True,
            ) or {}
            if batch.table == "banks":
                for row in valid:
                    stored = stored_rows.get(row.id, row.model_dump(by_alias=True))
                    if stored.get("deletedAt") is None:
                        bank_kinds[row.id] = stored["kind"]
                    else:
                        bank_kinds.pop(row.id, None)
            for row in valid:
                stored = stored_rows.get(row.id)
                if stored and stored.get("updatedAt", 0) > row.updated_at:
                    conflicts.append(SyncConflict(table=batch.table, row=stored))
                    postings.pop(row.id, None)
                else:
                    accepted[batch.table].append(row.id)

    return PushResponse(accepted=accepted, rejected=rejected, conflicts=conflicts, postings=postings)


@router.get("/changes", response_model=PullResponse)
def changes(since: str | None = Query(default=None), user_id: str = Depends(current_sme)):
    try:
        after = int(since) if since else 0
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid cursor")

    by_table: dict[str, list[dict]] = defaultdict(list)
    last = after
    rows = db.changes_since(user_id, after, limit=PULL_PAGE_SIZE)
    for seq, table, data in rows:
        by_table[table].append(data)
        last = max(last, seq)

    # The cursor only ever moves forward, so a client holding a cursor beyond anything this
    # user has on the server means the server lost data (database reset or restored). Tell the
    # client to start over: re-upload its local rows and pull from the beginning.
    if not rows and after > 0 and after > db.latest_seq(user_id):
        return PullResponse(changes=[], cursor="0", reset=True)

    out = [PushBatch(table=t, rows=by_table[t]) for t in TABLE_ORDER if t in by_table]
    return PullResponse(changes=out, cursor=str(last), has_more=len(rows) == PULL_PAGE_SIZE)
