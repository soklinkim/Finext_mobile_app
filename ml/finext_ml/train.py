"""Train the four candidates on the US bankruptcy data, pick the winner, explain it (pipeline spec C5, C5b, C6).

    python -m finext_ml.train            # full run -> artifacts/us_bankruptcy/<run id>/
    python -m finext_ml.train --quick    # small tuning budget, for a smoke test

Splits (no company and no later period leaks into training):
- 20% of companies are held out entirely ("company holdout"), stratified by whether they ever failed.
- The other companies: train on 1999-2011 (grouped 5-fold CV inside, for tuning and comparison),
  validation 2012-2014 (calibration and segment checks), "time holdout" 2015-2018.
The two holdouts are scored only for the winner, after it is chosen.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import ParameterGrid, ParameterSampler, StratifiedGroupKFold

from finext_ml import evaluate, explain, us_dataset
from finext_ml.features import FEATURES, build
from finext_ml.models import CANDIDATES, CHAMPION, PlattCalibrator, TrainedModel

SEED = 20261027
TARGET = "fails_next_year"
TRAIN_END, VALIDATION_END = 2011, 2014
RECALL_TARGET = 0.70        # alert threshold: catch at least 70% of failures on validation (recall matters most)
MIN_PRECISION = 0.20        # reported: recall while at least 1 in 5 alerts is a real failure
SELECTION = {"margin": 0.02, "folds_lost_allowed": 1}  # spec C5b: +0.02 PR-AUC, consistent across folds [Decision]
ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts" / "us_bankruptcy"


def split(df: pd.DataFrame, holdout_share: float = 0.2, seed: int = SEED) -> dict[str, pd.DataFrame]:
    companies = df.groupby("company")["ever_failed"].first()
    rng = np.random.default_rng(seed)
    unseen: set[str] = set()
    for failed in (True, False):
        names = np.sort(companies[companies == failed].index.to_numpy())
        unseen |= set(rng.choice(names, size=round(len(names) * holdout_share), replace=False))
    held = df["company"].isin(unseen)
    return {
        "train": df[~held & (df["year"] <= TRAIN_END)],
        "validation": df[~held & df["year"].between(TRAIN_END + 1, VALIDATION_END)],
        "time_holdout": df[~held & (df["year"] > VALIDATION_END)],
        "company_holdout": df[held],
    }


def size_band(frame: pd.DataFrame, cuts: np.ndarray) -> np.ndarray:
    return np.select([frame["total_assets"] <= cuts[0], frame["total_assets"] <= cuts[1]], ["small", "medium"], "large")


def tune(candidate, train: pd.DataFrame, folds, n_iter: int) -> dict:
    """Random search with grouped CV; keeps the best configuration's fold scores and out-of-fold scores."""
    X, y = train[FEATURES], train[TARGET].to_numpy()
    imbalance = float((y == 0).sum() / y.sum())
    configs = list(ParameterSampler(candidate.space, n_iter=min(n_iter, len(ParameterGrid(candidate.space))), random_state=SEED))
    best = None
    for params in configs:
        oof, scores = np.zeros(len(y)), []
        for fit_rows, score_rows in folds:
            model = candidate.make(params, imbalance, SEED).fit(X.iloc[fit_rows], y[fit_rows])
            oof[score_rows] = model.predict_proba(X.iloc[score_rows])[:, 1]
            scores.append(evaluate.pr_auc(y[score_rows], oof[score_rows]))
        if best is None or np.mean(scores) > np.mean(best["fold_pr_auc"]):
            best = {"params": params, "fold_pr_auc": scores, "oof": oof}
    best.update(configs_tried=len(configs), imbalance=imbalance)
    return best


