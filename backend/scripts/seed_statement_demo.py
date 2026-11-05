"""Fill a demo account from a real bank statement, with every name and number that identifies anyone removed.

Real: each row's date and amount, and the statement's opening balance (read with FINEXT's own statement reader, and
checked against the statement's printed totals). Made up: what each row was for (sale, stock, transport, ...), its
title, each sale's cost of goods, and the business profile. Account numbers, people's names, phone numbers and reference codes are never kept.

Riel amounts are whole riel in FINEXT, so the few amounts with sen (e.g. 1,058.20) are rounded to the nearest riel.

Sign up in the app with the demo email and open it once while online (that creates its accounts), then, from the
backend folder:

    venv/Scripts/python.exe scripts/seed_statement_demo.py STATEMENT.pdf                    # preview only, no account needed
    venv/Scripts/python.exe scripts/seed_statement_demo.py STATEMENT.pdf demo@example.com   # preview for that account
    venv/Scripts/python.exe scripts/seed_statement_demo.py STATEMENT.pdf demo@example.com --write

The opening balance is dated the start of the statement period; add --from=YYYY-MM-DD if that is not the first day of
the first transaction's month. Running it again replaces the same rows. The statement PDF itself is not stored anywhere.
"""

import json
import random
import re
import sys
from collections import Counter
import time
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.bookkeeping import _default_cost  # noqa: E402
from app.business_time import BUSINESS_TZ  # noqa: E402
from app.statement_import import read_statement  # noqa: E402

NOTE = "Demo data: date and amount from a real bank statement; description made up."
SEED = 7  # the same made-up descriptions on every run

PROFILE = {
    "businessName": "Morning Cup Coffee Cart",
    "businessIndustry": "food_stall",
    "registrationStatus": "unregistered",
    "location": "Phnom Penh",
    "mainProducts": "Iced coffee, tea and snacks",
    "startOperationDate": "2026-05-01",
}

# What a row was for: made up, but in keeping with a small coffee cart.
SALE_TITLES = ["Sales: KHQR payments", "Sales: morning drinks", "Sales: afternoon drinks", "Sales: snack orders", "Sales: office order"]
CUSTOMER_TITLES = ["Customer paid: catering order", "Customer paid: office drinks order", "Customer paid: event order"]
SPEND = [  # (entry type, title, weight)
    ("stock_materials", "Coffee beans and milk", 4),
    ("stock_materials", "Cups, lids and straws", 2),
    ("stock_materials", "Ice and sugar", 2),
    ("stock_materials", "Snacks stock", 1),
    ("transport", "Delivery to customer", 2),
    ("transport", "Trip to the market", 2),
    ("other_cost", "Small supplies", 1),
]


SENDER = re.compile(r"(?:FUNDS RECEIVED FROM|PAYMENT FROM)\s+([A-Z][A-Z .]+?)\s*(?:\(|/|\d)")


def _sender(description: str) -> str | None:
    match = SENDER.search(description.upper())
    return match.group(1).strip() if match else None


def _holder(read: dict) -> str | None:
    """The account holder, worked out from the statement: the person who most often pays into it (their own top-ups).
    Used only to tell top-ups from customer payments; never printed or kept."""
    senders = Counter(s for r in read["rows"] if r["direction"] == "in" and (s := _sender(r["description"])))
    return senders.most_common(1)[0][0] if senders else None


def _kind(description: str, direction: str, holder: str | None) -> str:
    """What the bank says a row is, from its wording only (never kept)."""
    text = description.upper()
    if "REFUND BY" in text:
        return "refund"
    if direction == "out":
        return "own_transfer" if "FUNDS TRANSFERRED TO" in text else "purchase"
    # Money in from the account holder's own other accounts vs from someone else.
    return "top_up" if holder and _sender(description) == holder else "customer"


def _identifying(read: dict) -> set[str]:
    """Every name and long number on the statement rows: none of it may reach the demo data."""
    found = set()
    for r in read["rows"]:
        text = r["description"].upper()
        if (name := _sender(text)):
            found.add(name)
        found.update(re.findall(r"\d{6,}", text.replace(" ", "")))
        found.update(m.strip() for m in re.findall(r"(?:TRANSFERRED TO|AT)\s+([A-Z][A-Z ]{3,}?)\s+(?:\d|ON\b)", text))
    return {f for f in found if len(f) >= 4}


def _noon(iso: str, offset_minutes: int) -> int:
    d = date.fromisoformat(iso)
    return int(datetime(d.year, d.month, d.day, 12, offset_minutes % 60, tzinfo=BUSINESS_TZ).timestamp() * 1000)


