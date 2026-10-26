import pytest
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.routers import sync as sync_router


class FakeDB:
    """In-memory stand-in for app.db with the same behaviour."""

    def __init__(self):
        self.rows = {}
        self.seq = 0

    def upsert_rows(self, user_id, table, rows, return_rows=False):
        stored = {}
        for r in rows:
            key = (user_id, table, r["id"])
            cur = self.rows.get(key)
            if cur is None or r["updatedAt"] >= cur["data"]["updatedAt"]:
                self.seq += 1
                self.rows[key] = {"seq": self.seq, "data": r}
            stored[r["id"]] = self.rows[key]["data"]
        return stored if return_rows else None

    def changes_since(self, user_id, cursor, limit=500):
        items = [(v["seq"], k[1], v["data"]) for k, v in self.rows.items()
                 if k[0] == user_id and v["seq"] > cursor]
        return sorted(items, key=lambda x: x[0])[:limit]

    def latest_seq(self, user_id):
        return max((v["seq"] for k, v in self.rows.items() if k[0] == user_id), default=0)

    def get_table_rows(self, user_id, table, include_deleted=False):
        return [v["data"] for k, v in self.rows.items()
                if k[0] == user_id and k[1] == table
                and (include_deleted or v["data"].get("deletedAt") is None)]


CURRENT = {"user": "user-1"}
client = TestClient(app)


@pytest.fixture(autouse=True)
def fake_env(monkeypatch):
    monkeypatch.setattr(sync_router, "db", FakeDB())
    CURRENT["user"] = "user-1"
    app.dependency_overrides[current_user] = lambda: CURRENT["user"]
    yield
    app.dependency_overrides.clear()


def bank(id="b1", updated=1, name="Cash drawer", deleted=None, kind="cash"):
    return {"id": id, "createdAt": 1, "updatedAt": updated, "deletedAt": deleted,
            "syncStatus": "pending", "name": name, "kind": kind, "logoKey": None}


def push(rows, table="banks"):
    return client.post("/sync/push", json={"batches": [{"table": table, "rows": rows}]})


def test_push_then_pull():
    r = push([bank()])
    assert r.status_code == 200
    assert r.json()["accepted"]["banks"] == ["b1"]
    ch = client.get("/sync/changes").json()
    assert ch["changes"][0]["rows"][0]["id"] == "b1"
    assert ch["cursor"] == "1"


def test_push_is_idempotent():
    push([bank()])
    push([bank()])
    rows = client.get("/sync/changes").json()["changes"][0]["rows"]
    assert len(rows) == 1


def test_bad_row_rejected_good_row_kept():
    r = push([bank("b1"), bank("b2", kind="piggy")]).json()
    assert r["accepted"]["banks"] == ["b1"]
    assert r["rejected"][0]["id"] == "b2"


def test_last_write_wins():
    push([bank(updated=5, name="New")])
    response = push([bank(updated=3, name="Old")]).json()
    assert response["accepted"]["banks"] == []
    assert response["conflicts"][0]["row"]["name"] == "New"
    rows = client.get("/sync/changes").json()["changes"][0]["rows"]
    assert rows[0]["name"] == "New"


def test_rejected_bank_reference_is_not_stored():
    tx = {
        "id": "tx1", "createdAt": 1, "updatedAt": 1, "deletedAt": None,
        "title": "Sale", "typeId": "service_income", "direction": "in", "groupId": "sales",
        "amount": 1000, "currency": "USD", "exchangeRate": 4000, "payMethod": "cash",
        "bankId": "missing-bank", "toBankId": None, "categoryId": None,
        "counterparty": None, "note": None, "occurredAt": 1, "reviewFlag": False, "meta": None,
    }
    response = push([tx], table="transactions").json()
    assert response["accepted"]["transactions"] == []
    assert "account does not exist" in response["rejected"][0]["reason"]
    assert client.get("/sync/changes").json()["changes"] == []


def test_soft_delete_propagates():
    push([bank()])
    push([bank(updated=9, deleted=9)])
    rows = client.get("/sync/changes", params={"since": "1"}).json()["changes"][0]["rows"]
    assert rows[0]["deletedAt"] == 9


def test_pull_since_cursor_returns_only_new():
    push([bank("b1")])
    cursor = client.get("/sync/changes").json()["cursor"]
    push([bank("b2")])
    rows = client.get("/sync/changes", params={"since": cursor}).json()["changes"][0]["rows"]
    assert [r["id"] for r in rows] == ["b2"]


def test_users_cannot_see_each_others_data():
    push([bank("b1")])
    CURRENT["user"] = "user-2"
    assert client.get("/sync/changes").json()["changes"] == []


def test_missing_token_is_rejected():
    app.dependency_overrides.clear()
    r = client.get("/sync/changes")
    assert r.status_code in (401, 403)


def test_pull_pages_until_caught_up(monkeypatch):
    monkeypatch.setattr(sync_router, "PULL_PAGE_SIZE", 2)
    push([bank("b1"), bank("b2"), bank("b3")])
    first = client.get("/sync/changes").json()
    assert first["hasMore"] is True
    assert len(first["changes"][0]["rows"]) == 2
    second = client.get(f"/sync/changes?since={first['cursor']}").json()
    assert second["hasMore"] is False
    assert [r["id"] for r in second["changes"][0]["rows"]] == ["b3"]


def test_pull_tells_client_to_start_over_when_server_lost_data():
    push([bank("b1")])
    cursor = client.get("/sync/changes").json()["cursor"]
    # Server wiped (e.g. database reset): the client's cursor is now ahead of everything.
    sync_router.db.rows.clear()
    res = client.get(f"/sync/changes?since={cursor}").json()
    assert res["reset"] is True and res["cursor"] == "0"
    # A normal, up-to-date client is not told to reset.
    push([bank("b2")])
    latest = client.get("/sync/changes").json()["cursor"]
    assert client.get(f"/sync/changes?since={latest}").json()["reset"] is False
