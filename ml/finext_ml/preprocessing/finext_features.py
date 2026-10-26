"""Model inputs for FINEXT, built from the backend's Stage A monthly snapshots (preprocessing).

The snapshots (backend/app/snapshots.py) already hold the cleaned monthly figures: the books are checked to
balance, and every missing value is None with a reason. This step makes them comparable across businesses
of any size: amounts become ratios and shares, and 3-month trends are added. Raw amounts, identifiers and
the business type are not inputs.
"""
from __future__ import annotations

import pandas as pd

SNAPSHOT_FEATURES = [
    "cash_runway", "current_ratio", "cash_ratio", "gross_margin", "net_margin", "ebitda_margin", "operating_expense_ratio",
    "revenue_growth", "revenue_yoy", "inventory_days", "receivable_days", "payable_days", "debt_to_equity",
    "liabilities_to_equity", "debt_to_asset", "negative_equity", "interest_coverage", "dscr", "revenue_cv", "ocf_cv",
    "negative_ocf_streak", "falling_cash_streak", "low_margin_streak", "ar_oldest_overdue_days", "ap_oldest_overdue_days",
    "active_loans", "new_loans_6m", "drawings_to_profit", "drawings_to_ocf", "days_without_entries",
    "estimated_cogs_share", "reversals", "review_flags", "months_of_history",
]
DERIVED = ["ocf_margin", "ocf_margin_3m", "revenue_change_pct", "cash_change_to_expenses", "ar_overdue_share",
           "ap_overdue_share", "repayment_burden", "instalments_due_14d_to_cash", "new_borrowing_to_revenue", "debt_to_ocf"]
TRENDS = ["cash_runway", "net_margin", "current_ratio", "receivable_days", "dscr"]  # change over 3 months
FEATURES = SNAPSHOT_FEATURES + DERIVED + [f"{name}_change_3m" for name in TRENDS]
LAYER1 = ["l1_profitability_yellow", "l1_profitability_red", "l1_liquidity_yellow", "l1_liquidity_red",
          "l1_debt_yellow", "l1_debt_red", "l1_working_capital_yellow", "l1_working_capital_red",
          "l1_yellow_total", "l1_red_total"]

MONOTONE = {
    "cash_runway": -1, "current_ratio": -1, "cash_ratio": -1, "gross_margin": -1, "net_margin": -1, "ebitda_margin": -1,
    "interest_coverage": -1, "dscr": -1, "ocf_margin": -1, "ocf_margin_3m": -1,
    "negative_ocf_streak": 1, "falling_cash_streak": 1, "low_margin_streak": 1, "debt_to_asset": 1, "debt_to_equity": 1,
    "liabilities_to_equity": 1, "negative_equity": 1, "repayment_burden": 1, "ar_overdue_share": 1,
    "ap_oldest_overdue_days": 1, "instalments_due_14d_to_cash": 1,
}
LABELS = {
    "cash_runway": "Months of usual expenses covered by cash", "current_ratio": "Current ratio", "cash_ratio": "Cash relative to short-term bills",
    "gross_margin": "Gross margin", "net_margin": "Net profit margin", "ebitda_margin": "EBITDA margin",
    "operating_expense_ratio": "Operating expenses as a share of revenue", "revenue_growth": "Revenue growth on last month",
    "revenue_yoy": "Revenue growth on the same month last year", "inventory_days": "Inventory days", "receivable_days": "Receivable days",
    "payable_days": "Payable days", "debt_to_equity": "Debt-to-equity", "liabilities_to_equity": "Liabilities-to-equity",
    "debt_to_asset": "Debt-to-asset", "negative_equity": "Liabilities exceed assets", "interest_coverage": "Interest coverage",
    "dscr": "Debt service coverage (DSCR)", "revenue_cv": "How much monthly revenue swings", "ocf_cv": "How much operating cash flow swings",
    "negative_ocf_streak": "Months in a row with negative operating cash flow", "falling_cash_streak": "Months in a row with falling cash",
    "low_margin_streak": "Months in a row with a thin profit margin", "ar_oldest_overdue_days": "Days the oldest customer balance is overdue",
    "ap_oldest_overdue_days": "Days the oldest supplier bill is overdue", "active_loans": "Loans being repaid",
    "new_loans_6m": "New loans in the last 6 months", "drawings_to_profit": "Owner drawings relative to profit",
    "drawings_to_ocf": "Owner drawings relative to operating cash flow", "days_without_entries": "Days with no entries this month",
    "estimated_cogs_share": "Share of sales with an estimated cost", "reversals": "Reversed entries this month",
    "review_flags": "Entries flagged for review this month", "months_of_history": "Months of records",
    "ocf_margin": "Operating cash flow relative to revenue", "ocf_margin_3m": "Operating cash flow relative to revenue (3 months)",
    "revenue_change_pct": "Revenue change on last month", "cash_change_to_expenses": "Change in cash relative to usual expenses",
    "ar_overdue_share": "Customer balances overdue 30+ days, relative to monthly revenue",
    "ap_overdue_share": "Supplier bills overdue 30+ days, relative to monthly revenue",
    "repayment_burden": "Loan instalments due next month relative to revenue", "instalments_due_14d_to_cash": "Instalments due in 14 days relative to cash",
    "new_borrowing_to_revenue": "New borrowing in 6 months relative to monthly revenue", "debt_to_ocf": "Debt relative to yearly operating cash flow",
    **{f"{name}_change_3m": f"Change in {LABELS_BASE.lower()} over 3 months" for name, LABELS_BASE in
       {"cash_runway": "Cash runway", "net_margin": "Net profit margin", "current_ratio": "Current ratio",
        "receivable_days": "Receivable days", "dscr": "DSCR"}.items()},
    **{name: f"Rule checks: {name[3:].replace('_', ' ')}" for name in LAYER1},
}


