"""Mark as paid (customer / supplier payments) and Reverse, per the spec's Actions sheet."""
import json

from fastapi.testclient import TestClient

from app.auth import current_user
from app.bookkeeping import depreciation_entries, journal_for, open_items, relation_errors
from app.main import app
from app.routers import sync as sync_router
from tests.test_sync import FakeDB

BANKS = {"cash": "cash", "aba": "bank"}


def entry(id, type_id, direction, amount=10000, pay="cash", bank="cash", meta=None, at=1_000, **extra):
    row = {"id": id, "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending", "title": type_id,
           "typeId": type_id, "direction": direction, "amount": amount, "currency": "USD", "exchangeRate": 4000,
           "payMethod": pay, "bankId": None if pay == "later" else bank, "toBankId": None, "categoryId": None,
           "counterparty": "Dara", "note": "n", "occurredAt": at, "reviewFlag": False,
           "meta": json.dumps(meta) if meta is not None else None}
    return {**row, **extra}


def payment(id, settles, amount, kind="customer_payment", direction="in"):
    return entry(id, kind, direction, amount, meta={"settlesId": settles})


def reversal_of(id, original):
    keys = ("typeId", "direction", "amount", "currency", "payMethod", "bankId", "toBankId", "counterparty", "note", "meta")
    snapshot = {k: original[k] for k in keys}
    snapshot["meta"] = json.loads(original["meta"]) if original["meta"] else None
    opposite = {"in": "out", "out": "in", "move": "move"}[original["direction"]]
    return entry(id, "reversal", opposite, original["amount"], pay=original["payMethod"], bank=original["bankId"],
                 meta={"reversesId": original["id"], "reverses": snapshot})


def lines(tx):
    return sorted((l["side"], l["accountCode"], l["amount"]) for l in journal_for(tx, BANKS, {}))


# ---------------------------------------------------------------- posting

def test_customer_and_supplier_payments_post_per_spec():
    assert lines(payment("p1", "s1", 4000)) == [("credit", "1100", 4000), ("debit", "1000", 4000)]
    assert lines(payment("p2", "b1", 2500, "supplier_payment", "out")) == [("credit", "1000", 2500), ("debit", "2000", 2500)]


def test_reversal_swaps_every_line_of_the_original():
    sale = entry("s1", "product_sale", "in", meta={"cost": 6000})
    assert lines(reversal_of("r1", sale)) == sorted(
        (("credit" if side == "debit" else "debit"), code, amount) for side, code, amount in lines(sale))


def test_reversal_must_be_opposite_and_match():
    sale = entry("s1", "product_sale", "in")
    bad = reversal_of("r1", sale)
    bad["direction"] = "in"
    try:
        journal_for(bad, BANKS, {})
        raise AssertionError("expected a PostingError")
    except Exception as exc:
        assert "opposite" in str(exc)


# ---------------------------------------------------------------- guards (Actions sheet)

def test_payment_cannot_exceed_what_is_owed_and_partial_payments_add_up():
    sale = entry("s1", "product_sale", "in", pay="later")
    first = payment("p1", "s1", 6000)
    rows = {r["id"]: r for r in (sale, first)}
    assert relation_errors(first, rows) is None
    too_much = payment("p2", "s1", 5000)
    assert "more than the amount still owed" in relation_errors(too_much, {**rows, "p2": too_much})
    exact = payment("p3", "s1", 4000)
    assert relation_errors(exact, {**rows, "p3": exact}) is None


def test_payment_needs_a_pay_later_entry_in_the_same_direction():
    cash_sale = entry("s1", "product_sale", "in")
    pay = payment("p1", "s1", 100)
    assert "pay-later" in relation_errors(pay, {"s1": cash_sale, "p1": pay})
    bill = entry("b1", "rent", "out", pay="later")
    wrong = payment("p2", "b1", 100)  # customer payment against a supplier bill
    assert "same direction" in relation_errors(wrong, {"b1": bill, "p2": wrong})


def test_reverse_once_only_and_payments_first():
    bill = entry("b1", "rent", "out", pay="later")
    paid = payment("p1", "b1", 3000, "supplier_payment", "out")
    rev = reversal_of("r1", bill)
    assert "payments recorded" in relation_errors(rev, {"b1": bill, "p1": paid, "r1": rev})
    # reverse the payment first, then the bill
    rev_pay = reversal_of("r0", paid)
    rows = {"b1": bill, "p1": paid, "r0": rev_pay, "r1": rev}
    assert relation_errors(rev_pay, rows) is None
    assert relation_errors(rev, rows) is None
    again = reversal_of("r2", bill)
    assert "already been reversed" in relation_errors(again, {**rows, "r2": again})
    assert "cannot be reversed" in relation_errors(reversal_of("r3", rev), {**rows, "r3": reversal_of("r3", rev)})


def test_open_items_track_partial_payments_and_reversals():
    sale = entry("s1", "product_sale", "in", pay="later", amount=10000)
    bill = entry("b1", "rent", "out", pay="later", amount=5000)
    items = {i["id"]: i["open"] for i in open_items([sale, bill, payment("p1", "s1", 4000)])}
    assert items == {"s1": 6000, "b1": 5000}
    assert open_items([bill, reversal_of("r1", bill)]) == []


