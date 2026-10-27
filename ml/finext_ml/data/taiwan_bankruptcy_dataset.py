"""Taiwanese bankruptcy data (UCI 572, CC BY 4.0; Liang et al. 2016, Taiwan Economic Journal 1999-2009): a benchmark.

6,819 listed companies, 95 ratios, bankrupt or not under the Taiwan Stock Exchange rules. It is a third, independent
real dataset for comparing the four candidates under the same pipeline (the "why XGBoost" evidence). It does not
produce a model for FINEXT, for two reasons:

- The publisher rescaled the ratios to 0-1, so they are not in units FINEXT can compute (a "current ratio" of 0.01),
  and they cannot be compared with the Polish or US data or put into Altman's formula.
- There are no company ids or years: each row is one company, and there is no time holdout.

Cleaning: the constant "Net Income Flag" is dropped. In columns that are otherwise within 0-1, a few values up to
1e10 are impossible on that scale and become missing (data errors). Six columns are mostly above 1 (never rescaled)
and are kept as they are: tree models use only the order of values, and Logistic Regression ranks them first.

Download (not in git): https://archive.ics.uci.edu/dataset/572 to `ml/data/raw/taiwan_bankruptcy/data.csv`.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "taiwan_bankruptcy" / "data.csv"
TARGET = "bankrupt"
UNSCALED_SHARE = 0.10   # a column with more than this share above 1 was never rescaled; below it, values > 1 are errors

# Expected direction where finance is clear (+1: higher means more risk). Rescaling to 0-1 keeps the order.
MONOTONE_BY_LABEL = {
    "ROA(C) before interest and depreciation before interest": -1, "ROA(A) before interest and % after tax": -1,
    "ROA(B) before interest and depreciation after tax": -1, "Net Income to Total Assets": -1,
    "Persistent EPS in the Last Four Seasons": -1, "Debt ratio %": 1, "Net worth/Assets": -1, "Borrowing dependency": 1,
    "Liability-Assets Flag": 1,
}


def _name(label: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", label.lower())).strip("_")


def load(path: str | Path = DEFAULT_PATH) -> tuple[pd.DataFrame, dict]:
    raw = pd.read_csv(path, encoding="latin-1")
    raw.columns = [c.strip() for c in raw.columns]
    labels = {_name(c): c.replace("(Yuan \xa5)", "(yuan)").replace("(Yuan ¥)", "(yuan)") for c in raw.columns if c != "Bankrupt?"}
    df = raw.rename(columns={c: _name(c) for c in raw.columns if c != "Bankrupt?"}).rename(columns={"Bankrupt?": TARGET})
    report = {"constant": [], "errors_to_missing": {}, "unscaled": []}
    for column in labels:
        values = df[column]
        if values.nunique() == 1:
            report["constant"].append(column)
            continue
        above = values > 1
        if above.mean() > UNSCALED_SHARE:
            report["unscaled"].append(column)
        elif above.any() and values.min() >= 0:
            report["errors_to_missing"][column] = int(above.sum())
            df[column] = values.where(~above, np.nan)
    df = df.drop(columns=report["constant"])
    for column in report["constant"]:
        labels.pop(column)
    df["company"] = [f"TW{i:05d}" for i in range(len(df))]
    df["period"] = "1999-2009"
    return df, {"labels": labels, "cleaning": report}


def dataset(path: str | Path = DEFAULT_PATH, seed: int = 20261027):
    """60% train, 20% validation, 20% company holdout, each stratified by outcome (as for the Polish data)."""
    from finext_ml.data.dataset_definition import Dataset, holdout_groups, size_bands

    df, info = load(path)
    labels = info["labels"]
    features = list(labels)
    held = df["company"].isin(holdout_groups(df, "company", TARGET, 0.2, seed))
    rest = df[~held]
    valid = rest["company"].isin(holdout_groups(rest, "company", TARGET, 0.25, seed + 1))
    parts = {"train": rest[~valid].reset_index(drop=True), "validation": rest[valid], "company_holdout": df[held]}
    rows, positives = len(df), int(df[TARGET].sum())
    roa = _name("ROA(A) before interest and % after tax")
    cleaning = info["cleaning"]
    return Dataset(
        name="taiwan_bankruptcy", target=TARGET, group="company", features=features, labels=labels,
        monotone={_name(k): v for k, v in MONOTONE_BY_LABEL.items() if _name(k) in labels}, parts=parts,
        segments={"size": size_bands(_name("Total assets to GNP price"))},
        baselines={
            "Lowest return on assets first": (lambda frame: (-frame[roa]).to_numpy(dtype=float), float(-parts["train"][roa].quantile(0.1))),
            "Liabilities exceed assets": (lambda frame: frame[_name("Liability-Assets Flag")].to_numpy(dtype=float), 1.0),
        },
        card={
            "warning": "**Benchmark only, not for scoring FINEXT businesses.** Ratios of Taiwanese listed companies, "
                       "rescaled to 0-1 by the publisher, so not in units FINEXT computes. Used to compare the four models "
                       "on a third real dataset.",
            "data": [
                f"Taiwanese bankruptcy data (UCI 572, CC BY 4.0; Liang et al. 2016; Taiwan Economic Journal 1999–2009): "
                f"{rows:,} companies, {len(features)} ratios.",
                f"**Target** `bankrupt`: {positives} bankrupt ({positives / rows:.1%}) under the Taiwan Stock Exchange rules.",
                f"Cleaning: dropped constant {', '.join(cleaning['constant']) or 'none'}; in {len(cleaning['errors_to_missing'])} "
                f"columns otherwise within 0–1, {sum(cleaning['errors_to_missing'].values())} impossible values (up to 1e10) "
                f"became missing; {len(cleaning['unscaled'])} columns mostly above 1 kept as they are.",
            ],
            "splits": "Companies split 60 / 20 / 20 into train (grouped CV inside), validation and a company holdout, "
                      "each stratified by outcome. No years in the data, so no time holdout.",
            "limitations": [
                "Listed Taiwanese companies, 1999–2009; ratios rescaled by the publisher, so neither comparable with the "
                "other datasets nor computable from FINEXT books.",
                "No years: results cannot be checked on a later period.",
                "Altman's formula cannot be applied to rescaled ratios; the baselines are simple single-ratio rules.",
            ],
            "file": Path(path),
        },
    )
