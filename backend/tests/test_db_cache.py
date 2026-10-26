from contextlib import contextmanager

from fastapi.testclient import TestClient

from app import db
from app.auth import current_user
from app.main import app
from app.routers import accounting as accounting_router


class FakeCursor:
    def __init__(self, log):
        self.log = log

    def execute(self, query, params):
        self.log.append(query)

    def fetchall(self):
        return []

    def fetchone(self):
        return None


class FakePool:
    def __init__(self):
        self.queries = []

    @contextmanager
    def connection(self):
        @contextmanager
        def cursor():
            yield FakeCursor(self.queries)

        conn = type("Conn", (), {"cursor": staticmethod(cursor)})()
        yield conn


def test_health_report_loads_user_rows_once_per_request(monkeypatch):
    fake = FakePool()
    monkeypatch.setattr(db, "pool", fake)
    monkeypatch.setattr(accounting_router, "db", db)
    app.dependency_overrides[current_user] = lambda: "test-user"
    try:
        client = TestClient(app)
        assert client.get("/accounting/health").status_code == 200
        reads = [q for q in fake.queries if q.startswith("select")]
        assert len(reads) == 1
        fake.queries.clear()
        assert client.get("/accounting/summary").status_code == 200
        assert len([q for q in fake.queries if q.startswith("select")]) == 1
    finally:
        app.dependency_overrides.clear()


def test_cache_is_dropped_after_a_write(monkeypatch):
    fake = FakePool()
    monkeypatch.setattr(db, "pool", fake)
    with db.request_cache():
        db.get_table_rows("u", "transactions")
        db.get_table_rows("u", "banks")
        db.upsert_rows("u", "banks", [{"id": "b1", "updatedAt": 1}])
        db.get_table_rows("u", "banks")
    reads = [q for q in fake.queries if q.startswith("select")]
    assert len(reads) == 2
    # Outside a request the cache is off and every call queries.
    db.get_table_rows("u", "banks")
    assert len([q for q in fake.queries if q.startswith("select")]) == 3
