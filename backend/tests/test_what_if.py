from datetime import datetime

import pytest

from app import risk, what_if
from app.business_time import BUSINESS_TZ
from tests.test_risk import THROUGH, shop
from tests.test_settlement import entry
from tests.test_worked_sample import CASH, ledger, on


def run(rows, **changes):
    return risk.what_if(rows, [CASH], what_if.validate(changes), through=THROUGH)


def draining():
    """Profitable on paper, but the owner takes out more than the profit: cash runs down by $500 a month and falls
    below two weeks of expenses in the next 3 months."""
    rows = [entry("c", "owner_capital", "in", 1_000_000, at=on(2024, 12, 20))]
    for i in range(12):
        rows += [entry(f"s{i}", "service_income", "in", 800_000, at=on(2025, i + 1, 5)),
                 entry(f"r{i}", "rent", "out", 600_000, at=on(2025, i + 1, 6)),
                 entry(f"d{i}", "owner_drawings", "out", 250_000, at=on(2025, i + 1, 7))]
    return rows


def test_no_change_gives_the_same_answers():
    result = run(shop())
    assert result["available"]
    assert result["after"] == result["before"]


def test_cutting_costs_lowers_the_risk_and_raises_profit():
    result = run(draining(), costCut=0.2)
    before, after = result["before"], result["after"]
    assert after["stress3m"]["probability"] < before["stress3m"]["probability"]
    assert after["model12m"]["probability"] <= before["model12m"]["probability"]
    assert after["monthlyProfit"] > before["monthlyProfit"] and after["netMargin"] > before["netMargin"]


def test_higher_prices_raise_the_margin_and_lower_the_stress():
    result = run(draining(), priceChange=0.1)
    assert result["after"]["netMargin"] > result["before"]["netMargin"]
    assert result["after"]["stress3m"]["probability"] < result["before"]["stress3m"]["probability"]


def test_taking_out_less_lowers_the_3_month_stress_only():
    result = run(draining(), drawingsCut=1.0)
    assert result["after"]["stress3m"]["probability"] < result["before"]["stress3m"]["probability"]
    assert result["after"]["model12m"] == result["before"]["model12m"]  # company accounts have no drawings line


def test_collecting_faster_only_counts_when_faster_than_now():
    rows = shop()  # all sales paid at once: nothing owed, so a 30-day target changes nothing
    result = run(rows, collectDays=30)
    assert result["after"] == result["before"]


def test_the_baseline_labels_each_lever_in_money():
    baseline = run(shop())["baseline"]
    assert baseline["monthlyRevenue"] == pytest.approx(1_000_000)
    assert baseline["monthlyCosts"] == pytest.approx(400_000)
    assert baseline["monthlyDrawings"] == pytest.approx(100_000)


def test_too_little_history_says_so():
    result = risk.what_if(shop(months=4), [CASH], {}, through=datetime(2025, 5, 1, tzinfo=BUSINESS_TZ))
    assert not result["available"] and result["reason"] == "not_enough_history"


@pytest.mark.parametrize("bad", [{"costCut": 0.9}, {"priceChange": -0.1}, {"collectDays": "30"}, {"bonus": 1}, {"drawingsCut": True}])
def test_levers_are_validated(bad):
    with pytest.raises(ValueError):
        what_if.validate(bad)


def test_what_if_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    from app.auth import current_user
    from app.main import app
    from app.routers import accounting
    from tests.test_accounting import LedgerDB
    monkeypatch.setattr(accounting, "db", LedgerDB(ledger()))
    app.dependency_overrides[current_user] = lambda: "sme"
    try:
        client = TestClient(app)
        response = client.post("/accounting/risk/what-if", json={"costCut": 0.1, "priceChange": 0.05})
        assert response.status_code == 200 and "available" in response.json()
        assert client.post("/accounting/risk/what-if", json={"costCut": 2}).status_code == 422
    finally:
        app.dependency_overrides.clear()
