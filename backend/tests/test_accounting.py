from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.routers import accounting as accounting_router


class EmptyDB:
    def get_table_rows(self, user_id, table, include_deleted=False):
        return []


def test_health_endpoint_returns_ratios_for_empty_ledger(monkeypatch):
    monkeypatch.setattr(accounting_router, "db", EmptyDB())
    app.dependency_overrides[current_user] = lambda: "test-user"
    try:
        response = TestClient(app).get("/accounting/health")
        assert response.status_code == 200
        assert response.json()["ratios"]
    finally:
        app.dependency_overrides.clear()


def test_summary_and_statements_default_to_monthly(monkeypatch):
    monkeypatch.setattr(accounting_router, "db", EmptyDB())
    app.dependency_overrides[current_user] = lambda: "test-user"
    try:
        client = TestClient(app)
        assert client.get("/accounting/summary").status_code == 200
        assert client.get("/accounting/statements").status_code == 200
        assert client.get("/accounting/statements?period=bogus").status_code == 400
        # Called directly (not via HTTP), the period default must still be a plain string.
        assert accounting_router.statements("test-user")["income"]["kind"] == "income"
    finally:
        app.dependency_overrides.clear()


def test_daily_analysis_runs_monday_to_sunday(monkeypatch):
    monkeypatch.setattr(accounting_router, "db", EmptyDB())
    app.dependency_overrides[current_user] = lambda: "test-user"
    try:
        labels = TestClient(app).get("/accounting/analysis?period=daily").json()["labels"]
        assert labels == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    finally:
        app.dependency_overrides.clear()