def build(read: dict, bank_id: str, now_ms: int, period_start: str | None = None) -> tuple[list[dict], dict]:
    rng = random.Random(SEED)
    weights = [w for _, _, w in SPEND]
    holder = _holder(read)
    rows = []
    for i, r in enumerate(read["rows"]):
        kind = _kind(r["description"], r["direction"], holder)
        if kind == "refund":
            type_id, title, note = "other_income", "Supplier refund", NOTE + " Refund of a stock order."
        elif kind == "own_transfer":
            type_id, title, note = "owner_drawings", "Owner withdrawal", NOTE
        elif kind == "purchase":
            type_id, title, _ = rng.choices(SPEND, weights)[0]
            note = NOTE
        elif kind == "customer":
            type_id, title, note = "product_sale", rng.choice(CUSTOMER_TITLES), NOTE
        else:
            type_id, title, note = "product_sale", rng.choice(SALE_TITLES), NOTE
        rows.append({
            "id": f"demo-stmt-{i + 1:03d}", "createdAt": now_ms, "updatedAt": now_ms, "deletedAt": None, "syncStatus": "synced",
            "title": title, "typeId": type_id, "direction": r["direction"],
            "groupId": None, "amount": round(r["amount"]), "currency": "KHR", "exchangeRate": 4000,
            "payMethod": "bank", "bankId": bank_id, "toBankId": None, "categoryId": None, "counterparty": None,
            "note": note, "occurredAt": _noon(r["date"], i), "reviewFlag": type_id in ("other_income", "other_cost"), "meta": None,
        })
    # Each sale's cost of goods is made up too: the usual share of the sale, but never more than the stock bought before
    # it and not yet sold. Left to the app's estimate, the cart would sell more stock than it bought and its recorded
    # stock (and so its assets) would fall below zero, which the risk model reads as broken books.
    stock = 0
    for row in sorted(rows, key=lambda x: x["occurredAt"]):
        if row["typeId"] == "stock_materials":
            stock += row["amount"]
        elif row["typeId"] == "product_sale":
            cost = min(stock, _default_cost(row["amount"]))
            stock -= cost
            row["meta"] = json.dumps({"cost": cost})
    # The opening balance is dated the start of the statement period. When the reader did not pick the period up, the
    # first day of the first row's month (statements run whole months); `--from=YYYY-MM-DD` overrides it.
    start = period_start or (read["period"].split(" to ")[0] if read.get("period") else read["rows"][0]["date"][:8] + "01")
    as_of = int(datetime.fromisoformat(start).replace(tzinfo=BUSINESS_TZ).timestamp() * 1000)
    opening = round(read["openingBalance"] or 0)
    opening_rows = {
        "business_assets": [{"id": "demo-stmt-opening-bank", "createdAt": now_ms, "updatedAt": now_ms, "deletedAt": None,
                             "syncStatus": "synced", "kind": "cash_bank", "name": "ABA", "bankId": bank_id, "amount": opening,
                             "currency": "KHR", "asOf": as_of}],
        "onboarding_financial_entries": [
            {"id": f"demo-stmt-opening-{key}", "createdAt": now_ms, "updatedAt": now_ms, "deletedAt": None, "syncStatus": "synced",
             "section": "balance_sheet", "entryKey": key, "amount": opening, "currency": "KHR", "asOf": as_of,
             "periodStart": None, "periodEnd": None}
            for key in ("cash_bank", "owner_capital")
        ],
    }
    return rows, opening_rows


def check(read: dict, rows: list[dict]) -> None:
    """The statement's printed totals match its rows, and nothing identifying is kept."""
    total = lambda d: sum(r["amount"] for r in read["rows"] if r["direction"] == d)  # noqa: E731
    assert abs(total("in") - read["totalIn"]) < 0.01 and abs(total("out") - read["totalOut"]) < 0.01, "rows do not add up to the statement"
    kept = json.dumps(rows).upper()
    leaked = [word for word in _identifying(read) | {"REF#", "HASH#", "APV"} if word in kept]
    assert not leaked, f"{len(leaked)} identifying words from the statement would be kept"


