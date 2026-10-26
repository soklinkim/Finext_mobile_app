"""Features for one company in one period, built only from that period and earlier ones (spec: no future data).

They follow the spec's financial areas as far as the US data allows. It has no cash, operating cash flow,
interest, payables or loan schedules, so cash ratio, OCF, DSCR, payable days and repayment burden are absent
here; they come from FINEXT's own snapshots later. A ratio whose denominator is zero or negative, or a trend
without a previous period, is left missing (NaN), never zero.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

AREAS: dict[str, list[str]] = {
    "profitability": ["gross_margin", "ebitda_margin", "net_margin", "opex_ratio", "ebit_to_assets",
                      "revenue_growth", "gross_margin_change", "ebitda_margin_change", "net_margin_change"],
    "liquidity": ["current_ratio", "working_capital_to_assets", "current_ratio_change"],
    "debt": ["debt_to_assets", "liabilities_to_assets", "liabilities_to_equity", "negative_equity",
             "debt_to_ebitda", "debt_growth", "liabilities_to_assets_change", "retained_earnings_to_assets"],
    "working_capital": ["receivable_days", "inventory_days", "asset_turnover",
                        "receivable_days_change", "inventory_days_change"],
    "stability": ["revenue_growth_volatility", "ebitda_margin_volatility",
                  "loss_streak", "negative_ebitda_streak", "revenue_decline_streak"],
}
FEATURES: list[str] = [name for names in AREAS.values() for name in names]

# Expected direction, for monotonic constraints: +1 = a higher value means more risk, -1 = less risk.
# Only where the direction is clear; growth rates and turnover can mean trouble at either extreme.
MONOTONE: dict[str, int] = {
    "gross_margin": -1, "net_margin": -1, "ebitda_margin": -1, "ebit_to_assets": -1, "current_ratio": -1,
    "working_capital_to_assets": -1, "retained_earnings_to_assets": -1, "opex_ratio": 1,
    "liabilities_to_assets": 1, "liabilities_to_equity": 1, "debt_to_assets": 1, "debt_to_ebitda": 1, "negative_equity": 1,
    "receivable_days": 1, "inventory_days": 1,
    "loss_streak": 1, "negative_ebitda_streak": 1, "revenue_decline_streak": 1,
}

# Business-friendly names for explanations (spec C6: never show raw feature names).
LABELS: dict[str, str] = {
    "gross_margin": "Gross margin", "ebitda_margin": "EBITDA margin", "net_margin": "Net profit margin",
    "opex_ratio": "Operating expenses as a share of revenue", "ebit_to_assets": "Operating profit relative to assets",
    "revenue_growth": "Revenue growth on the previous period", "gross_margin_change": "Change in gross margin",
    "ebitda_margin_change": "Change in EBITDA margin", "net_margin_change": "Change in net profit margin",
    "current_ratio": "Current ratio", "working_capital_to_assets": "Working capital relative to assets",
    "current_ratio_change": "Change in current ratio", "debt_to_assets": "Long-term debt relative to assets",
    "liabilities_to_assets": "Total liabilities relative to assets", "liabilities_to_equity": "Liabilities-to-equity",
    "negative_equity": "Liabilities exceed assets (negative equity)", "debt_to_ebitda": "Debt relative to EBITDA",
    "debt_growth": "Growth in long-term debt", "liabilities_to_assets_change": "Change in liabilities relative to assets",
    "retained_earnings_to_assets": "Accumulated profits relative to assets", "receivable_days": "Receivable days",
    "inventory_days": "Inventory days", "asset_turnover": "Revenue relative to assets",
    "receivable_days_change": "Change in receivable days", "inventory_days_change": "Change in inventory days",
    "revenue_growth_volatility": "How much revenue growth swings", "ebitda_margin_volatility": "How much EBITDA margin swings",
    "loss_streak": "Periods in a row with a net loss", "negative_ebitda_streak": "Periods in a row with negative EBITDA",
    "revenue_decline_streak": "Periods in a row with falling revenue",
}


def _ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return (numerator / denominator).where(denominator > 0)


def _streak(condition: pd.Series, company: pd.Series, consecutive: pd.Series) -> pd.Series:
    """Periods in a row (ending at each row) where `condition` holds; a gap in the years restarts the count."""
    run = np.zeros(len(condition))
    previous_company, count = None, 0
    for i, (holds, name, follows) in enumerate(zip(condition.to_numpy(), company.to_numpy(), consecutive.to_numpy())):
        if name != previous_company or not follows:
            count = 0
        count = count + 1 if holds else 0
        run[i] = count
        previous_company = name
    return pd.Series(run, index=condition.index)


def build(df: pd.DataFrame) -> pd.DataFrame:
    """Add FEATURES to a frame of company-years sorted by company and year (as `us_dataset.load` returns)."""
    out = df.copy()
    revenue = out["revenue"]
    equity = out["total_assets"] - out["total_liabilities"]
    out["gross_margin"] = _ratio(out["gross_profit"], revenue)
    out["ebitda_margin"] = _ratio(out["ebitda"], revenue)
    out["net_margin"] = _ratio(out["net_income"], revenue)
    out["opex_ratio"] = _ratio(out["operating_expenses"] - out["cogs"], revenue)
    out["ebit_to_assets"] = _ratio(out["ebit"], out["total_assets"])
    out["current_ratio"] = _ratio(out["current_assets"], out["current_liabilities"])
    out["working_capital_to_assets"] = _ratio(out["current_assets"] - out["current_liabilities"], out["total_assets"])
    out["debt_to_assets"] = _ratio(out["long_term_debt"], out["total_assets"])
    out["liabilities_to_assets"] = _ratio(out["total_liabilities"], out["total_assets"])
    out["liabilities_to_equity"] = _ratio(out["total_liabilities"], equity)  # undefined when equity <= 0 ...
    out["negative_equity"] = (equity <= 0).astype(float)                     # ... which this flags instead
    out["debt_to_ebitda"] = _ratio(out["long_term_debt"], out["ebitda"])
    out["retained_earnings_to_assets"] = _ratio(out["retained_earnings"], out["total_assets"])
    out["receivable_days"] = _ratio(out["receivables"], revenue) * 365
    out["inventory_days"] = (_ratio(out["inventory"], out["cogs"]) * 365).where(out["inventory"] > 0)  # N/A without stock
    out["asset_turnover"] = _ratio(revenue, out["total_assets"])

    company = out["company"]
    consecutive = out["year"].eq(out.groupby("company")["year"].shift() + 1)  # previous row is the year before

    def previous(column: str) -> pd.Series:
        return out.groupby("company")[column].shift().where(consecutive)

    out["revenue_growth"] = _ratio(revenue, previous("revenue")) - 1
    out["debt_growth"] = _ratio(out["long_term_debt"], previous("long_term_debt")) - 1
    for name in ("gross_margin", "ebitda_margin", "net_margin", "current_ratio", "liabilities_to_assets",
                 "receivable_days", "inventory_days"):
        out[f"{name}_change"] = out[name] - previous(name)

    def rolling_std(column: str, window: int = 3) -> pd.Series:
        return out.groupby("company")[column].transform(lambda s: s.rolling(window, min_periods=window).std())

    out["revenue_growth_volatility"] = rolling_std("revenue_growth")
    out["ebitda_margin_volatility"] = rolling_std("ebitda_margin")
    out["loss_streak"] = _streak(out["net_income"] < 0, company, consecutive)
    out["negative_ebitda_streak"] = _streak(out["ebitda"] < 0, company, consecutive)
    out["revenue_decline_streak"] = _streak(out["revenue_growth"] < 0, company, consecutive)
    return out
