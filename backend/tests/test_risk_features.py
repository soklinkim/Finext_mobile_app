"""Layer 2 inputs from the books: the risk model's ratios, with the training data's definitions."""
from datetime import datetime

import pytest

from app.business_time import BUSINESS_TZ
from app.risk_features import FEATURES, MISSING_TEXT, risk_features
from app.snapshots import monthly_snapshots
from tests.test_settlement import entry
from tests.test_worked_sample import CASH, ledger, on, usd


def at(year, month):
    return datetime(year, month, 1, tzinfo=BUSINESS_TZ)


def service_business(months: int, start=(2023, 1)):
    """Capital the month before (a partial month, left out), then `months` complete months of sales and rent."""
    year, month = start
    rows = [entry("c", "owner_capital", "in", 500_000, at=on(year - 1, 12, 20) if month == 1 else on(year, month - 1, 20))]
    for i in range(months):
        y, m = divmod(month - 1 + i, 12)
        rows += [entry(f"s{i}", "service_income", "in", 100_000 + 1_000 * i, at=on(year + y, m + 1, 5)),
                 entry(f"r{i}", "rent", "out", 40_000, at=on(year + y, m + 1, 6))]
    y, m = divmod(month - 1 + months, 12)
    return monthly_snapshots(rows, [CASH], through=at(year + y, m + 1))


def test_ratios_match_the_worked_sample_statements():
    snaps = monthly_snapshots(ledger(), [CASH], through=at(2026, 1))
    out = risk_features(snaps)
    f, december = out["features"], snaps[-1]["features"]
    assert (out["asOf"], out["months"], out["annualised"]) == ("2025-12", 12, False)
    # §8.4: profit 6,650 on assets 33,950, equity 18,750, revenue 71,000 for 2025.
    assert f["net_profit_to_assets"] == pytest.approx(usd(6_650) / usd(33_950))
    assert f["equity_to_assets"] == pytest.approx(usd(18_750) / usd(33_950))
    assert f["liabilities_to_assets"] == pytest.approx(1 - usd(18_750) / usd(33_950))
    assert f["asset_turnover"] == pytest.approx(usd(71_000) / usd(33_950))
    assert f["net_margin"] == pytest.approx(usd(6_650) / usd(71_000))
    assert f["current_ratio"] == pytest.approx(december["current_assets"] / december["current_liabilities"])
    assert f["retained_earnings_to_assets"] == pytest.approx((december["equity"] - december["owner_capital"]) / usd(33_950))
    assert f["receivable_days"] == pytest.approx(december["receivables"] / usd(71_000) * 365)
    assert list(f) == FEATURES


def test_every_missing_ratio_has_a_reason_the_dashboard_can_show():
    out = risk_features(service_business(12))
    for name, value in out["features"].items():
        if value is None:
            assert out["reasons"][name] in MISSING_TEXT
    # A service business has no cost of goods and, here, no loans.
    assert out["reasons"]["payable_days"] == "no_costs"
    assert out["reasons"]["interest_coverage"] == "no_interest"


def test_no_score_before_six_complete_months():
    assert risk_features(service_business(5))["features"] is None
    assert risk_features([])["confidence"] == "none"


def test_a_short_history_is_scaled_to_a_year_with_low_confidence():
    eight, twelve = risk_features(service_business(8)), risk_features(service_business(12))
    assert eight["annualised"] and eight["confidence"] == "low" and eight["months"] == 8
    assert twelve["confidence"] == "normal"
    # 8 months of rent scaled to 12: the rent share of sales is the same as a full year would show.
    assert eight["features"]["costs_to_sales"] == pytest.approx(40_000 * 8 / sum(100_000 + 1_000 * i for i in range(8)))


def test_sales_growth_needs_two_full_years():
    assert risk_features(service_business(23))["reasons"]["sales_growth"] == "not_yet_available"
    out = risk_features(service_business(24))
    this_year = sum(100_000 + 1_000 * i for i in range(12, 24))
    last_year = sum(100_000 + 1_000 * i for i in range(12))
    assert out["features"]["sales_growth"] == pytest.approx(this_year / last_year)