# Why a value is missing, in plain words, where the reason is specific to the feature. Missing is often a signal:
# no profit, negative cash flow, liabilities above assets. Others fall back to the snapshot's reason code.
MISSING_TEXT = {
    "gross_margin": "no revenue this month", "net_margin": "no revenue this month", "ebitda_margin": "no revenue this month",
    "operating_expense_ratio": "no revenue this month", "ocf_margin": "no revenue this month",
    "ocf_margin_3m": "no revenue in the last 3 months", "revenue_growth": "no revenue last month",
    "revenue_change_pct": "no revenue last month", "drawings_to_profit": "no profit this month",
    "drawings_to_ocf": "operating cash flow was negative or zero", "debt_to_ocf": "operating cash flow was negative or zero",
    "liabilities_to_equity": "liabilities are higher than assets", "debt_to_equity": "liabilities are higher than assets",
    "current_ratio": "no short-term bills", "cash_ratio": "no short-term bills", "cash_runway": "not enough history yet",
    "inventory_days": "no stock held", "receivable_days": "no credit sales this month", "payable_days": "no cost of goods this month",
    "interest_coverage": "no interest paid", "dscr": "no loan repayments due, or no repayment schedule recorded",
    "repayment_burden": "no loan repayments due, or no repayment schedule recorded",
    "instalments_due_14d_to_cash": "no cash, or no repayment schedule recorded",
}


def _share(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return (numerator / denominator).where(denominator > 0)


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.sort_values(["business", "t"]).reset_index(drop=True).copy()
    df["ocf_margin"] = _share(df["ocf"], df["revenue"])
    df["ocf_margin_3m"] = _share(df["ocf_avg_3m"], df["revenue_avg_3m"])
    df["revenue_change_pct"] = _share(df["revenue_change"], df["revenue"] - df["revenue_change"])
    df["cash_change_to_expenses"] = _share(df["cash_change"], df["usual_monthly_expenses"])
    df["ar_overdue_share"] = _share(df["ar_overdue_31_60"] + df["ar_overdue_61_plus"], df["revenue_avg_3m"])
    df["ap_overdue_share"] = _share(df["ap_overdue_31_60"] + df["ap_overdue_61_plus"], df["revenue_avg_3m"])
    df["repayment_burden"] = _share(df["debt_service_next_month"], df["revenue_avg_3m"])
    df["instalments_due_14d_to_cash"] = _share(df["instalments_due_14d"], df["cash"])
    df["new_borrowing_to_revenue"] = _share(df["new_borrowing_6m"], df["revenue_avg_3m"])
    df["debt_to_ocf"] = _share(df["debt"], df["ocf_avg_3m"] * 12)
    # The same business three months earlier (looked up by month, so a skipped month does not shift it).
    earlier = df.set_index(["business", "t"])[TRENDS].reindex(pd.MultiIndex.from_arrays([df["business"], df["t"] - 3]))
    for name in TRENDS:
        df[f"{name}_change_3m"] = df[name] - earlier[name].to_numpy()
    return df
