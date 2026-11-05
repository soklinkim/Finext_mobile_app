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


def test_business_start_reads_app_dates_and_falls_back_to_opening(monkeypatch):
    class DB:
        def __init__(self, settings, opening):
            self.settings, self.opening = settings, opening

        def get_table_rows(self, user_id, table, include_deleted=False):
            return {"settings": [self.settings], "onboarding_financial_entries": self.opening}.get(table, [])

    monkeypatch.setattr(accounting_router, "db", DB({"id": "app", "startOperationDate": "05/03/25"}, []))
    assert accounting_router._business_start("u").strftime("%Y-%m-%d") == "2025-03-05"  # app's DD/MM/YY
    monkeypatch.setattr(accounting_router, "db", DB({"id": "app", "startOperationDate": "2024-12-01"}, []))
    assert accounting_router._business_start("u").strftime("%Y-%m-%d") == "2024-12-01"  # ISO
    monkeypatch.setattr(accounting_router, "db", DB({"id": "app"}, [{"asOf": 1_700_000_000_000}]))
    assert accounting_router._business_start("u").year == 2023  # no profile date: opening balance date


class LedgerDB:
    def __init__(self, transactions, settings=None):
        self.tables = {"transactions": transactions, "banks": [{"id": "cash", "kind": "cash", "deletedAt": None}],
                       "settings": [settings or {"id": "app"}]}

    def get_table_rows(self, user_id, table, include_deleted=False):
        return self.tables.get(table, [])


def test_quarter_ebitda_leaves_out_other_income(monkeypatch):
    """Rules §9.3 / §12 Q7: EBIT = operating profit and EBITDA = operating profit + depreciation, no other income."""
    from datetime import datetime
    from app.business_time import BUSINESS_TZ
    from tests.test_settlement import entry
    from tests.test_worked_sample import on
    rows = [entry("s", "service_income", "in", 10_000, at=on(2025, 2, 1)),
            entry("r", "rent", "out", 4_000, at=on(2025, 2, 2)),
            entry("g", "other_income", "in", 1_000, at=on(2025, 2, 3))]
    monkeypatch.setattr(accounting_router, "db", LedgerDB(rows))
    q = accounting_router._quarter_profit("u", "USD", 4000, datetime(2025, 1, 1, tzinfo=BUSINESS_TZ), datetime(2025, 4, 1, tzinfo=BUSINESS_TZ))
    assert (q["ebit"], q["ebitda"]) == (6_000, 6_000)


def test_sales_spike_waits_for_three_complete_months(monkeypatch):
    """Rules §12 Q11: no spike alert from a short history (one month's sales would look like triple)."""
    import time
    from datetime import datetime, timedelta
    from app.business_time import BUSINESS_TZ
    from tests.test_settlement import entry
    now = datetime.now(BUSINESS_TZ)
    last_month = int((now.replace(day=1) - timedelta(days=10)).timestamp() * 1000)
    rows = [entry("old", "product_sale", "in", 10_000, meta={"cost": 0}, at=last_month),
            entry("new", "product_sale", "in", 10_000, meta={"cost": 0}, at=int(time.time() * 1000) - 1000)]
    began = (now.replace(day=1) - timedelta(days=40)).strftime("%Y-%m-%d")
    monkeypatch.setattr(accounting_router, "db", LedgerDB(rows, {"id": "app", "startOperationDate": began}))
    assert accounting_router._sales_spike("u") == (None, {})
    long_ago = (now.replace(day=1) - timedelta(days=200)).strftime("%Y-%m-%d")
    monkeypatch.setattr(accounting_router, "db", LedgerDB(rows, {"id": "app", "startOperationDate": long_ago}))
    assert accounting_router._sales_spike("u")[0] is not None


def test_quarter_windows_run_from_the_quarter_start_and_compare_with_the_quarter_before():
    from datetime import datetime
    from app.business_time import BUSINESS_TZ
    now = datetime(2026, 11, 4, 10, tzinfo=BUSINESS_TZ)
    start, end, prior_start, prior_end, name, prior_name = accounting_router._statement_period(now, "quarterly")
    assert (start.month, start.day, prior_start.month, prior_start.year) == (10, 1, 7, 2026)
    assert end > now and prior_end <= start  # this quarter so far vs the same stretch of the last one
    assert (name, prior_name) == ("Q4 2026", "Q3 2026")
    january = datetime(2026, 1, 20, tzinfo=BUSINESS_TZ)
    assert accounting_router._statement_period(january, "quarterly")[4:] == ("Q1 2026", "Q4 2025")


def test_quarterly_ratios_cover_the_whole_quarter_so_far(monkeypatch):
    """A sale earlier in the quarter counts in the quarterly margin; the monthly one sees only this month."""
    import time
    from datetime import datetime, timedelta
    from app.business_time import BUSINESS_TZ
    from tests.test_settlement import entry
    now = datetime.now(BUSINESS_TZ)
    quarter_start = accounting_router._quarter_start(now)
    rows = [entry("early", "product_sale", "in", 10_000, meta={"cost": 0}, at=int((quarter_start + timedelta(hours=1)).timestamp() * 1000)),
            entry("today", "product_sale", "in", 10_000, meta={"cost": 5_000}, at=int(time.time() * 1000) - 1000)]
    began = (now - timedelta(days=400)).strftime("%Y-%m-%d")
    monkeypatch.setattr(accounting_router, "db", LedgerDB(rows, {"id": "app", "startOperationDate": began}))

    def margin(period):
        result = accounting_router.ratios("u", period=period)
        assert result["periodKind"] == period
        return next(r for r in result["ratios"] if r["id"] == "gross_margin")["value"]

    assert margin("quarterly") == 0.75
    same_month = quarter_start.month == now.month
    assert margin("monthly") == (0.75 if same_month else 0.5)
    # Called directly, the default stays monthly.
    assert accounting_router.ratios("u")["periodKind"] == "monthly"


def test_ratios_reject_unknown_periods(monkeypatch):
    monkeypatch.setattr(accounting_router, "db", EmptyDB())
    app.dependency_overrides[current_user] = lambda: "test-user"
    try:
        client = TestClient(app)
        assert client.get("/accounting/ratios?period=quarterly").json()["periodKind"] == "quarterly"
        assert client.get("/accounting/ratios?period=weekly").status_code == 400
    finally:
        app.dependency_overrides.clear()
