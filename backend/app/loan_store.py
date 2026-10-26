"""Database access for lenders, loan-data sharing consents and the view audit trail."""

from app.db import pool

SHARE_COLUMNS = (
    "ls.id::text, ls.lender_id::text, l.name, ls.scopes, ls.created_at, ls.expires_at, ls.revoked_at, "
    "ls.decision, ls.decision_note, ls.decided_at, ls.readiness_score, ls.readiness_level, ls.readiness_at, ls.reviewing_at"
)


SHARE_WIDTH = 14  # number of SHARE_COLUMNS; extra selected columns follow them


def _share(row) -> dict:
    (share_id, lender_id, lender_name, scopes, created_at, expires_at, revoked_at,
     decision, note, decided_at, score, level, readiness_at, reviewing_at) = row[:SHARE_WIDTH]
    return {"id": share_id, "lenderId": lender_id, "lenderName": lender_name, "scopes": list(scopes),
            "createdAt": created_at, "expiresAt": expires_at, "revokedAt": revoked_at,
            "decision": decision, "decisionNote": note, "decidedAt": decided_at,
            "readinessScore": score, "readinessLevel": level, "readinessAt": readiness_at, "reviewingAt": reviewing_at}


def list_lenders() -> list[dict]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("select id::text, name from lenders where active order by name")
        return [{"id": lender_id, "name": name} for lender_id, name in cur.fetchall()]


def lender_for_member(user_id: str) -> dict | None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "select l.id::text, l.name from lender_members m join lenders l on l.id = m.lender_id "
            "where m.user_id = %s and l.active",
            (user_id,),
        )
        row = cur.fetchone()
        return {"id": row[0], "name": row[1]} if row else None


def upsert_share(sme_user_id: str, lender_id: str, scopes: list[str], now: int, expires_at: int) -> dict | None:
    """Create the SME's consent for this lender, or update the live one. None if the lender is unknown or inactive."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "insert into loan_shares (sme_user_id, lender_id, scopes, created_at, expires_at) "
            "select %(sme)s, l.id, %(scopes)s, %(now)s, %(expires)s from lenders l where l.id = %(lender)s::uuid and l.active "
            "on conflict (sme_user_id, lender_id) where revoked_at is null "
            "do update set scopes = excluded.scopes, expires_at = excluded.expires_at, created_at = excluded.created_at "
            "returning id::text",
            {"sme": sme_user_id, "lender": lender_id, "scopes": scopes, "now": now, "expires": expires_at},
        )
        row = cur.fetchone()
        if not row:
            return None
        cur.execute(f"select {SHARE_COLUMNS} from loan_shares ls join lenders l on l.id = ls.lender_id where ls.id = %s::uuid", (row[0],))
        return _share(cur.fetchone())


def list_shares_for_sme(sme_user_id: str) -> list[dict]:
    """The SME's consents (live and past), with how often and when the lender last viewed them."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"select {SHARE_COLUMNS}, count(v.viewed_at), max(v.viewed_at), min(v.viewed_at) "
            "from loan_shares ls join lenders l on l.id = ls.lender_id "
            "left join loan_share_views v on v.share_id = ls.id "
            "where ls.sme_user_id = %s group by ls.id, l.name order by ls.revoked_at nulls first, ls.created_at desc",
            (sme_user_id,),
        )
        return [{**_share(row), "viewCount": row[SHARE_WIDTH], "lastViewedAt": row[SHARE_WIDTH + 1],
                 "firstViewedAt": row[SHARE_WIDTH + 2]} for row in cur.fetchall()]


def revoke_share(sme_user_id: str, share_id: str, now: int) -> bool:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "update loan_shares set revoked_at = %s where id = %s::uuid and sme_user_id = %s and revoked_at is null",
            (now, share_id, sme_user_id),
        )
        return cur.rowcount > 0


def save_readiness_snapshot(sme_user_id: str, score: int | None, level: str, now: int, share_id: str | None = None) -> None:
    """Store the latest score on the SME's live consents (all of them, or one)."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "update loan_shares set readiness_score = %s, readiness_level = %s, readiness_at = %s "
            "where sme_user_id = %s and revoked_at is null and (%s::uuid is null or id = %s::uuid)",
            (score, level, now, sme_user_id, share_id, share_id),
        )


def list_applicants(lender_id: str, now: int) -> list[dict]:
    """Live, unexpired consents given to this lender, with the business's profile name."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"select {SHARE_COLUMNS}, s.data->>'businessName', s.data->>'businessIndustry', s.data->>'location' "
            "from loan_shares ls join lenders l on l.id = ls.lender_id "
            "left join sync_rows s on s.user_id::text = ls.sme_user_id and s.table_name = 'settings' and s.id = 'app' "
            "where ls.lender_id = %s::uuid and ls.revoked_at is null and ls.expires_at > %s "
            "order by ls.created_at desc",
            (lender_id, now),
        )
        return [{**_share(row), "businessName": row[SHARE_WIDTH], "industry": row[SHARE_WIDTH + 1], "location": row[SHARE_WIDTH + 2]}
                for row in cur.fetchall()]


def active_share_for_lender(lender_id: str, share_id: str, now: int) -> tuple[dict, str] | None:
    """(share, sme_user_id) if this lender may currently see it."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"select {SHARE_COLUMNS}, ls.sme_user_id from loan_shares ls join lenders l on l.id = ls.lender_id "
            "where ls.id = %s::uuid and ls.lender_id = %s::uuid and ls.revoked_at is null and ls.expires_at > %s",
            (share_id, lender_id, now),
        )
        row = cur.fetchone()
        return (_share(row), row[SHARE_WIDTH]) if row else None


def record_view(share_id: str, viewer_user_id: str, now: int) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("insert into loan_share_views (share_id, viewer_user_id, viewed_at) values (%s::uuid, %s, %s)",
                    (share_id, viewer_user_id, now))


def set_decision(lender_id: str, share_id: str, decision: str, note: str | None, now: int) -> bool:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            # Review starts with the first decision of any kind, so the SME's progress line
            # always has an "Under review" date before "Approved" / "Declined".
            "update loan_shares set decision = %s, decision_note = %s, decided_at = %s, "
            "reviewing_at = coalesce(reviewing_at, %s) "
            "where id = %s::uuid and lender_id = %s::uuid and revoked_at is null and expires_at > %s",
            (decision, note, now, now, share_id, lender_id, now),
        )
        return cur.rowcount > 0
