import time

from fastapi import APIRouter

from app.schemas.sync import PushRequest, PushResponse

router = APIRouter(prefix="/sync", tags=["sync"])

# Parents before children, so foreign keys (bank_id, category_id) resolve.
TABLE_ORDER = ["banks", "categories", "transactions", "business_assets", "budgets", "settings"]

# TEMPORARY in-memory store so you can test the route now.
# It resets whenever the server reloads. The next step replaces it with Supabase.
_store: dict[str, dict[str, dict]] = {}


@router.post("/push", response_model=PushResponse)
def push(req: PushRequest):
    accepted: dict[str, list[str]] = {t: [] for t in TABLE_ORDER}
    for table in TABLE_ORDER:
        bucket = _store.setdefault(table, {})
        for row in getattr(req.changes, table):
            current = bucket.get(row.id)
            # last write wins: ignore a row older than what the server already has
            if current is None or row.updated_at >= current["updated_at"]:
                bucket[row.id] = row.model_dump(exclude={"sync_status"})
            accepted[table].append(row.id)
    return PushResponse(accepted=accepted, server_time=int(time.time() * 1000))