import copy
import json
from contextlib import contextmanager
from contextvars import ContextVar
from psycopg_pool import ConnectionPool
from app.config import config

# prepare_threshold=None is required for Supabase's transaction pooler (port 6543)
pool = ConnectionPool(config.database_url, kwargs={"prepare_threshold": None}, open=False)

# Per-request snapshot of each user's rows; None outside request_cache().
_request_rows: ContextVar[dict | None] = ContextVar("request_rows", default=None)

# One round trip per batch: the hosted database is hundreds of milliseconds away, so a
# row-by-row upsert made syncing a backlog of offline entries take tens of seconds.
# Last write wins on updatedAt. Rows the server already holds a newer copy of are left
# untouched and their stored copy is returned (the CTE's final select sees the pre-statement snapshot).
UPSERT_BATCH = """
with incoming as (
    select e->>'id' as id, e as data, (e->>'updatedAt')::bigint as updated_at, (e->>'deletedAt')::bigint as deleted_at
    from jsonb_array_elements(%(rows)s::jsonb) as e
), upserted as (
    insert into sync_rows (user_id, table_name, id, data, updated_at, deleted_at)
    select %(user_id)s, %(table)s, id, data, updated_at, deleted_at from incoming
    on conflict (user_id, table_name, id) do update
    set data = excluded.data, updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at, seq = nextval('sync_seq')
    where excluded.updated_at >= sync_rows.updated_at
    returning id, data
)
select id, data from upserted
union all
select s.id, s.data from sync_rows s join incoming i on s.id = i.id
where s.user_id = %(user_id)s and s.table_name = %(table)s
  and s.id not in (select id from upserted)
"""


def upsert_rows(user_id: str, table: str, rows: list[dict], *, return_rows: bool = False) -> dict[str, dict] | None:
    """rows: dicts using camelCase keys, already validated."""
    cache = _request_rows.get()
    if cache is not None:
        cache.pop(user_id, None)
    if not rows:
        return {} if return_rows else None
    # A single statement can't update the same row twice; keep the newest copy of each id
    # (the later one on a tie, matching the old row-by-row behaviour).
    latest: dict[str, dict] = {}
    for r in rows:
        current = latest.get(r["id"])
        if current is None or r["updatedAt"] >= current["updatedAt"]:
            latest[r["id"]] = r
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(UPSERT_BATCH, {"rows": json.dumps(list(latest.values())), "user_id": user_id, "table": table})
        stored = {row_id: data for row_id, data in cur.fetchall()}
    return stored if return_rows else None


def changes_since(user_id: str, cursor: int, limit: int = 500):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "select seq, table_name, data from sync_rows "
            "where user_id = %s and seq > %s order by seq limit %s",
            (user_id, cursor, limit),
        )
        return cur.fetchall()



def latest_seq(user_id: str) -> int:
    """Highest change number this user has on the server (0 if none)."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("select coalesce(max(seq), 0) from sync_rows where user_id = %s", (user_id,))
        return cur.fetchone()[0]

@contextmanager
def request_cache():
    """Within this block, each user's rows are loaded in one query and reused.

    Report endpoints re-read the same tables dozens of times per request, and each
    round trip to the hosted database costs hundreds of milliseconds.
    """
    token = _request_rows.set({})
    try:
        yield
    finally:
        _request_rows.reset(token)


def _load_user_rows(user_id: str) -> dict[str, list[tuple[dict, bool]]]:
    by_table: dict[str, list[tuple[dict, bool]]] = {}
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("select table_name, data, deleted_at is not null from sync_rows where user_id = %s", (user_id,))
        for table, data, deleted in cur.fetchall():
            by_table.setdefault(table, []).append((data, deleted))
    return by_table


def get_table_rows(user_id: str, table: str, *, include_deleted: bool = False) -> list[dict]:
    """Rows for one user/table. Tombstones are optional for historical reference checks."""
    cache = _request_rows.get()
    if cache is not None:
        if user_id not in cache:
            cache[user_id] = _load_user_rows(user_id)
        # Copies, so a caller mutating a row can't affect later reads in the same request.
        return [copy.deepcopy(data) for data, deleted in cache[user_id].get(table, [])
                if include_deleted or not deleted]
    with pool.connection() as conn, conn.cursor() as cur:
        query = "select data from sync_rows where user_id = %s and table_name = %s"
        if not include_deleted:
            query += " and deleted_at is null"
        cur.execute(query, (user_id, table))
        return [r[0] for r in cur.fetchall()]


def list_documents(user_id: str) -> list[dict]:
    """Metadata only; file bytes are fetched one document at a time."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "select kind, file_name, content_type, size_bytes, uploaded_at from business_documents "
            "where user_id = %s order by kind",
            (user_id,),
        )
        return [{"kind": k, "fileName": n, "contentType": t, "sizeBytes": s, "uploadedAt": u}
                for k, n, t, s, u in cur.fetchall()]


def get_document(user_id: str, kind: str) -> tuple[str, str, bytes] | None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "select file_name, content_type, content from business_documents where user_id = %s and kind = %s",
            (user_id, kind),
        )
        row = cur.fetchone()
        return (row[0], row[1], bytes(row[2])) if row else None


def save_document(user_id: str, kind: str, file_name: str, content_type: str, content: bytes, uploaded_at: int) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "insert into business_documents (user_id, kind, file_name, content_type, size_bytes, content, uploaded_at) "
            "values (%s, %s, %s, %s, %s, %s, %s) "
            "on conflict (user_id, kind) do update set file_name = excluded.file_name, "
            "content_type = excluded.content_type, size_bytes = excluded.size_bytes, "
            "content = excluded.content, uploaded_at = excluded.uploaded_at",
            (user_id, kind, file_name, content_type, len(content), content, uploaded_at),
        )


def delete_document(user_id: str, kind: str) -> bool:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("delete from business_documents where user_id = %s and kind = %s", (user_id, kind))
        return cur.rowcount > 0
