"""Add a partner bank and give its staff access to the lender portal.

Bank staff need a Supabase Auth account first (Supabase dashboard > Authentication >
Users > Add user). Then, from the backend folder:

    venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank" loans@acleda.example
    venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank"              # bank only
    venv/Scripts/python.exe scripts/add_lender.py --list

Running it again is safe: the bank and memberships are only created once.
"""

import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import config  # noqa: E402


def main(argv: list[str]) -> int:
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
            if not user:
                print(f"  ! {email}: no Supabase Auth user with this email. Create it first, then run again.")
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
