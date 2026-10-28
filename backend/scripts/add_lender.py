"""Add a partner bank and give its staff access to the lender portal.

Invite staff by email (recommended): each gets an email with a link that opens the portal, where they choose their
own password. Needs SUPABASE_SECRET_KEY in backend/.env and the portal address in Supabase's Redirect URLs.

    venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank" loans@acleda.example --invite

Or link staff who already have a Supabase Auth account (Supabase dashboard > Authentication > Users > Add user):

    venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank" loans@acleda.example
    venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank"              # bank only
    venv/Scripts/python.exe scripts/add_lender.py --list

Running it again is safe: the bank and memberships are only created once.
"""

import sys
import time
from pathlib import Path

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import config  # noqa: E402


def invite(email: str) -> str | None:
    """Email a Supabase invite whose link opens the portal; returns why it failed, or None."""
    if not config.supabase_secret_key:
        return "SUPABASE_SECRET_KEY is not set in backend/.env"
    response = httpx.post(
        f"{config.supabase_url.rstrip('/')}/auth/v1/invite",
        params={"redirect_to": config.portal_url},
        headers={"apikey": config.supabase_secret_key, "Authorization": f"Bearer {config.supabase_secret_key}"},
        json={"email": email},
        timeout=20,
    )
    if response.is_success:
        return None
    try:
        body = response.json()
        return body.get("msg") or body.get("message") or body.get("error_description") or response.text
    except ValueError:
        return response.text


def main(argv: list[str]) -> int:
    send_invites = "--invite" in argv
    argv = [arg for arg in argv if arg != "--invite"]
    with psycopg.connect(config.database_url, prepare_threshold=None) as conn:
        if argv == ["--list"]:
            rows = conn.execute(
                "select l.name, l.active, count(m.user_id) from lenders l "
                "left join lender_members m on m.lender_id = l.id group by l.id order by l.name"
            ).fetchall()
            for name, active, members in rows:
                print(f"{name}  ({'active' if active else 'inactive'}, {members} staff)")
            return 0
        if not argv:
            print(__doc__)
            return 1

        name, emails = argv[0].strip(), argv[1:]
        now = int(time.time() * 1000)
        conn.execute("insert into lenders (name, created_at) values (%s, %s) on conflict (name) do nothing", (name, now))
        lender_id = conn.execute("select id from lenders where name = %s", (name,)).fetchone()[0]
        print(f"Bank: {name} ({lender_id})")

        for email in emails:
            user = conn.execute("select id::text from auth.users where lower(email) = lower(%s)", (email,)).fetchone()
            if send_invites and not user:
                problem = invite(email)
                if problem:
                    print(f"  ! {email}: invite not sent ({problem})")
                    continue
                print(f"  > {email}: invite emailed (the link opens {config.portal_url})")
                user = conn.execute("select id::text from auth.users where lower(email) = lower(%s)", (email,)).fetchone()
            elif send_invites:
                print(f"  = {email} already has an account: no invite sent. They can use \"Forgot password?\" on the portal.")
            if not user:
                print(f"  ! {email}: no Supabase Auth user with this email. Invite them with --invite, or create the user first.")
                continue
            conn.execute(
                "insert into lender_members (user_id, lender_id, created_at) values (%s, %s, %s) "
                "on conflict (user_id) do update set lender_id = excluded.lender_id",
                (user[0], lender_id, now),
            )
            print(f"  + {email} can now sign in to the lender portal")
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
