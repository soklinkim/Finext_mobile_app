"""Train the four candidates, pick the winner, explain it (pipeline spec C5, C5b, C6).

    python -m finext_ml.train_and_compare --data synthetic   # FINEXT synthetic MSMEs, stress_3m (simulates on first use)
    python -m finext_ml.train_and_compare --data us          # US bankruptcy research baseline
    python -m finext_ml.train_and_compare --quick ...        # small tuning budget, for a smoke test

Each dataset brings its own splits (no business and no later period leaks into training): a company holdout of
businesses never seen in training, and for the rest a train / validation / time-holdout split by period. Inside
train, grouped K-fold CV by business drives tuning and comparison. The holdouts are scored once, for the winner,
after it is chosen.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
import warnings
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import ParameterGrid, ParameterSampler, StratifiedGroupKFold

from finext_ml.evaluation import evaluation_metrics, shap_explanations
from finext_ml.data.dataset_definition import Dataset
from finext_ml.models.candidate_models import CANDIDATES, CHAMPION, PlattCalibrator, TrainedModel

SEED = 20261027
RECALL_TARGET = 0.85        # alert threshold: catch at least 85% of positives on validation (spec: missing a stressed
                            # business costs more than a false alarm; 70% caught only 54% of unseen businesses)
MIN_PRECISION = 0.20        # reported: recall while at least 1 in 5 alerts is right
SELECTION = {"margin": 0.02, "folds_lost_allowed": 1}  # spec C5b: +0.02 PR-AUC, consistent across folds [Decision]
LAYER1_MARGIN = 0.01        # optional (Layer 1) features are kept only if they add at least this much CV PR-AUC
ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


def tune(candidate, train: pd.DataFrame, target: str, features: list[str], monotone: dict, folds, n_iter: int) -> dict:
    """Random search with grouped CV; keeps the best configuration's fold scores and out-of-fold scores."""
    X, y = train[features], train[target].to_numpy()
    imbalance = float((y == 0).sum() / y.sum())
    configs = list(ParameterSampler(candidate.space, n_iter=min(n_iter, len(ParameterGrid(candidate.space))), random_state=SEED))
    best = None
    for params in configs:
        oof, scores = np.zeros(len(y)), []
        for fit_rows, score_rows in folds:
            model = candidate.make(params, imbalance, SEED, features, monotone).fit(X.iloc[fit_rows], y[fit_rows])
            oof[score_rows] = model.predict_proba(X.iloc[score_rows])[:, 1]
            scores.append(evaluation_metrics.pr_auc(y[score_rows], oof[score_rows]))
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


def layer1_test(data: Dataset, train: pd.DataFrame, folds, n_iter: int) -> dict:
    """Spec C5: train the champion with and without the Layer 1 features; keep them only if they help."""
    champion = next(c for c in CANDIDATES if c.name == CHAMPION)
    without = tune(champion, train, data.target, data.features, data.monotone, folds, n_iter)
    with_l1 = tune(champion, train, data.target, data.features + data.optional_features, data.monotone, folds, n_iter)
    gain = float(np.mean(with_l1["fold_pr_auc"]) - np.mean(without["fold_pr_auc"]))
    return {"without": float(np.mean(without["fold_pr_auc"])), "with": float(np.mean(with_l1["fold_pr_auc"])),
            "gain": gain, "margin": LAYER1_MARGIN, "kept": gain >= LAYER1_MARGIN}


