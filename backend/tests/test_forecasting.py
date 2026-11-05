"""Income and expense forecast: shown from three active months, with coverage saying how much it rests on."""
from datetime import datetime

from app.business_time import BUSINESS_TZ
from app.forecasting import forecast_income_expense
from tests.test_settlement import entry

NOW = datetime(2026, 11, 5, 12, tzinfo=BUSINESS_TZ)
BANKS = [{"id": "cash", "kind": "cash"}]


def _ms(year: int, month: int) -> int:
    return int(datetime(year, month, 15, 12, tzinfo=BUSINESS_TZ).timestamp() * 1000)


def _sales(months: list[tuple[int, int]]) -> list[dict]:
    rows = []
    for i, (year, month) in enumerate(months):
        rows.append(entry(f"s{i}", "service_income", "in", 50_000, at=_ms(year, month)))
        rows.append(entry(f"c{i}", "rent", "out", 20_000, at=_ms(year, month)))
    return rows


def test_three_active_months_give_a_forecast_with_moderate_coverage():
    # May and June have no entries; July to October do.
    result = forecast_income_expense(_sales([(2026, 7), (2026, 8), (2026, 9), (2026, 10)]), BANKS, {"displayCurrency": "USD"}, now=NOW)
    assert result["available"] and result["readiness"]["forecastEligible"]
    assert result["activeMonths"] == 4 and result["readiness"]["level"] == "moderate"
    assert len(result["forecast"]) == 3
    assert "4 of them with records" in result["note"]


def test_two_active_months_give_totals_but_no_forecast():
    result = forecast_income_expense(_sales([(2026, 9), (2026, 10)]), BANKS, {"displayCurrency": "USD"}, now=NOW)
    assert not result["available"] and result["forecast"] == []
    assert result["readiness"]["level"] == "low" and "3 active completed months" in result["reason"]
    assert result["basicAnalysis"]["totalIncome"] == 100_000


def test_six_active_months_give_high_coverage():
    months = [(2026, m) for m in range(5, 11)]
    result = forecast_income_expense(_sales(months), BANKS, {"displayCurrency": "USD"}, now=NOW)
    assert result["available"] and result["readiness"]["level"] == "high"
    assert "with records" not in result["note"]