def preview(rows: list[dict], banks: list[dict], opening: dict) -> None:
    from app import risk
    from app.forecasting import forecast_income_expense
    settings = {"displayCurrency": "KHR", "rateKhrPerUsd": 4000}
    now = datetime.now(BUSINESS_TZ)
    months = sorted({datetime.fromtimestamp(r["occurredAt"] / 1000, BUSINESS_TZ).strftime("%Y-%m") for r in rows})
    money = lambda d: sum(r["amount"] for r in rows if r["direction"] == d)  # noqa: E731
    print(f"{len(rows)} entries in {', '.join(months)}; money in {money('in'):,} riel, money out {money('out'):,} riel")
    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["typeId"]] = by_type.get(r["typeId"], 0) + 1
    print("made-up types:", ", ".join(f"{k} {v}" for k, v in sorted(by_type.items())))
    out = risk.assess(rows, banks, settings, opening=opening["onboarding_financial_entries"], through=now)
    model, stress, capacity = out["model"], out["stress3m"], out["debtCapacity"]
    print("12-month risk:", f"{model['probability']:.1%} ({model['riskClass']}), {model['months']} months, confidence {model.get('confidence')}"
          if model["available"] else f"not available: {model.get('text')}")
    for d in (model.get("topDrivers") or [])[:3]:
        print(f"  {d['direction']}: {d['label']}")
    print("3-month cash stress:", f"{stress['probability']:.1%} ({stress['riskClass']})" if stress["available"] else f"not available: {stress.get('reason')}")
    print("debt capacity:", capacity["level"] if capacity["available"] else f"not available: {capacity.get('reason')}")
    forecast = forecast_income_expense(rows, banks, settings, opening["onboarding_financial_entries"], now=now)
    print("income/expense forecast:", f"{len(forecast['forecast'])} months, coverage {forecast['readiness']['level']}, "
          f"{forecast['activeMonths']} active months" if forecast["available"] else f"not available: {forecast.get('reason')}")


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    pdf, email, write = Path(args[0]), (args[1] if len(args) > 1 else None), "--write" in argv
    period_start = next((a.split("=", 1)[1] for a in argv if a.startswith("--from=")), None)
    read = read_statement(pdf.read_bytes())
    if read.get("currency") != "KHR":
        print("This loader is for riel statements.")
        return 1
    now_ms = int(time.time() * 1000)
    if email is None:
        bank = {"id": "demo-bank-aba", "kind": "bank", "name": "ABA"}
        rows, opening = build(read, bank["id"], now_ms, period_start)
        check(read, rows)
        preview(rows, [bank, {"id": "demo-cash", "kind": "cash", "name": "Cash"}], opening)
        print("Preview only (no account given).")
        return 0

    from app import db
    from app.config import config
    import psycopg
    with psycopg.connect(config.database_url, prepare_threshold=None) as conn:
        found = conn.execute("select id from auth.users where lower(email) = lower(%s)", (email,)).fetchone()
    if not found:
        print(f"No account for {email}: sign up in the app first, then open it once while online.")
        return 1
    user_id = str(found[0])
    banks = db.get_table_rows(user_id, "banks")
    bank = next((b for b in banks if b.get("kind") == "bank" and (b.get("name") or "").upper() == "ABA"), None)
    if bank is None:
        bank = {"id": "demo-bank-aba", "createdAt": now_ms, "updatedAt": now_ms, "deletedAt": None, "syncStatus": "synced",
                "name": "ABA", "kind": "bank", "logoKey": None}
        banks = [*banks, bank]
    rows, opening = build(read, bank["id"], now_ms, period_start)
    check(read, rows)
    preview(rows, banks, opening)
    others = [t for t in db.get_table_rows(user_id, "transactions") if not str(t["id"]).startswith("demo-stmt-")]
    if others:
        print(f"Note: this account already has {len(others)} other entries; they would be mixed with the demo.")
    if not write:
        print("Preview only. Add --write to load it.")
        return 0
    settings = next((s for s in db.get_table_rows(user_id, "settings") if s["id"] == "app"), None)
    if settings is None:
        print("This account has no profile yet: open the app once while online, then run this again.")
        return 1
    if not any(b["id"] == bank["id"] for b in db.get_table_rows(user_id, "banks")):
        db.upsert_rows(user_id, "banks", [bank])
    db.upsert_rows(user_id, "business_assets", opening["business_assets"])
    db.upsert_rows(user_id, "onboarding_financial_entries", opening["onboarding_financial_entries"])
    db.upsert_rows(user_id, "transactions", rows)
    db.upsert_rows(user_id, "settings", [{**settings, **PROFILE, "displayCurrency": "KHR", "onboardingStatus": "completed",
                                          "startOption": "existing", "updatedAt": now_ms}])
    print(f"Loaded into {email}. In the app, pull to refresh or reopen it to sync.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