def choose_winner(results: dict[str, dict], margin: float, folds_lost_allowed: int) -> tuple[str, dict]:
    """Spec C5b: a challenger replaces XGBoost only if it wins on PR-AUC by the margin, consistently,
    with calibration and segment results no worse. Among those that qualify, the best CV PR-AUC wins."""
    champion = results[CHAMPION]
    min_folds_won = len(champion["cv"]["fold_pr_auc"]) - folds_lost_allowed
    decisions, qualified = {}, []
    for name, result in results.items():
        if name == CHAMPION:
            continue
        gain = np.array(result["cv"]["fold_pr_auc"]) - np.array(champion["cv"]["fold_pr_auc"])
        checks = {
            "beats_margin": bool(gain.mean() >= margin),
            "consistent_across_folds": bool((gain > 0).sum() >= min_folds_won),
            "calibration_no_worse": result["validation"]["calibration_error"] <= champion["validation"]["calibration_error"],
            "segments_no_worse": result["worst_segment_pr_auc"] >= champion["worst_segment_pr_auc"],
        }
        decisions[name] = {"mean_pr_auc_gain": float(gain.mean()), "folds_won": int((gain > 0).sum()), **checks,
                           "replaces_champion": all(checks.values())}
        if all(checks.values()):
            qualified.append(name)
    winner = max(qualified, key=lambda n: results[n]["cv"]["pr_auc_mean"]) if qualified else CHAMPION
    return winner, decisions


