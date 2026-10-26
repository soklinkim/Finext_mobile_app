"""Does the model work in a country it never saw? Train XGBoost on one country's companies, score the other's.

    python -m finext_ml.transfer_test           # Polish -> US and US -> Polish (~20 min)
    python -m finext_ml.transfer_test --quick

FINEXT will score Cambodian MSMEs, which are in neither dataset, so this is the closest available check of how the
model holds up on unfamiliar businesses. Both datasets are reduced to the same ratios, defined the same way (the
Polish definitions, computed from the US amounts). Each direction is compared with:
- the model trained and cross-validated on the target country itself (the best one could expect there), and
- Altman's Z' score (book-equity version, the textbook formula) on the target country.
ROC-AUC is the fairest comparison across countries: unlike PR-AUC it does not depend on how common bankruptcy is.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold

from finext_ml.data import polish_bankruptcy_dataset, us_bankruptcy_dataset
from finext_ml.data.dataset_definition import altman_score
from finext_ml.evaluation import evaluation_metrics
from finext_ml.models.candidate_models import CANDIDATES, PlattCalibrator
from finext_ml.train_and_compare import ARTIFACTS, RECALL_TARGET, SEED, tune

SHARED = ["net_profit_to_assets", "liabilities_to_assets", "working_capital_to_assets", "current_ratio",
          "retained_earnings_to_assets", "ebit_to_assets", "asset_turnover", "equity_to_assets",
          "inventory_days", "sales_growth", "net_margin", "receivable_days", "short_term_liabilities_to_assets",
          "cash_earnings_to_liabilities", "operating_margin"]
MONOTONE = {f: s for f, s in polish_bankruptcy_dataset.MONOTONE.items() if f in SHARED}
ALTMAN = altman_score("working_capital_to_assets", "retained_earnings_to_assets", "ebit_to_assets", "equity_to_liabilities",
                      "asset_turnover", "one", "one", weights=(0.717, 0.847, 3.107, 0.420, 0.998), cutoff=1.23)


def _divide(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a / b).where(b != 0)


def us_frame() -> pd.DataFrame:
    """US company-years with the Polish ratio definitions."""
    df = us_bankruptcy_dataset.load()
    ta, tl, sales = df["total_assets"], df["total_liabilities"], df["revenue"]
    previous_sales = df.groupby("company")["revenue"].shift()
    previous_sales = previous_sales.where(df["year"].eq(df.groupby("company")["year"].shift() + 1))
    out = pd.DataFrame({
        "company": df["company"], "target": df["fails_next_year"],
        "net_profit_to_assets": _divide(df["net_income"], ta), "liabilities_to_assets": _divide(tl, ta),
        "working_capital_to_assets": _divide(df["current_assets"] - df["current_liabilities"], ta),
        "current_ratio": _divide(df["current_assets"], df["current_liabilities"]),
        "retained_earnings_to_assets": _divide(df["retained_earnings"], ta), "ebit_to_assets": _divide(df["ebit"], ta),
        "asset_turnover": _divide(sales, ta), "equity_to_assets": _divide(ta - tl, ta),
        "inventory_days": _divide(df["inventory"] * 365, sales),
        "sales_growth": _divide(sales, previous_sales), "net_margin": _divide(df["net_income"], sales),
        "receivable_days": _divide(df["receivables"] * 365, sales),
        "short_term_liabilities_to_assets": _divide(df["current_liabilities"], ta),
        "cash_earnings_to_liabilities": _divide(df["net_income"] + df["depreciation"], tl),
        "operating_margin": _divide(df["ebit"], sales), "equity_to_liabilities": _divide(ta - tl, tl),
    })
    return out.replace([np.inf, -np.inf], np.nan).assign(one=1.0)


def polish_frame() -> pd.DataFrame:
    df, _ = polish_bankruptcy_dataset.load()
    return df.rename(columns={"bankrupt_next_year": "target"})[["company", "target", *SHARED, "equity_to_liabilities", "one"]]


def fit(frame: pd.DataFrame, n_iter: int, n_folds: int):
    """Tune XGBoost with grouped CV on one country; return the fitted model, its calibrator, out-of-fold scores."""
    xgb = next(c for c in CANDIDATES if c.name == "xgboost")
    y = frame["target"].to_numpy()
    folds = list(StratifiedGroupKFold(n_splits=n_folds, shuffle=True, random_state=SEED).split(frame, y, groups=frame["company"]))
    best = tune(xgb, frame, "target", "company", SHARED, MONOTONE, folds, n_iter)
    model = xgb.make(best["final_params"], best["imbalance"], SEED, SHARED, MONOTONE).fit(frame[SHARED], y)
    return model, PlattCalibrator().fit(best["oof"], y), best["oof"]


def scores(y, p, threshold: float) -> dict:
    t = evaluation_metrics.at_threshold(y, p, threshold)
    return {"pr_auc": evaluation_metrics.pr_auc(y, p), "roc_auc": evaluation_metrics.roc_auc(y, p),
            "precision": t["precision"], "recall": t["recall"]}


def run(n_iter: int, n_folds: int) -> dict:
    frames = {"Poland": polish_frame(), "US": us_frame()}
    fitted = {name: fit(frame, n_iter, n_folds) for name, frame in frames.items()}
    report = {}
    for source, target in (("Poland", "US"), ("US", "Poland")):
        model, calibrator, oof = fitted[source]
        src, dst = frames[source], frames[target]
        threshold = evaluation_metrics.threshold_for_recall(src["target"].to_numpy(), calibrator.transform(oof), RECALL_TARGET)
        y = dst["target"].to_numpy()
        p = calibrator.transform(model.predict_proba(dst[SHARED])[:, 1])
        own_model, own_calibrator, own_oof = fitted[target]
        own_threshold = evaluation_metrics.threshold_for_recall(y, own_calibrator.transform(own_oof), RECALL_TARGET)
        altman, alert = ALTMAN
        report[f"{source} -> {target}"] = {
            "rows": int(len(dst)), "positives": int(y.sum()),
            "transferred": {**scores(y, p, threshold), "calibration_error": evaluation_metrics.calibration_error(y, p)},
            "trained_on_target_cv": scores(y, own_calibrator.transform(own_oof), own_threshold),
            "altman": scores(y, altman(dst), alert),
        }
        r = report[f"{source} -> {target}"]
        print(f"{source} -> {target}: ROC-AUC {r['transferred']['roc_auc']:.3f} (own {r['trained_on_target_cv']['roc_auc']:.3f}, "
              f"Altman {r['altman']['roc_auc']:.3f})", flush=True)
    return report


def write(report: dict) -> str:
    f = lambda v: "—" if v is None else f"{v:.3f}"  # noqa: E731
    lines = ["# Transfer test: trained in one country, scored in the other", "",
             "Real data only. Both datasets reduced to the same 15 ratios (Polish definitions). XGBoost tuned with grouped "
             "CV on the source country; alert threshold set there to catch 85% of bankruptcies, then used unchanged.", "",
             "| Direction | Method | ROC-AUC | PR-AUC | Precision | Recall |", "|---|---|---:|---:|---:|---:|"]
    for direction, r in report.items():
        target = direction.split(" -> ")[1]
        for label, key in ((f"**XGBoost trained on {direction.split(' -> ')[0]}**", "transferred"),
                           (f"XGBoost trained on {target} itself (CV)", "trained_on_target_cv"),
                           ("Altman Z'-score", "altman")):
            s = r[key]
            lines.append(f"| {direction} ({r['positives']:,} bankrupt in {r['rows']:,}) | {label} | {f(s['roc_auc'])} | "
                         f"{f(s['pr_auc'])} | {f(s['precision'])} | {f(s['recall'])} |")
    lines += ["", "How to read it: the closer the transferred model is to the one trained on the target country, the less it "
              "depends on where it was trained. If it still beats Altman's formula, it carries over better than the textbook "
              "rule. Precision and recall move with the threshold and with how common bankruptcy is in each country, so the "
              "ranking scores (ROC-AUC) are the fair comparison.", ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    report = run(2 if args.quick else 30, 3 if args.quick else 5)
    out = ARTIFACTS / "transfer" / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    (out / "transfer.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (out / "transfer_report.md").write_text(write(report), encoding="utf-8")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
