"""The FINEXT training set: synthetic MSMEs (spec C4) run through the real ledger and Stage A snapshots.

One row per business per month-end, from month 6 (spec C1: no prediction before), with `stress_3m` (spec C3)
read from the following three months. Inputs are scale-free (ratios, shares, streaks, trends) so a stall
selling $100 a day and a trader selling $1,000 a day are comparable; raw identifiers and the business type
are not inputs (the type is a reporting segment).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from finext_ml.data import sme_simulator
from finext_ml.data.dataset_definition import Dataset, holdout_groups, size_bands
from finext_ml.preprocessing.finext_features import FEATURES, LABELS, LAYER1, MONOTONE, build_features

CACHE = Path(__file__).resolve().parents[2] / "data" / "synthetic"
MIN_HISTORY = 6
# Calendar splits with a 3-month gap after train and validation, because a row's label looks 3 months ahead.
TRAIN_END, VALIDATION = "2025-03", ("2025-07", "2025-12")
TIME_HOLDOUT_START = "2026-04"

def load_raw(n: int, months: int, seed: int) -> pd.DataFrame:
    """Simulate (or reuse a cached run with the same settings)."""
    path = CACHE / f"finext_synthetic_n{n}_m{months}_s{seed}.csv.gz"
    if path.exists():
        return pd.read_csv(path, low_memory=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = pd.DataFrame(sme_simulator.simulate(n=n, months=months, seed=seed))
    raw.to_csv(path, index=False)
    return raw


def dataset(n: int = 400, months: int = 42, seed: int = 20261027) -> Dataset:
    raw = load_raw(n, months, seed)
    df = build_features(raw)
    df = df[(df["months_of_history"] >= MIN_HISTORY) & df["stress_3m"].notna()].copy()
    df["stress_3m"] = df["stress_3m"].astype(int)
    held = df["business"].isin(holdout_groups(df, "business", "stress_3m", 0.2, seed))
    parts = {
        "train": df[~held & (df["period"] <= TRAIN_END)].reset_index(drop=True),
        "validation": df[~held & df["period"].between(*VALIDATION)],
        "time_holdout": df[~held & (df["period"] >= TIME_HOLDOUT_START)],
        "company_holdout": df[held],
    }
    rows, positives = len(df), int(df["stress_3m"].sum())
    shocked = df["shocks"].fillna("").ne("")
    return Dataset(
        name="finext_synthetic", target="stress_3m", group="business", features=FEATURES, labels=LABELS, monotone=MONOTONE,
        parts=parts, optional_features=LAYER1,
        segments={"business type": lambda frame, train: frame["kind"].to_numpy(),
                  "size": size_bands("revenue_avg_3m")},
        # Spec C1: lower confidence with gaps or estimated records.
        confidence=lambda row: "low" if (row.get("estimated_cogs_share") or 0) > 0.3 or (row.get("days_without_entries") or 0) > 5 else "normal",
        card={
            "warning": "**SYNTHETIC DATA.** Trained on simulated Cambodian MSMEs, not customer records. The model learns the "
                       "patterns written into the simulator, so describe its output as *likely deterioration*, never as a "
                       "prediction of loan default, and say the data is synthetic wherever results are shown, including to banks. "
                       "Retrain on real records and repayment outcomes when they exist.",
            "data": [
                f"{n} simulated businesses (grocery, bakery, service, trader) over {months} months each, recorded as ordinary "
                f"FINEXT entries and run through the backend's posting rules, ledger and Stage A snapshots "
                f"(`ml/finext_ml/data/sme_simulator.py`, seed {seed}).",
                f"{(df.groupby('business')['shocks'].first().fillna('') != '').mean():.0%} of businesses get one or two problems "
                "(falling demand, supplier price rise, late or defaulting customers, over-borrowing, a large equipment "
                "purchase, rising drawings); records include late entries, duplicates and estimated costs.",
                f"**Target** `stress_3m` (spec C3): in the next 3 months, cash runway under two weeks, operating cash flow "
                f"negative in all three, or DSCR ≤ 1.0 over them. Rows from month {MIN_HISTORY}: {rows:,} business-months, "
                f"{positives:,} stressed ({positives / rows:.1%}); {df.loc[shocked, 'stress_3m'].mean():.1%} for businesses "
                f"with an injected problem, {df.loc[~shocked, 'stress_3m'].mean():.1%} without.",
            ],
            "splits": f"Train up to {TRAIN_END} (grouped CV by business inside), validation {VALIDATION[0]} to {VALIDATION[1]}, "
                      f"time holdout from {TIME_HOLDOUT_START}, each after a 3-month gap because labels look 3 months ahead; "
                      "company holdout = 20% of businesses never seen in training.",
            "limitations": [
                "Synthetic: performance here measures how well the model recovers the simulator's own patterns, not real-world accuracy.",
                "The label partly reuses the same ratios as the inputs (cash runway, OCF, DSCR), so the model largely learns whether "
                "current weakness continues (spec C3).",
                "No real repayment outcomes (missed payments, restructuring, closure) yet; no receipts or bank matching in the records.",
                "Simulated businesses hold more cash and fewer short-term liabilities than many real MSMEs (median current ratio ~6).",
            ],
        },
    )
