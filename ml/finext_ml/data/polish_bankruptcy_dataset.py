"""Polish companies bankruptcy data (UCI 365, CC BY 4.0; Tomczak, Zięba et al. 2016): real annual accounts.

`5year.arff` holds ratios from a company's last year of reports, with the class "bankrupt within one year", the
same horizon as the US data. The other files look further ahead and repeat the same companies, so they are not
used. There are no company ids or years; each row is one company.

Only ratios FINEXT can also compute from an MSME's books are inputs. Total assets (size) is a reporting
segment, not an input: FINEXT businesses are far smaller than anything in this data.

Download (not in git): https://archive.ics.uci.edu/dataset/365 to `ml/data/raw/polish_bankruptcy/`.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "polish_bankruptcy" / "5year.arff"

# Attribute -> (name, plain label, direction for monotonic constraints: +1 more risk, -1 less, 0 unclear).
COLUMNS: dict[str, tuple[str, str, int]] = {
    "X1": ("net_profit_to_assets", "Net profit relative to assets", -1),
    "X2": ("liabilities_to_assets", "Liabilities relative to assets", 1),
    "X3": ("working_capital_to_assets", "Working capital relative to assets", -1),
    "X4": ("current_ratio", "Current ratio", -1),
    "X5": ("liquid_days_of_expenses", "Days of expenses covered by liquid assets after short-term bills", -1),
    "X6": ("retained_earnings_to_assets", "Retained earnings relative to assets", -1),
    "X7": ("ebit_to_assets", "Operating profit relative to assets", -1),
    "X9": ("asset_turnover", "Sales relative to assets", 0),
    "X10": ("equity_to_assets", "Equity relative to assets", -1),
    "X19": ("pretax_margin", "Profit before tax relative to sales", -1),  # Polish "zysk brutto" (gross profit) is pre-tax profit
    "X20": ("inventory_days", "Inventory days", 0),
    "X21": ("sales_growth", "Sales relative to last year", 0),
    "X23": ("net_margin", "Net profit margin", -1),
    "X26": ("cash_earnings_to_liabilities", "Profit plus depreciation relative to liabilities", -1),
    "X27": ("interest_coverage", "Operating profit relative to interest and finance costs", -1),
    "X32": ("payable_days", "Short-term bills relative to daily cost of goods", 0),
    "X40": ("cash_ratio", "Cash relative to short-term bills", -1),
    "X42": ("operating_margin", "Operating profit margin", -1),
    "X44": ("receivable_days", "Receivable days", 0),
    "X46": ("quick_ratio", "Quick ratio (current assets without stock, relative to short-term bills)", -1),
    "X51": ("short_term_liabilities_to_assets", "Short-term bills relative to assets", 1),
    "X58": ("costs_to_sales", "Total costs relative to sales", 1),
    "X59": ("long_term_liabilities_to_equity", "Long-term debt relative to equity", 0),
}
FEATURES = [name for name, _, _ in COLUMNS.values()]
LABELS = {name: label for name, label, _ in COLUMNS.values()}
MONOTONE = {name: sign for name, _, sign in COLUMNS.values() if sign}


def read_arff(path: str | Path) -> pd.DataFrame:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip().lower() == "@data") + 1
    rows = [line.split(",") for line in lines[start:] if line.strip()]
    return pd.DataFrame(rows, columns=[f"X{i}" for i in range(1, 65)] + ["class"]).replace("?", np.nan).astype(float)


def identity_shares(raw: pd.DataFrame, tolerance: float = 0.01) -> dict[str, float]:
    """Checks that the attribute meanings are right: ratios defined from the same figures must agree."""
    def holds(left: pd.Series, right: pd.Series) -> float:
        ok = left.notna() & right.notna() & np.isfinite(right)
        scale = np.maximum(left.abs(), right.abs())
        return float(((left - right).abs() <= tolerance * scale + 1e-3)[ok].mean())
    return {
        "assets/liabilities = 1/(liabilities/assets)": holds(raw["X17"], 1 / raw["X2"]),
        "working capital/assets = (current ratio - 1) × short-term bills/assets": holds(raw["X3"], (raw["X4"] - 1) * raw["X51"]),
        "sales/receivables = 365/receivable days": holds(raw["X61"], 365 / raw["X44"]),
        "sales/inventory = 365/inventory days": holds(raw["X60"], 365 / raw["X20"]),
    }


def load(path: str | Path = DEFAULT_PATH) -> tuple[pd.DataFrame, pd.DataFrame]:
    raw = read_arff(path)
    raw = raw.drop_duplicates().reset_index(drop=True)
    df = raw[list(COLUMNS)].set_axis(FEATURES, axis=1)
    # Not inputs: size for segments (X29 is log10 of total assets) and book equity / liabilities for Altman's Z'.
    df["log_total_assets"] = raw["X29"]
    df["equity_to_liabilities"] = raw["X8"]
    df["one"] = 1.0
    df["bankrupt_next_year"] = raw["class"].astype(int)
    df["company"] = [f"PL{i:05d}" for i in range(len(df))]
    df["period"] = "last reported year"
    return df, raw


def dataset(path: str | Path = DEFAULT_PATH, seed: int = 20261027):
    """60% train, 20% validation, 20% company holdout, each stratified by outcome. No years, so no time holdout."""
    from finext_ml.data.dataset_definition import Dataset, altman_score, holdout_groups, size_bands

    df, raw = load(path)
    held = df["company"].isin(holdout_groups(df, "company", "bankrupt_next_year", 0.2, seed))
    rest = df[~held]
    valid = rest["company"].isin(holdout_groups(rest, "company", "bankrupt_next_year", 0.25, seed + 1))
    parts = {"train": rest[~valid].reset_index(drop=True), "validation": rest[valid], "company_holdout": df[held]}
    rows, positives = len(df), int(df["bankrupt_next_year"].sum())
    return Dataset(
        name="polish_bankruptcy", target="bankrupt_next_year", group="company", features=FEATURES, labels=LABELS,
        monotone=MONOTONE, parts=parts, segments={"size": size_bands("log_total_assets")},
        confidence=lambda row: "low" if row[FEATURES].isna().sum() > 3 else "normal",
        baselines={
            # Altman Z' (1983) for private companies: book equity, distress below 1.23. Ratios are given, so "assets"
            # and "liabilities" are 1.
            "Altman Z'-score (textbook bankruptcy formula)": altman_score(
                "working_capital_to_assets", "retained_earnings_to_assets", "ebit_to_assets", "equity_to_liabilities",
                "asset_turnover", "one", "one", weights=(0.717, 0.847, 3.107, 0.420, 0.998), cutoff=1.23),
            "Loss-making this year": (lambda frame: (frame["net_profit_to_assets"] < 0).to_numpy(dtype=float), 1.0),
        },
        card={
            "warning": "**Real data, different businesses.** Annual accounts of Polish manufacturing companies "
                       "(2000–2013) and whether they went bankrupt within a year. FINEXT computes the same ratios from an "
                       "MSME's books, but Cambodian MSMEs are smaller and differently financed: describe output as *likely "
                       "deterioration*, never as a prediction of loan default.",
            "data": [
                f"Polish companies bankruptcy data (UCI 365, CC BY 4.0; Tomczak, Zięba et al. 2016), `5year.arff`: "
                f"{rows:,} companies after dropping {len(read_arff(path)) - len(raw)} exact duplicate rows.",
                "Attribute meanings checked against ratios built from the same figures: "
                + ", ".join(f"{k} {v:.2%}" for k, v in identity_shares(raw).items()) + ".",
                f"**Target** `bankrupt_next_year`: {positives} bankrupt within a year ({positives / rows:.1%}).",
                f"{len(FEATURES)} of the 64 ratios are used: those FINEXT can also compute from a shop's books.",
            ],
            "splits": "Companies split 60 / 20 / 20 into train (grouped CV inside), validation and a company holdout, "
                      "each stratified by outcome. The data has no years, so there is no time holdout.",
            "limitations": [
                "Polish manufacturing companies, annual accounts: much larger than Cambodian MSMEs, a different economy and period.",
                "No years in the data, so results cannot be checked on a later period.",
                "No cash flow statement or loan schedules, so DSCR and cash runway are approximated (liquid days of expenses).",
                "Some extreme values in the source (e.g. negative liabilities ratios) are kept: tree models are not sensitive to them.",
            ],
            "file": Path(path),
        },
    )
