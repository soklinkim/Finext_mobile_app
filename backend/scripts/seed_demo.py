"""Fill one demo account with the Sample Grocery Shop from FINEXT_FINANCE_RULES.md §8.4, to walk through the app.

Sign up in the app with the demo email and open it once (that creates the account's Cash account), then, from the
backend folder:

    venv/Scripts/python.exe scripts/seed_demo.py demo@finext.app            # preview: totals and the AI's answer
    venv/Scripts/python.exe scripts/seed_demo.py demo@finext.app --write    # load it into that account

Where the numbers come from: the spec gives yearly totals only, and `tests/test_worked_sample.ledger()` turns them into
entries that reproduce the spec's statements exactly. Here the recurring ones (sales, stock, rent, wages, owner
drawings) are split evenly over the twelve months of their year, so every yearly total is unchanged; one-off entries
(capital, loans, equipment, credit sales, bills, repayments, tax) keep their date. Nothing else is added.

The spec's years end in December 2025. So that the latest months are not empty, every date is moved forward by
SHIFT_MONTHS: the spec's "2025" becomes October 2025 to September 2026, and each 12-month run has the spec's totals,
but calendar-year statements in the app will not show the spec's figures. Running it again replaces the same rows.
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.business_time import BUSINESS_TZ  # noqa: E402
from tests.test_worked_sample import ledger  # noqa: E402  (the §8.4 sample as entries)

SHIFT_MONTHS = 9
SPREAD = {"sale-24", "sale-25", "stock-24", "stock-25", "rent-24", "rent-25", "wages-24", "wages-25", "drawings-24", "drawings-25"}
NOTE = "Demo data: Sample Grocery Shop, FINEXT_FINANCE_RULES.md §8.4"
TITLES = {"owner_capital": "Owner capital", "loan_received": "Loan received", "equipment_purchase": "Equipment",
          "stock_materials": "Stock", "product_sale": "Sales", "customer_deposit": "Customer deposit", "rent": "Shop rent",
          "wages": "Wages", "loan_repayment": "Loan repayment", "income_tax": "Income tax", "owner_drawings": "Owner drawings",
          "other_income": "Grant", "customer_payment": "Customer paid", "supplier_payment": "Supplier paid"}


def _date(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, BUSINESS_TZ)


def _at(year: int, month: int, day: int) -> int:
    """Noon on that day, after moving forward SHIFT_MONTHS months."""
    index = year * 12 + month - 1 + SHIFT_MONTHS
    return int(datetime(index // 12, index % 12 + 1, day, 12, tzinfo=BUSINESS_TZ).timestamp() * 1000)


def _split(total: int) -> list[int]:
    """Twelve whole-cent parts that add up to `total` exactly."""
    base, extra = divmod(total, 12)
    return [base + (1 if i < extra else 0) for i in range(12)]


def demo_rows(cash_id: str, now_ms: int) -> list[dict]:
    rows = []
    for e in ledger():
        meta = json.loads(e["meta"]) if e["meta"] else None
        if meta and "settlesId" in meta:
            meta["settlesId"] = f"demo-{meta['settlesId']}"
        base = {**e, "id": f"demo-{e['id']}", "title": TITLES.get(e["typeId"], e["typeId"]), "note": NOTE,
                "bankId": cash_id if e["bankId"] == "cash" else e["bankId"], "createdAt": now_ms, "updatedAt": now_ms,
                "syncStatus": "synced"}
        when = _date(e["occurredAt"])
        if e["id"] in SPREAD:
            costs = _split(meta["cost"]) if meta and "cost" in meta else None
            for i, amount in enumerate(_split(e["amount"])):
                part_meta = {**meta, "cost": costs[i]} if costs else meta
                rows.append({**base, "id": f"{base['id']}-{i + 1:02d}", "amount": amount, "occurredAt": _at(when.year, i + 1, 15),
                             "meta": json.dumps(part_meta) if part_meta else None})
        else:
            rows.append({**base, "occurredAt": _at(when.year, when.month, when.day), "meta": json.dumps(meta) if meta else None})
    return rows


def _check(rows: list[dict]) -> None:
    """Every entry type's total equals the sample's, and nothing is dated in the future."""
    def totals(items, amount=lambda r: r["amount"]):
        out: dict[str, int] = {}
        for r in items:
            out[r["typeId"]] = out.get(r["typeId"], 0) + amount(r)
        return out
    assert totals(rows) == totals(ledger()), "totals differ from the sample"
    cost = lambda r: json.loads(r["meta"]).get("cost", 0) if r["meta"] else 0  # noqa: E731
    assert totals(rows, cost) == totals(ledger(), cost), "cost of goods differs from the sample"
    assert max(r["occurredAt"] for r in rows) <= time.time() * 1000, "an entry is dated in the future"


def preview(rows: list[dict], banks: list[dict]) -> None:
    from app import risk
    first, last = _date(min(r["occurredAt"] for r in rows)), _date(max(r["occurredAt"] for r in rows))
    print(f"{len(rows)} entries, {first:%b %Y} to {last:%b %Y}; every total matches the §8.4 sample")
    out = risk.assess(rows, banks, {"displayCurrency": "USD", "rateKhrPerUsd": 4000}, through=datetime.now(BUSINESS_TZ))
    model, stress, capacity = out["model"], out["stress3m"], out["debtCapacity"]
    if model["available"]:
        print(f"12-month risk: {model['probability']:.1%} ({model['riskClass']}), {model['months']} months of books")
        for d in model["topDrivers"][:3]:
            print(f"  {d['direction']}: {d['label']}")
    else:
        print("12-month risk: not available,", model.get("text"))
    print("3-month cash stress:", f"{stress['probability']:.1%} ({stress['riskClass']})" if stress["available"] else stress.get("reason"))
    if capacity["available"]:  # amounts are in cents
        print(f"debt capacity: {capacity['level']}; can repay about ${capacity['affordableMonthlyInstalment'] / 100:,.0f} a month,"
              f" owes ${capacity['debt'] / 100:,.0f}")
    else:
        print("debt capacity: not available,", capacity.get("reason"))


def main(argv: list[str]) -> int:
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 1
    email, write = argv[0], "--write" in argv
    from app import db
    from app.config import config
    import psycopg
    with psycopg.connect(config.database_url, prepare_threshold=None) as conn:
        found = conn.execute("select id from auth.users where lower(email) = lower(%s)", (email,)).fetchone()
    if not found:
        print(f"No account for {email}: sign up in the app first, then open it once.")
        return 1
    user_id = str(found[0])
    banks = db.get_table_rows(user_id, "banks")
    cash = next((b for b in banks if b.get("kind") == "cash"), None)
    if cash is None:
        print("This account has no Cash account yet: open the app once while online so it syncs, then run this again.")
        return 1
    existing = [t for t in db.get_table_rows(user_id, "transactions") if not str(t["id"]).startswith("demo-")]
    rows = demo_rows(cash["id"], int(time.time() * 1000))
    _check(rows)
    preview(rows, banks)
    if existing:
        print(f"Note: this account already has {len(existing)} other entries; they would be mixed with the demo.")
    if not write:
        print("Preview only. Add --write to load it.")
        return 0
    db.upsert_rows(user_id, "transactions", rows)
    print(f"Loaded into {email}. In the app, pull to refresh or reopen it to sync.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
