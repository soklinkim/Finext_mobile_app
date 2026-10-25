import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import sync as sync_router

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store():
    for table in sync_router._store:
        sync_router._store[table].clear()
    sync_router._version = 0


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
    push([bank(updated=3, name="Old")])
    rows = client.get("/sync/changes").json()["changes"][0]["rows"]
    assert rows[0]["name"] == "New"


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