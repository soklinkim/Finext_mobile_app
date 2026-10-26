"""Layer 2 inputs: the ratios the risk model was trained on, computed from a FINEXT business's own books.

The model (ml/finext_ml/data/polish_bankruptcy_dataset.py) learned from annual accounts, so the ratios here are
annual too: flows (sales, profit, costs) over the last 12 complete months, balances at the latest month end, each
with the training data's exact definition (Polish attribute numbers in the comments). With 6-11 months of records
the flows are scaled up to a year and confidence is low; under 6 months there is no score (spec C1).

A ratio is None when its denominator is zero, with a reason the dashboard can show, exactly as the training data
left it missing. Pure functions over Stage A snapshots; no database access.
"""
from __future__ import annotations

MIN_MONTHS = 6
YEAR_MONTHS = 12
# Same order as the model's inputs; ml/tests checks it against the training features.
FEATURES = [
    "net_profit_to_assets", "liabilities_to_assets", "working_capital_to_assets", "current_ratio",
    "liquid_days_of_expenses", "retained_earnings_to_assets", "ebit_to_assets", "asset_turnover", "equity_to_assets",
    "pretax_margin", "inventory_days", "sales_growth", "net_margin", "cash_earnings_to_liabilities",
    "interest_coverage", "payable_days", "cash_ratio", "operating_margin", "receivable_days", "quick_ratio",
    "short_term_liabilities_to_assets", "costs_to_sales", "long_term_liabilities_to_equity",
]
FLOWS = ("revenue", "cogs", "operating_expenses", "depreciation", "ebit", "interest", "tax", "net_profit")

MISSING_TEXT = {
    "no_assets": "no assets recorded yet", "no_liabilities": "no bills or loans owed",
    "no_short_term_liabilities": "no short-term bills or loans", "no_sales": "no sales in the last 12 months",
    "no_costs": "no cost of goods in the last 12 months", "no_expenses": "no expenses in the last 12 months",
    "no_interest": "no interest paid", "no_equity": "owner's equity is zero",
    "not_yet_available": "needs 24 months of records (this year against last year)",
}


def _usable(snapshot: dict) -> bool:
    return bool(snapshot.get("features")) and snapshot.get("complete", True)


def risk_features(snapshots: list[dict]) -> dict:
    """Model inputs as of the latest snapshot.

    Returns {"asOf", "months", "annualised", "confidence", "features", "reasons"}; features is None when there are
    fewer than MIN_MONTHS complete, balanced months in the last year.
    """
    if not snapshots:
        return {"asOf": None, "months": 0, "annualised": False, "confidence": "none", "features": None, "reasons": {}}
    latest = snapshots[-1]
    window = snapshots[-YEAR_MONTHS:]
    usable = [s for s in window if _usable(s)]
    result = {"asOf": latest["period"], "months": len(usable), "annualised": len(usable) < YEAR_MONTHS}
    if not _usable(latest) or len(usable) < MIN_MONTHS:
        return {**result, "confidence": "none", "features": None, "reasons": {}}

    scale = YEAR_MONTHS / len(usable)
    year = {name: sum(s["features"][name] for s in usable) * scale for name in FLOWS}
    b = latest["features"]  # balances at the latest month end
    values: dict[str, float | None] = {}
    reasons: dict[str, str] = {}

    def ratio(name: str, numerator: float, denominator: float, reason: str, scale_by: float = 1) -> None:
        if denominator == 0:
            values[name], reasons[name] = None, reason
        else:
            values[name] = numerator / denominator * scale_by

    ta, tl, cl, ca = b["total_assets"], b["total_liabilities"], b["current_liabilities"], b["current_assets"]
    sales, cogs, equity = year["revenue"], year["cogs"], b["equity"]
    ratio("net_profit_to_assets", year["net_profit"], ta, "no_assets")                         # X1
    ratio("liabilities_to_assets", tl, ta, "no_assets")                                        # X2
    ratio("working_capital_to_assets", ca - cl, ta, "no_assets")                               # X3
    ratio("current_ratio", ca, cl, "no_short_term_liabilities")                                # X4
    # X5: (cash + securities + receivables - short-term liabilities) / (operating expenses - depreciation) x 365.
    # Polish operating expenses include the cost of goods sold.
    ratio("liquid_days_of_expenses", b["cash"] + b["receivables"] - cl,
          cogs + year["operating_expenses"] - year["depreciation"], "no_expenses", 365)
    ratio("retained_earnings_to_assets", equity - b["owner_capital"], ta, "no_assets")         # X6
    ratio("ebit_to_assets", year["ebit"], ta, "no_assets")                                     # X7
    ratio("asset_turnover", sales, ta, "no_assets")                                            # X9
    ratio("equity_to_assets", equity, ta, "no_assets")                                         # X10
    ratio("pretax_margin", year["net_profit"] + year["tax"], sales, "no_sales")                # X19: "gross profit" = pre-tax
    ratio("inventory_days", b["inventory"], sales, "no_sales", 365)                            # X20
    ratio("net_margin", year["net_profit"], sales, "no_sales")                                 # X23
    ratio("cash_earnings_to_liabilities", year["net_profit"] + year["depreciation"], tl, "no_liabilities")  # X26
    ratio("interest_coverage", year["ebit"], year["interest"], "no_interest")                  # X27
    ratio("payable_days", cl, cogs, "no_costs", 365)                                           # X32
    ratio("cash_ratio", ca - b["inventory"] - b["receivables"], cl, "no_short_term_liabilities")  # X40
    ratio("operating_margin", year["ebit"], sales, "no_sales")                                 # X42
    ratio("receivable_days", b["receivables"], sales, "no_sales", 365)                         # X44
    ratio("quick_ratio", ca - b["inventory"], cl, "no_short_term_liabilities")                 # X46
    ratio("short_term_liabilities_to_assets", cl, ta, "no_assets")                             # X51
    ratio("costs_to_sales", cogs + year["operating_expenses"] + year["interest"], sales, "no_sales")  # X58
    ratio("long_term_liabilities_to_equity", tl - cl, equity, "no_equity")                     # X59

    # X21: sales over the last 12 months against the 12 before, both complete.
    earlier = [s for s in snapshots[-2 * YEAR_MONTHS:-YEAR_MONTHS] if _usable(s)]
    if len(usable) == YEAR_MONTHS and len(earlier) == YEAR_MONTHS:
        ratio("sales_growth", sales, sum(s["features"]["revenue"] for s in earlier), "no_sales")
    else:
        values["sales_growth"], reasons["sales_growth"] = None, "not_yet_available"

    estimated = [s["features"].get("estimated_cogs_share") or 0 for s in usable]
    low = len(usable) < YEAR_MONTHS or len(usable) < len(window) or max(estimated) > 0.3
    return {**result, "confidence": "low" if low else "normal",
            "features": {name: values[name] for name in FEATURES}, "reasons": reasons}