def run(data: Dataset, n_iter: int, n_folds: int, out_dir: Path) -> dict:
    started = time.time()
    target, parts = data.target, data.parts
    train = parts["train"].reset_index(drop=True)
    y = train[target].to_numpy()
    folds = list(StratifiedGroupKFold(n_splits=n_folds, shuffle=True, random_state=SEED).split(train, y, groups=train[data.group]))
    segment_labels = {kind: label(train, train) for kind, label in data.segments.items()}

    layer1 = layer1_test(data, train, folds, n_iter) if data.optional_features else None
    features = data.features + (data.optional_features if layer1 and layer1["kept"] else [])
    if layer1:
        print(f"layer 1 features: CV PR-AUC {layer1['without']:.3f} without, {layer1['with']:.3f} with -> "
              f"{'kept' if layer1['kept'] else 'dropped'}", flush=True)

    results, fitted = {}, {}
    valid = parts["validation"]
    for candidate in CANDIDATES:
        tick = time.time()
        best = tune(candidate, train, target, features, data.monotone, folds, n_iter)
        calibrator = PlattCalibrator().fit(best["oof"], y)
        model = candidate.make(best["params"], best["imbalance"], SEED, features, data.monotone).fit(train[features], y)
        trained = TrainedModel(candidate.name, "", model, calibrator, list(features))
        p_valid, p_train = trained.predict(valid), trained.predict(train)
        oof_calibrated = calibrator.transform(best["oof"])
        segs = {kind: evaluation_metrics.segments(y, oof_calibrated, labels) for kind, labels in segment_labels.items()}
        results[candidate.name] = {
            "notes": candidate.notes, "params": best["params"], "configs_tried": best["configs_tried"],
            # Overfitting check: the same model scored on the rows it was fitted on.
            "train": {"pr_auc": evaluation_metrics.pr_auc(y, p_train), "roc_auc": evaluation_metrics.roc_auc(y, p_train)},
            "cv": {"fold_pr_auc": best["fold_pr_auc"], "pr_auc_mean": float(np.mean(best["fold_pr_auc"])),
                   "pr_auc_std": float(np.std(best["fold_pr_auc"])), "roc_auc_oof": evaluation_metrics.roc_auc(y, best["oof"])},
            "validation": {**evaluation_metrics.summary(valid[target], p_valid),
                           "recall_at_precision": evaluation_metrics.recall_at_precision(valid[target], p_valid, MIN_PRECISION),
                           "calibration_bins": evaluation_metrics.calibration_bins(valid[target].to_numpy(), p_valid)},
            "segments_cv": segs,
            "worst_segment_pr_auc": min(s["pr_auc"] for kind in segs.values() for s in kind.values()),
            "seconds": round(time.time() - tick, 1),
        }
        fitted[candidate.name] = (candidate, trained)
        r = results[candidate.name]
        print(f"{candidate.name:20s} CV PR-AUC {r['cv']['pr_auc_mean']:.3f} ± {r['cv']['pr_auc_std']:.3f}  ({r['seconds']}s)", flush=True)

    winner, decisions = choose_winner(results, **SELECTION)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    candidate, trained = fitted[winner]
    trained.version = f"{data.name}-{winner}-{run_id}"

    # Holdouts: only now, and only for the winner. The alert threshold is fixed on validation first.
    threshold = evaluation_metrics.threshold_for_recall(valid[target].to_numpy(), trained.predict(valid), RECALL_TARGET)
    holdout = {}
    for name in ("time_holdout", "company_holdout"):
        frame = parts[name]
        p = trained.predict(frame)
        holdout[name] = {**evaluation_metrics.summary(frame[target], p), "at_alert_threshold": evaluation_metrics.at_threshold(frame[target], p, threshold),
                         "recall_at_precision": evaluation_metrics.recall_at_precision(frame[target], p, MIN_PRECISION),
                         "risk_bands": evaluation_metrics.risk_bands(frame[target], p),
                         "calibration_bins": evaluation_metrics.calibration_bins(frame[target].to_numpy(), p),
                         "segments": {kind: evaluation_metrics.segments(frame[target], p, label(frame, train), min_positives=8)
                                      for kind, label in data.segments.items()}}

    # SHAP for all four (same output format whichever wins), on a sample of validation rows.
    warnings.filterwarnings("ignore", message="LightGBM binary classifier with TreeExplainer")
    rng = np.random.default_rng(SEED)
    sample = valid.iloc[rng.choice(len(valid), size=min(600, len(valid)), replace=False)]
    background = train.iloc[rng.choice(len(train), size=min(300, len(train)), replace=False)]
    shap_out = {}
    for name, (cand, model) in fitted.items():
        rows = sample.iloc[:300] if name == "random_forest" else sample  # tree SHAP on a deep forest is slow
        shap_out[name] = shap_explanations.global_importance(shap_explanations.shap_values(cand.explainer, model.model, rows, background, features),
                                                   features, data.labels)
    riskiest = valid.assign(p=trained.predict(valid)).nlargest(3, "p")
    winner_shap = shap_explanations.shap_values(candidate.explainer, trained.model, riskiest, background, features)
    examples = [{
        "business_id": str(row[data.group]), "period": str(row.get("period", row.get("year"))), "model_version": trained.version,
        f"p_{target}": float(row["p"]),
        "risk_class": "high" if row["p"] > 0.6 else "moderate" if row["p"] >= 0.3 else "low",
        "confidence": data.confidence(row),
        "top_drivers": shap_explanations.top_drivers(winner_shap[i], row, features, data.labels, data.missing_text),
    } for i, (_, row) in enumerate(riskiest.iterrows())]

    all_rows = pd.concat(parts.values())
    source = data.card.get("file")
    report = {
        "run_id": run_id, "dataset": data.name, "target": target, "model_version": trained.version, "winner": winner,
        "selection_rule": SELECTION, "selection": decisions, "layer1": layer1, "candidates": results, "holdout": holdout,
        "alert_threshold": threshold, "recall_target": RECALL_TARGET, "min_precision": MIN_PRECISION,
        "shap_global": shap_out, "examples": examples, "card": {k: v for k, v in data.card.items() if k != "file"},
        "data": {"rows": int(len(all_rows)), "groups": int(all_rows[data.group].nunique()), "positives": int(all_rows[target].sum()),
                 "sha256": hashlib.sha256(source.read_bytes()).hexdigest() if source else None,
                 "splits": {k: {"rows": int(len(v)), "positives": int(v[target].sum()), "groups": int(v[data.group].nunique())}
                            for k, v in parts.items()}},
        "features": features, "seed": SEED, "folds": n_folds, "configs_per_model": n_iter,
        "versions": {"python": platform.python_version(),
                     **{lib: version(lib) for lib in ("numpy", "pandas", "scikit-learn", "xgboost", "lightgbm", "shap")}},
        "minutes": round((time.time() - started) / 60, 1),
    }
    out = out_dir / data.name / run_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    joblib.dump(trained, out / "model.joblib")
    from finext_ml.evaluation.model_card import write
    (out / "model_card.md").write_text(write(report), encoding="utf-8")
    print(f"winner: {winner}  ->  {out}")
    return report


def load(name: str) -> Dataset:
    if name == "us":
        from finext_ml.data import us_bankruptcy_dataset
        return us_bankruptcy_dataset.dataset()
    from finext_ml.data import finext_dataset
    return finext_dataset.dataset()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", choices=["synthetic", "us"], default="synthetic")
    parser.add_argument("--quick", action="store_true", help="2 configurations per model and 3 folds")
    parser.add_argument("--iterations", type=int, default=12, help="configurations tried per model (same budget for all)")
    parser.add_argument("--out", type=Path, default=ARTIFACTS)
    args = parser.parse_args()
    run(load(args.data), 2 if args.quick else args.iterations, 3 if args.quick else 5, args.out)


if __name__ == "__main__":
    main()
