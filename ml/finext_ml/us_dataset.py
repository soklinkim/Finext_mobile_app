"""US Company Bankruptcy Prediction dataset: 78,682 company-years, 8,971 NYSE/NASDAQ companies, 1999-2018.

Source: https://github.com/sowide/bankruptcy_dataset (CC BY 4.0). Cite: Lombardo et al. (2022), "Machine Learning
for Bankruptcy Prediction in the American Stock Market: Dataset and Benchmarks", Future Internet 14(8), 244.

The published CSV needs two corrections, both checked against accounting identities (tests/test_us_dataset.py):

1. Lost decimal points. About 65% of cells were written without their decimal point, so 511.267 ($ millions)
   appears as 511267: the same column jumps 1000x between a company's years. A cell with no decimal point
   is divided by 1000. Afterwards revenue - COGS = gross profit and EBITDA - D&A = EBIT hold in every row.
2. Column meanings. X1..X18 do not follow the order listed in the paper. The mapping below is derived from
   identities (the two above, revenue - operating expenses = EBITDA) and inequalities that hold in every row
   (total assets >= current assets, receivables and inventory; total liabilities >= current liabilities
   and long-term debt).

The label: `status_label` is "failed" on *every* year of a company that eventually went bankrupt, up to 19
years before the filing. The README defines the event as the fiscal year before a Chapter 7 / 11 filing, so
the target here is `fails_next_year`: 1 only on a failed company's last reported year.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "raw" / "us_bankruptcy" / "american_bankruptcy_dataset.csv"

COLUMNS = {
    "X1": "current_assets", "X2": "total_assets", "X3": "cogs", "X4": "long_term_debt",
    "X5": "depreciation", "X6": "ebit", "X7": "ebitda", "X8": "gross_profit",
    "X9": "inventory", "X10": "current_liabilities", "X11": "net_income", "X12": "retained_earnings",
    "X13": "receivables", "X14": "revenue", "X15": "market_value", "X16": "total_liabilities",
    "X17": "total_revenue", "X18": "operating_expenses",
}


def _restore_decimals(cells: pd.Series) -> pd.Series:
    """Cells written without their decimal point are 1000x too large (see module docstring)."""
    text = cells.astype(str).str.strip()
    values = pd.to_numeric(text, errors="raise").astype(float)
    lost_point = ~text.str.contains(r"[.eE]", regex=True)
    return values.where(~lost_point, values / 1000)


def load(path: str | Path = DEFAULT_PATH) -> pd.DataFrame:
    """One row per company-year with named, corrected figures ($ millions) and the `fails_next_year` label."""
    raw = pd.read_csv(path, dtype=str)
    df = pd.DataFrame({
        "company": raw["company_name"],
        "year": pd.to_numeric(raw["fyear"]).astype(int),
        "ever_failed": raw["status_label"].eq("failed"),
        "division": raw["Division"],
    })
    for column, name in COLUMNS.items():
        df[name] = _restore_decimals(raw[column])
    df = df.drop_duplicates(["company", "year"]).sort_values(["company", "year"], ignore_index=True)
    df["fails_next_year"] = fails_next_year(df)
    return df


def fails_next_year(df: pd.DataFrame) -> pd.Series:
    """1 on a failed company's last reported year (the year before its filing), else 0."""
    last_year = df.groupby("company")["year"].transform("max")
    return (df["ever_failed"] & df["year"].eq(last_year)).astype(int)


def identity_shares(df: pd.DataFrame, tolerance: float = 0.003) -> dict[str, float]:
    """Share of rows where each accounting identity holds (a data-quality check after loading)."""
    def holds(left: pd.Series, right: pd.Series) -> float:
        scale = np.maximum(left.abs(), right.abs())
        return float(((left - right).abs() <= tolerance * scale + tolerance).mean())
    return {
        "revenue - cogs = gross_profit": holds(df["revenue"] - df["cogs"], df["gross_profit"]),
        "ebitda - depreciation = ebit": holds(df["ebitda"] - df["depreciation"], df["ebit"]),
        "revenue - operating_expenses = ebitda": holds(df["revenue"] - df["operating_expenses"], df["ebitda"]),
        "total_assets >= current_assets": float((df["total_assets"] >= df["current_assets"] - 1e-6).mean()),
    }