def test_reversed_equipment_stops_depreciating():
    fridge = entry("e1", "equipment_purchase", "out", amount=36000, meta={"assetName": "Fridge", "usefulLifeYears": 1})
    assert depreciation_entries([fridge], through=10_000_000_000)
    assert depreciation_entries([fridge, reversal_of("r1", fridge)], through=10_000_000_000) == []


# ---------------------------------------------------------------- sync push enforces the guards

def test_push_rejects_overpayment_and_accepts_valid_payment(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(sync_router, "db", fake)
    app.dependency_overrides[current_user] = lambda: "user-1"
    client = TestClient(app)
    try:
        cash = {"id": "cash", "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending",
                "name": "Cash", "kind": "cash", "logoKey": None}
        sale = entry("s1", "product_sale", "in", pay="later", amount=10000)
        res = client.post("/sync/push", json={"batches": [
            {"table": "banks", "rows": [cash]},
            {"table": "transactions", "rows": [sale, payment("p1", "s1", 7000), payment("p2", "s1", 7000)]},
        ]}).json()
        assert sorted(res["accepted"]["transactions"]) == ["p1", "s1"]
        assert res["rejected"][0]["id"] == "p2" and "still owed" in res["rejected"][0]["reason"]
    finally:
        app.dependency_overrides.clear()


def test_statements_stay_balanced_after_payments_and_reversals(monkeypatch):
    from app.routers import accounting as accounting_router
    fake = FakeDB()
    monkeypatch.setattr(sync_router, "db", fake)
    monkeypatch.setattr(accounting_router, "db", fake)
    app.dependency_overrides[current_user] = lambda: "user-1"
    client = TestClient(app)
    try:
        cash = {"id": "cash", "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending",
                "name": "Cash", "kind": "cash", "logoKey": None}
        import time
        now = int(time.time() * 1000)
        sale = entry("s1", "product_sale", "in", pay="later", amount=10000, meta={"cost": 6000}, at=now - 5000)
        rent = entry("r1", "rent", "out", amount=3000, at=now - 4000)
        res = client.post("/sync/push", json={"batches": [
            {"table": "banks", "rows": [cash]},
            {"table": "transactions", "rows": [sale, rent, payment("p1", "s1", 4000) | {"occurredAt": now - 3000},
                                               reversal_of("x1", rent) | {"occurredAt": now - 2000}]},
        ]}).json()
        assert res["rejected"] == [] and len(res["accepted"]["transactions"]) == 4

        report = client.get("/accounting/statements").json()
        lines = {line["key"]: line["current"] for s in report["balance"]["sections"] for line in s["lines"]}
        assert report["balance"]["check"]["difference"] == 0
        assert report["cashflow"]["check"]["difference"] == 0
        assert lines["receivables"] == 6000          # 100 owed - 40 paid
        assert lines["cash"] == 4000                 # 40 received; the reversed rent is back in the drawer
        income = {line["key"]: line["current"] for s in report["income"]["sections"] for line in s["lines"]}
        assert income["rent"] == 0                   # rent and its reversal cancel
        assert income["sales"] == 10000
    finally:
        app.dependency_overrides.clear()


def test_balance_sheet_equity_follows_the_statement_map(monkeypatch):
    """Earlier drawings reduce retained earnings brought forward; the drawings line is this period only."""
    from datetime import datetime, timezone
    from app.routers import accounting as accounting_router
    fake = FakeDB()
    monkeypatch.setattr(sync_router, "db", fake)
    monkeypatch.setattr(accounting_router, "db", fake)
    app.dependency_overrides[current_user] = lambda: "user-1"
    client = TestClient(app)
    try:
        now = datetime.now(timezone.utc)
        this_month = int(datetime(now.year, now.month, 1, tzinfo=timezone.utc).timestamp() * 1000) + 3_600_000
        last_month = this_month - 20 * 86_400_000
        cash = {"id": "cash", "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending",
                "name": "Cash", "kind": "cash", "logoKey": None}
        rows = [entry("c1", "owner_capital", "in", amount=50000, at=last_month - 1000),
                entry("d1", "owner_drawings", "out", amount=1000, at=last_month),
                entry("d2", "owner_drawings", "out", amount=500, at=this_month)]
        client.post("/sync/push", json={"batches": [{"table": "banks", "rows": [cash]}, {"table": "transactions", "rows": rows}]})
        report = client.get("/accounting/statements?period=monthly").json()
        lines = {line["key"]: line["current"] for s in report["balance"]["sections"] for line in s["lines"]}
        assert lines["drawings"] == -500        # this period only
        assert lines["retained"] == -1000       # earlier drawings come off retained earnings brought forward
        assert lines["equity"] == 50000 - 1500
        assert {"shortLoans", "otherBorrowings", "longLoans", "leases"} <= set(lines)  # separate lines per the map
        assert report["balance"]["check"]["difference"] == 0
        assert report["cashflow"]["check"]["difference"] == 0
    finally:
        app.dependency_overrides.clear()


def test_reversed_sales_do_not_count_as_credit_sales_or_spikes(monkeypatch):
    from app.routers import accounting as accounting_router
    fake = FakeDB()
    monkeypatch.setattr(accounting_router, "db", fake)
    sale = entry("s1", "product_sale", "in", pay="later")
    fake.upsert_rows("user-1", "transactions", [sale, reversal_of("x1", sale)])
    assert accounting_router._effective_transactions("user-1") == [reversal_of("x1", sale)]


# ---------------------------------------------------------------- write off unpaid amount (spec: Actions)

def write_off(id, settles, amount, note="Customer closed the shop"):
    return entry(id, "write_off", "out", amount, pay="later", meta={"settlesId": settles}, note=note, reviewFlag=True)


def test_write_off_posts_bad_debt_against_receivables():
    assert lines(write_off("w1", "s1", 2500)) == [("credit", "1100", 2500), ("debit", "6990", 2500)]
    for bad, reason in ((write_off("w2", "s1", 100, note=" "), "note is required"),
                        (write_off("w3", "s1", 100) | {"payMethod": "cash", "bankId": "cash"}, "moves no money"),
                        (write_off("w4", "s1", 100) | {"meta": None}, "which unpaid sale")):
        try:
            journal_for(bad, BANKS, {})
            raise AssertionError("expected a PostingError")
        except Exception as exc:
            assert reason in str(exc)


def test_write_off_only_clears_what_a_customer_still_owes():
    sale = entry("s1", "product_sale", "in", pay="later")
    paid = payment("p1", "s1", 6000)
    rows = {r["id"]: r for r in (sale, paid)}
    assert "more than the amount still owed" in relation_errors(write_off("w1", "s1", 5000), {**rows, "w1": write_off("w1", "s1", 5000)})
    rest = write_off("w2", "s1", 4000)
    assert relation_errors(rest, {**rows, "w2": rest}) is None
    assert open_items([sale, paid, rest]) == []
    # Once written off, no further payment fits, and the sale cannot be reversed until the write-off is.
    late = payment("p2", "s1", 1)
    assert "still owed" in relation_errors(late, {**rows, "w2": rest, "p2": late})
    rev = reversal_of("r1", sale)
    assert "payments recorded" in relation_errors(rev, {**rows, "w2": rest, "r1": rev})
    # Supplier bills and cash sales cannot be written off; nor can a write-off settle anything itself.
    bill = entry("b1", "rent", "out", pay="later")
    cash_sale = entry("c1", "product_sale", "in")
    for target in (bill, cash_sale):
        row = write_off("w3", target["id"], 100)
        assert "only an unpaid customer sale" in relation_errors(row, {target["id"]: target, "w3": row})
    on_write_off = payment("p3", "w2", 100, "supplier_payment", "out")
    assert "same direction" in relation_errors(on_write_off, {**rows, "w2": rest, "p3": on_write_off})


def test_reversing_a_write_off_reopens_the_amount():
    sale = entry("s1", "product_sale", "in", pay="later")
    cleared = write_off("w1", "s1", 10000)
    undo = reversal_of("r1", cleared)
    assert lines(undo) == [("credit", "6990", 10000), ("debit", "1100", 10000)]
    assert [item["open"] for item in open_items([sale, cleared, undo])] == [10000]


def test_statements_after_a_write_off(monkeypatch):
    from app.routers import accounting as accounting_router
    fake = FakeDB()
    monkeypatch.setattr(sync_router, "db", fake)
    monkeypatch.setattr(accounting_router, "db", fake)
    app.dependency_overrides[current_user] = lambda: "user-1"
    client = TestClient(app)
    try:
        import time
        now = int(time.time() * 1000)
        cash = {"id": "cash", "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending",
                "name": "Cash", "kind": "cash", "logoKey": None}
        sale = entry("s1", "service_income", "in", pay="later", amount=10000, at=now - 5000)
        res = client.post("/sync/push", json={"batches": [
            {"table": "banks", "rows": [cash]},
            {"table": "transactions", "rows": [sale, payment("p1", "s1", 4000) | {"occurredAt": now - 4000},
                                               write_off("w1", "s1", 6000) | {"occurredAt": now - 3000},
                                               write_off("w2", "s1", 1) | {"occurredAt": now - 2000}]},
        ]}).json()
        assert [r["id"] for r in res["rejected"]] == ["w2"]
        report = client.get("/accounting/statements").json()
        balance = {line["key"]: line["current"] for s in report["balance"]["sections"] for line in s["lines"]}
        income = {line["key"]: line["current"] for s in report["income"]["sections"] for line in s["lines"]}
        assert balance["receivables"] == 0 and balance["cash"] == 4000
        assert income["otherOperating"] == -6000 and income["net"] == 4000
        assert report["balance"]["check"]["difference"] == 0
        assert report["cashflow"]["check"]["difference"] == 0
    finally:
        app.dependency_overrides.clear()
