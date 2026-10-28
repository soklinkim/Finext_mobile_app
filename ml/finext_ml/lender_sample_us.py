"""A real, public stand-in for a lender's file: the US bankruptcy data in the lender validation template.

    python -m finext_ml.lender_sample_us
    (then, from backend/) venv/Scripts/python.exe scripts/validate_lender_data.py ../ml/artifacts/lender_sample_us/us_companies.csv

Shows what the report looks like before any lender runs it. Each company-year is one "loan"; "went bad" is the
dataset's own label (the company filed for bankruptcy the next year). Figures are used as published: interest, tax
and cash are not in the data, and its operating expenses do not add up to its operating profit, so those columns are
left blank (the validator then leaves the ratios needing them missing). Equity is total assets less total liabilities.
These are large listed US companies, not Cambodian MSMEs: the run checks the script and shows how the model carries
over to companies it never saw, nothing more.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from finext_ml.data import us_bankruptcy_dataset
from finext_ml.train_and_compare import ARTIFACTS

OUT = ARTIFACTS / "lender_sample_us" / "us_companies.csv"
COLUMNS = ["bad_within_12m", "sales", "cost_of_goods_sold", "operating_profit", "net_profit", "total_assets", "current_assets",
           "receivables", "inventory", "current_liabilities", "total_liabilities", "equity", "retained_earnings",
           "sales_prior_year", "operating_expenses", "depreciation", "interest_paid", "income_tax", "cash"]


def build() -> pd.DataFrame:
    df = us_bankruptcy_dataset.load()
    previous = df.groupby("company")["revenue"].shift()
    consecutive = df["year"].eq(df.groupby("company")["year"].shift() + 1)
    return pd.DataFrame({
        "bad_within_12m": df["fails_next_year"], "sales": df["revenue"], "cost_of_goods_sold": df["cogs"],
        "operating_profit": df["ebit"], "net_profit": df["net_income"], "total_assets": df["total_assets"],
        "current_assets": df["current_assets"], "receivables": df["receivables"], "inventory": df["inventory"],
        "current_liabilities": df["current_liabilities"], "total_liabilities": df["total_liabilities"], "equity": None,
        "retained_earnings": df["retained_earnings"], "sales_prior_year": previous.where(consecutive),
        "operating_expenses": None, "depreciation": df["depreciation"], "interest_paid": None, "income_tax": None, "cash": None,
    })[COLUMNS]


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frame = build()
    frame.to_csv(OUT, index=False)
    print(f"{len(frame):,} rows, {int(frame['bad_within_12m'].sum())} went bad -> {Path(OUT)}")
