"""Train the four candidates, pick the winner, explain it (pipeline spec C5, C5b, C6).

    python -m finext_ml.train_and_compare --data us          # US listed companies, bankruptcy within a year (real data)
    python -m finext_ml.train_and_compare --data polish      # Polish companies, bankruptcy within a year (real data)
    python -m finext_ml.train_and_compare --quick ...        # small tuning budget, for a smoke test

Only real data is used for training. Each dataset brings its own splits (no business and no later period leaks into
training): a company holdout of businesses never seen in training, and for the rest a train / validation split
(by period, plus a time holdout, where the data has years). Inside
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
from sklearn.model_selection import GroupShuffleSplit, ParameterGrid, ParameterSampler, StratifiedGroupKFold

from finext_ml.evaluation import evaluation_metrics, shap_explanations
from finext_ml.data.dataset_definition import Dataset
from finext_ml.models.candidate_models import CANDIDATES, CHAMPION, PlattCalibrator, TrainedModel, fit_early_stopping

SEED = 20261027
RECALL_TARGET = 0.85        # alert threshold: catch at least 85% of positives on validation (spec: missing a stressed
                            # business costs more than a false alarm; 70% caught only 54% of unseen businesses)
MIN_PRECISION = 0.20        # reported: recall while at least 1 in 5 alerts is right
SELECTION = {"margin": 0.02, "folds_lost_allowed": 1}  # spec C5b: +0.02 PR-AUC, consistent across folds [Decision]
LAYER1_MARGIN = 0.01        # optional (Layer 1) features are kept only if they add at least this much CV PR-AUC
STOPPING_SHARE = 0.2        # boosted models: share of each fold's training businesses held back for early stopping
STABILITY_SEEDS = 5         # the winner is refitted with this many seeds to show how much results depend on chance
LEARNING_CURVE = (0.25, 0.5, 0.75, 1.0)  # shares of training businesses
ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


def _fit(candidate, params, imbalance, features, monotone, X, y, groups, fit_rows, seed=SEED):
    """Fit on `fit_rows`. Boosted models hold back some of those businesses to decide when to stop adding trees,
    so the rows being scored never influence the model."""
    model = candidate.make(params, imbalance, seed, features, monotone)
    if not candidate.boosted:
        return model.fit(X.iloc[fit_rows], y[fit_rows]), None
    inner, stop = next(GroupShuffleSplit(n_splits=1, test_size=STOPPING_SHARE, random_state=seed).split(fit_rows, groups=groups[fit_rows]))
    inner, stop = fit_rows[inner], fit_rows[stop]
    return fit_early_stopping(model, X.iloc[inner], y[inner], X.iloc[stop], y[stop])


def tune(candidate, train: pd.DataFrame, target: str, group: str, features: list[str], monotone: dict, folds, n_iter: int) -> dict:
    """Random search with grouped CV. Each configuration is scored on the businesses it did not see and on the rows
    it was fitted on. The chosen one follows the one-standard-error rule: among configurations within one standard
    error of the best CV PR-AUC, the one with the smallest train-vs-CV gap (it memorises least for practically the
    same score)."""
    X, y, groups = train[features], train[target].to_numpy(), train[group].to_numpy()
    imbalance = float((y == 0).sum() / y.sum())
    configs = list(ParameterSampler(candidate.space, n_iter=min(n_iter, len(ParameterGrid(candidate.space))), random_state=SEED))
    tried = []
    for params in configs:
        oof, scores, fitted_scores, rounds = np.zeros(len(y)), [], [], []
        for fit_rows, score_rows in folds:
            model, n_trees = _fit(candidate, params, imbalance, features, monotone, X, y, groups, fit_rows)
            oof[score_rows] = model.predict_proba(X.iloc[score_rows])[:, 1]
            scores.append(evaluation_metrics.pr_auc(y[score_rows], oof[score_rows]))
            fitted_scores.append(evaluation_metrics.pr_auc(y[fit_rows], model.predict_proba(X.iloc[fit_rows])[:, 1]))
            rounds.append(n_trees)
        tried.append({"params": params, "fold_pr_auc": scores, "oof": oof, "mean": float(np.mean(scores)),
                      "gap": float(np.mean(fitted_scores) - np.mean(scores)),
                      "n_estimators": int(np.median(rounds)) if candidate.boosted else None})
    top = max(tried, key=lambda c: c["mean"])
    floor = top["mean"] - np.std(top["fold_pr_auc"]) / np.sqrt(len(folds))
    best = min((c for c in tried if c["mean"] >= floor), key=lambda c: c["gap"])
    final = {**best["params"], **({"n_estimators": best["n_estimators"]} if candidate.boosted else {})}
    return {**best, "final_params": final, "configs_tried": len(configs), "imbalance": imbalance,
            "search": {"best_cv": top["mean"], "best_cv_gap": top["gap"], "chosen_cv": best["mean"], "chosen_gap": best["gap"]}}


def learning_curve(candidate, params: dict, imbalance: float, train: pd.DataFrame, target: str, group: str,
                   features: list[str], monotone: dict, folds) -> list[dict]:
    """CV and train PR-AUC with growing shares of the training businesses. Both low and close: underfitting.
    CV still climbing at 100%: more businesses would help. A wide gap that does not close: overfitting."""
    X, y, groups = train[features], train[target].to_numpy(), train[group].to_numpy()
    rng = np.random.default_rng(SEED)
    out = []
    for share in LEARNING_CURVE:
        cv, fitted, counts = [], [], []
        for fit_rows, score_rows in folds:
            names = np.unique(groups[fit_rows])
            keep = rng.choice(names, size=max(2, round(len(names) * share)), replace=False)
            rows = fit_rows[np.isin(groups[fit_rows], keep)]
            if y[rows].sum() == 0:
                continue
            model = candidate.make(params, imbalance, SEED, features, monotone).fit(X.iloc[rows], y[rows])
            cv.append(evaluation_metrics.pr_auc(y[score_rows], model.predict_proba(X.iloc[score_rows])[:, 1]))
            fitted.append(evaluation_metrics.pr_auc(y[rows], model.predict_proba(X.iloc[rows])[:, 1]))
            counts.append(len(keep))
        out.append({"share": share, "businesses": int(np.mean(counts)),
                    "cv_pr_auc": float(np.mean(cv)), "train_pr_auc": float(np.mean(fitted))})
    return out


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
    without = tune(champion, train, data.target, data.group, data.features, data.monotone, folds, n_iter)
    with_l1 = tune(champion, train, data.target, data.group, data.features + data.optional_features, data.monotone, folds, n_iter)
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

    results, fitted, oofs = {}, {}, {}
    valid = parts["validation"]
    for candidate in CANDIDATES:
        tick = time.time()
        best = tune(candidate, train, target, data.group, features, data.monotone, folds, n_iter)
        calibrator = PlattCalibrator().fit(best["oof"], y)
        model = candidate.make(best["final_params"], best["imbalance"], SEED, features, data.monotone).fit(train[features], y)
        trained = TrainedModel(candidate.name, "", model, calibrator, list(features))
        p_valid, p_train = trained.predict(valid), trained.predict(train)
        oof_calibrated = calibrator.transform(best["oof"])
        segs = {kind: evaluation_metrics.segments(y, oof_calibrated, labels) for kind, labels in segment_labels.items()}
        results[candidate.name] = {
            "notes": candidate.notes, "params": best["final_params"], "configs_tried": best["configs_tried"], "search": best["search"],
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
        oofs[candidate.name] = (oof_calibrated, best)
        r = results[candidate.name]
        print(f"{candidate.name:20s} CV PR-AUC {r['cv']['pr_auc_mean']:.3f} ± {r['cv']['pr_auc_std']:.3f}  ({r['seconds']}s)", flush=True)

    winner, decisions = choose_winner(results, **SELECTION)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    candidate, trained = fitted[winner]
    trained.version = f"{data.name}-{winner}-{run_id}"

    # Holdouts: only now, and only for the winner. The alert threshold is fixed first, from data it did not train on:
    # the lower of the thresholds that reach the recall target on validation (later months of known businesses) and
    # on the out-of-fold scores (businesses the model had not seen), so it also holds for new businesses.
    oof_winner, best_winner = oofs[winner]
    thresholds = {"validation": evaluation_metrics.threshold_for_recall(valid[target].to_numpy(), trained.predict(valid), RECALL_TARGET),
                  "unseen_businesses": evaluation_metrics.threshold_for_recall(y, oof_winner, RECALL_TARGET)}
    threshold = min(thresholds.values())
    stability = [TrainedModel(winner, "", candidate.make(best_winner["final_params"], best_winner["imbalance"], seed, features,
                                                         data.monotone).fit(train[features], y), trained.calibrator, list(features))
                 for seed in range(SEED + 1, SEED + STABILITY_SEEDS)]
    holdout = {}
    for name in [k for k in parts if k not in ("train", "validation")]:
        frame = parts[name]
        p = trained.predict(frame)
        truth = frame[target].to_numpy()
        holdout[name] = {**evaluation_metrics.summary(truth, p), "at_alert_threshold": evaluation_metrics.at_threshold(truth, p, threshold),
                         "intervals": evaluation_metrics.bootstrap_intervals(truth, p, frame[data.group], threshold, seed=SEED),
                         "seed_pr_auc": [evaluation_metrics.pr_auc(truth, p)] + [evaluation_metrics.pr_auc(truth, m.predict(frame)) for m in stability],
                         "recall_at_precision": evaluation_metrics.recall_at_precision(truth, p, MIN_PRECISION),
                         "risk_bands": evaluation_metrics.risk_bands(truth, p),
                         "calibration_bins": evaluation_metrics.calibration_bins(truth, p),
                         "segments": {kind: evaluation_metrics.segments(truth, p, label(frame, train), min_positives=8)
                                      for kind, label in data.segments.items()},
                         "baselines": {label: {"pr_auc": evaluation_metrics.pr_auc(truth, score(frame)),
                                               **evaluation_metrics.at_threshold(truth, score(frame), alert)}
                                       for label, (score, alert) in data.baselines.items()}}
        if data.already_stressed:
            calm = ~data.already_stressed(frame)
            holdout[name]["early_warning"] = {**evaluation_metrics.summary(truth[calm], p[calm]),
                                              "at_alert_threshold": evaluation_metrics.at_threshold(truth[calm], p[calm], threshold),
                                              "baselines": {label: evaluation_metrics.pr_auc(truth[calm], score(frame)[calm])
                                                            for label, (score, _) in data.baselines.items()}}
    curve = learning_curve(candidate, best_winner["final_params"], best_winner["imbalance"], train, target, data.group,
                           features, data.monotone, folds)
    print("learning curve: " + ", ".join(f"{c['share']:.0%} CV {c['cv_pr_auc']:.3f} / train {c['train_pr_auc']:.3f}" for c in curve), flush=True)

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
        "alert_threshold": threshold, "alert_thresholds": thresholds, "learning_curve": curve, "recall_target": RECALL_TARGET, "min_precision": MIN_PRECISION,
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
    if name == "polish":
        from finext_ml.data import polish_bankruptcy_dataset
        return polish_bankruptcy_dataset.dataset()
    from finext_ml.data import us_bankruptcy_dataset
    return us_bankruptcy_dataset.dataset()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", choices=["us", "polish"], default="us")
    parser.add_argument("--quick", action="store_true", help="2 configurations per model and 3 folds")
    parser.add_argument("--iterations", type=int, default=30, help="configurations tried per model (same budget for all)")
    parser.add_argument("--out", type=Path, default=ARTIFACTS)
    args = parser.parse_args()
    run(load(args.data), 2 if args.quick else args.iterations, 3 if args.quick else 5, args.out)


if __name__ == "__main__":
    main()
