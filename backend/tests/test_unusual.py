from datetime import datetime

from app.business_time import BUSINESS_TZ
from app.unusual import find_unusual
from tests.test_settlement import entry, reversal_of
from tests.test_worked_sample import on

NOW = datetime(2026, 1, 20, tzinfo=BUSINESS_TZ)


def codes(rows):
    return {item["id"]: item["code"] for item in find_unusual(rows, NOW)}


def monthly_rent(amount=400_000, months=6):
    """Rent paid on the 5th of each month, Aug 2025 to Jan 2026."""
    return [entry(f"rent{i}", "rent", "out", amount, at=on(2025 + (7 + i) // 12, (7 + i) % 12 + 1, 5)) for i in range(months)]


def test_ordinary_books_raise_nothing():
    rows = monthly_rent() + [entry(f"s{i}", "product_sale", "in", 150_000 + i * 1_000, at=on(2026, 1, 1 + i)) for i in range(10)]
    assert codes(rows) == {}


def test_the_same_entry_twice_in_two_days_is_a_likely_duplicate():
    rows = [entry("a", "wages", "out", 120_000, at=on(2026, 1, 10)), entry("b", "wages", "out", 120_000, at=on(2026, 1, 11))]
    found = find_unusual(rows, NOW)
    assert [(item["id"], item["code"]) for item in found] == [("b", "duplicate")]
    assert found[0]["params"]["otherId"] == "a"


def test_same_amount_a_week_apart_or_to_someone_else_is_not_a_duplicate():
    rows = [entry("a", "wages", "out", 120_000, at=on(2026, 1, 3)), entry("b", "wages", "out", 120_000, at=on(2026, 1, 10)),
            entry("c", "wages", "out", 120_000, at=on(2026, 1, 10), counterparty="Sokha")]
    assert codes(rows) == {}


def test_a_cost_far_above_its_usual_amount_is_a_spike():
    rows = [entry(f"u{i}", "utilities", "out", 50_000 + i * 500, at=on(2025, 9 + i % 4, 2 + i)) for i in range(6)]
    rows.append(entry("big", "utilities", "out", 260_000, at=on(2026, 1, 15)))
    assert codes(rows) == {"big": "spike"}


def test_ten_times_the_usual_amount_reads_as_an_extra_zero():
    rows = monthly_rent(months=5)
    rows.append(entry("typo", "rent", "out", 4_000_000, at=on(2026, 1, 18)))
    assert codes(rows)["typo"] == "extra_zero"


def test_spikes_need_enough_history():
    rows = [entry("u1", "utilities", "out", 50_000, at=on(2025, 12, 2)), entry("u2", "utilities", "out", 500_000, at=on(2026, 1, 2))]
    assert codes(rows) == {}


def test_rent_recorded_as_income_in_a_month_without_rent():
    rows = monthly_rent(months=5)  # Aug to Dec: no rent in January
    rows.append(entry("oops", "other_income", "in", 400_000, at=on(2026, 1, 5)))
    found = find_unusual(rows, NOW)
    assert [(item["id"], item["code"]) for item in found] == [("oops", "maybe_expense")]
    assert found[0]["params"]["usualType"] == "rent"


def test_income_matching_a_cost_already_paid_that_month_is_fine():
    rows = monthly_rent(months=6)  # January rent was paid
    rows.append(entry("sale", "product_sale", "in", 400_000, at=on(2026, 1, 9)))
    assert codes(rows) == {}


def test_a_future_date_is_flagged():
    assert codes([entry("later", "product_sale", "in", 10_000, at=on(2026, 3, 1))]) == {"later": "future_date"}


def test_cancelled_entries_and_old_ones_are_ignored():
    first, second = entry("a", "wages", "out", 120_000, at=on(2026, 1, 10)), entry("b", "wages", "out", 120_000, at=on(2026, 1, 11))
    assert codes([first, second, reversal_of("r", second)]) == {}
    old = [entry("x", "wages", "out", 120_000, at=on(2025, 3, 10)), entry("y", "wages", "out", 120_000, at=on(2025, 3, 11))]
    assert codes(old) == {}


def test_unusual_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    from app.auth import current_user
    from app.main import app
    from app.routers import accounting
    from tests.test_accounting import LedgerDB
    from tests.test_worked_sample import ledger
    monkeypatch.setattr(accounting, "db", LedgerDB(ledger()))
    app.dependency_overrides[current_user] = lambda: "sme"
    try:
        body = TestClient(app).get("/accounting/unusual").json()
        assert isinstance(body["items"], list)
    finally:
        app.dependency_overrides.clear()