def run(n_iter: int, n_folds: int, out_dir: Path) -> dict:
    started = time.time()
    data_path = us_dataset.DEFAULT_PATH
    df = build(us_dataset.load(data_path))
    parts = split(df)
    train = parts["train"].reset_index(drop=True)
    y = train[TARGET].to_numpy()
    folds = list(StratifiedGroupKFold(n_splits=n_folds, shuffle=True, random_state=SEED).split(train, y, groups=train["company"]))
    cuts = np.quantile(train["total_assets"], [1 / 3, 2 / 3])
    segment_labels = {"industry": train["division"].to_numpy(), "size": size_band(train, cuts)}

    results, fitted = {}, {}
    for candidate in CANDIDATES:
        tick = time.time()
        best = tune(candidate, train, folds, n_iter)
        calibrator = PlattCalibrator().fit(best["oof"], y)
        model = candidate.make(best["params"], best["imbalance"], SEED).fit(train[FEATURES], y)
        trained = TrainedModel(candidate.name, "", model, calibrator, list(FEATURES))
        valid = parts["validation"]
        p_valid = trained.predict(valid)
        oof_calibrated = calibrator.transform(best["oof"])
        segs = {kind: evaluate.segments(y, oof_calibrated, labels) for kind, labels in segment_labels.items()}
        results[candidate.name] = {
            "notes": candidate.notes, "params": best["params"], "configs_tried": best["configs_tried"],
            "cv": {"fold_pr_auc": best["fold_pr_auc"], "pr_auc_mean": float(np.mean(best["fold_pr_auc"])),
                   "pr_auc_std": float(np.std(best["fold_pr_auc"])), "roc_auc_oof": evaluate.roc_auc(y, best["oof"])},
            "validation": {**evaluate.summary(valid[TARGET], p_valid),
                           "recall_at_precision": evaluate.recall_at_precision(valid[TARGET], p_valid, MIN_PRECISION),
                           "calibration_bins": evaluate.calibration_bins(valid[TARGET].to_numpy(), p_valid)},
            "segments_cv": segs,
            "worst_segment_pr_auc": min(s["pr_auc"] for kind in segs.values() for s in kind.values()),
            "seconds": round(time.time() - tick, 1),
        }
        fitted[candidate.name] = (candidate, trained)
        print(f"{candidate.name:20s} CV PR-AUC {results[candidate.name]['cv']['pr_auc_mean']:.3f} "
              f"± {results[candidate.name]['cv']['pr_auc_std']:.3f}  ({results[candidate.name]['seconds']}s)", flush=True)

    winner, decisions = choose_winner(results, **SELECTION)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    candidate, trained = fitted[winner]
    trained.version = f"us-bankruptcy-{winner}-{run_id}"

    # Holdouts: only now, and only for the winner. The alert threshold is fixed on validation first.
    valid = parts["validation"]
    threshold = evaluate.threshold_for_recall(valid[TARGET].to_numpy(), trained.predict(valid), RECALL_TARGET)
    holdout = {}
    for name in ("time_holdout", "company_holdout"):
        frame = parts[name]
        p = trained.predict(frame)
        holdout[name] = {**evaluate.summary(frame[TARGET], p), "at_alert_threshold": evaluate.at_threshold(frame[TARGET], p, threshold),
                         "recall_at_precision": evaluate.recall_at_precision(frame[TARGET], p, MIN_PRECISION),
                         "risk_bands": evaluate.risk_bands(frame[TARGET], p),
                         "calibration_bins": evaluate.calibration_bins(frame[TARGET].to_numpy(), p),
                         "segments": {"industry": evaluate.segments(frame[TARGET], p, frame["division"], min_positives=8),
                                      "size": evaluate.segments(frame[TARGET], p, size_band(frame, cuts), min_positives=8)}}

    # SHAP for all four (same output format whichever wins), on a sample of validation rows.
    rng = np.random.default_rng(SEED)
    sample = valid.iloc[rng.choice(len(valid), size=min(600, len(valid)), replace=False)]
    background = train.iloc[rng.choice(len(train), size=300, replace=False)]
    shap_out = {}
    warnings.filterwarnings("ignore", message="LightGBM binary classifier with TreeExplainer")
    for name, (cand, model) in fitted.items():
        rows = sample.iloc[:300] if name == "random_forest" else sample  # tree SHAP on a deep forest is slow
        shap_out[name] = explain.global_importance(explain.shap_values(cand.explainer, model.model, rows, background))
    p_valid = trained.predict(valid)
    riskiest = valid.assign(p=p_valid).nlargest(3, "p")
    winner_shap = explain.shap_values(candidate.explainer, trained.model, riskiest, background)
    examples = [{
        "business_id": row.company, "period": int(row.year), "model_version": trained.version,
        "p_fails_next_year": float(row.p),
        "risk_class": "high" if row.p > 0.6 else "moderate" if row.p >= 0.3 else "low",
        "confidence": "low" if pd.isna(row.revenue_growth_volatility) else "normal",  # under 4 years of history
        "top_drivers": explain.top_drivers(winner_shap[i], riskiest.iloc[i]),
    } for i, row in enumerate(riskiest.itertuples())]

    report = {
        "run_id": run_id, "model_version": trained.version, "winner": winner, "selection_rule": SELECTION,
        "selection": decisions, "candidates": results, "holdout": holdout, "alert_threshold": threshold,
        "recall_target": RECALL_TARGET, "min_precision": MIN_PRECISION, "shap_global": shap_out, "examples": examples,
        "data": {"path": str(data_path.name), "sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
                 "rows": int(len(df)), "companies": int(df["company"].nunique()), "positives": int(df[TARGET].sum()),
                 "identities": us_dataset.identity_shares(df),
                 "splits": {k: {"rows": int(len(v)), "positives": int(v[TARGET].sum()), "companies": int(v["company"].nunique())}
                            for k, v in parts.items()}},
        "features": FEATURES, "seed": SEED, "folds": n_folds, "configs_per_model": n_iter,
        "versions": {"python": platform.python_version(),
                     **{lib: version(lib) for lib in ("numpy", "pandas", "scikit-learn", "xgboost", "lightgbm", "shap")}},
        "minutes": round((time.time() - started) / 60, 1),
    }
    out = out_dir / run_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    joblib.dump(trained, out / "model.joblib")
    from finext_ml.model_card import write
    (out / "model_card.md").write_text(write(report), encoding="utf-8")
    print(f"winner: {winner}  ->  {out}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quick", action="store_true", help="2 configurations per model and 3 folds")
    parser.add_argument("--iterations", type=int, default=12, help="configurations tried per model (same budget for all)")
    parser.add_argument("--out", type=Path, default=ARTIFACTS)
    args = parser.parse_args()
    run(2 if args.quick else args.iterations, 3 if args.quick else 5, args.out)


if __name__ == "__main__":
    main()
