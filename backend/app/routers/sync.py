from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from app.schemas.sync import (
    Bank, Budget, BusinessAsset, Category, PullResponse, PushBatch,
    PushRequest, PushResponse, RejectedRow, Settings, Transaction,
)

router = APIRouter(prefix="/sync", tags=["sync"])

MODELS = {
    "banks": Bank,
    "categories": Category,
    "transactions": Transaction,
    "business_assets": BusinessAsset,
    "budgets": Budget,
    "settings": Settings,
}
TABLE_ORDER = list(MODELS)  # parents first, so foreign keys resolve

# TEMPORARY in-memory store (resets on reload). Supabase replaces it next.
_store: dict[str, dict[str, dict]] = {t: {} for t in MODELS}
_version = 0  # server-side change counter, used as the pull cursor


@router.post("/push", response_model=PushResponse)
def push(req: PushRequest):
    global _version
    accepted: dict[str, list[str]] = {t: [] for t in MODELS}
    rejected: list[RejectedRow] = []

    for batch in sorted(req.batches, key=lambda b: TABLE_ORDER.index(b.table)):
        model = MODELS[batch.table]
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

            current = _store[batch.table].get(row.id)
            # last write wins on updatedAt. A stale row is still "accepted":
            # the server already has newer data, and the next pull delivers it.
            if current is None or row.updated_at >= current["data"]["updatedAt"]:
                _version += 1
                _store[batch.table][row.id] = {
                    "version": _version,
                    "data": row.model_dump(by_alias=True, exclude={"sync_status"}),
                }
            accepted[batch.table].append(row.id)

    return PushResponse(accepted=accepted, rejected=rejected)


@router.get("/changes", response_model=PullResponse)
def changes(since: str | None = Query(default=None)):
    try:
        after = int(since) if since else 0
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid cursor")

    out: list[PushBatch] = []
    for table in TABLE_ORDER:
        rows = [r["data"] for r in _store[table].values() if r["version"] > after]
        if rows:
            out.append(PushBatch(table=table, rows=rows))
    return PullResponse(changes=out, cursor=str(_version))