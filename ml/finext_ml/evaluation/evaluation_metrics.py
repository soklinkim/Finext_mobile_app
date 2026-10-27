"""Evaluation metrics from the pipeline spec (C5): PR-AUC first, then calibration, threshold metrics and segments."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, precision_recall_curve, roc_auc_score


def pr_auc(y, p) -> float | None:
    return float(average_precision_score(y, p)) if np.sum(y) > 0 else None


def roc_auc(y, p) -> float | None:
    return float(roc_auc_score(y, p)) if 0 < np.sum(y) < len(y) else None


def calibration_bins(y, p, bins: int = 10) -> list[dict]:
    """Equal-count bins (positives are rare, so equal-width bins would leave most of them empty)."""
    order = np.argsort(p)
    out = []
    for chunk in np.array_split(order, bins):
        if len(chunk):
            out.append({"predicted": float(np.mean(p[chunk])), "observed": float(np.mean(y[chunk])), "count": int(len(chunk))})
    return out


def calibration_error(y, p, bins: int = 10) -> float:
    """Expected calibration error: count-weighted gap between predicted and observed rates per bin."""
    table = calibration_bins(np.asarray(y), np.asarray(p), bins)
    total = sum(row["count"] for row in table)
    return float(sum(row["count"] * abs(row["predicted"] - row["observed"]) for row in table) / total)


def threshold_for_recall(y, p, target: float) -> float:
    """The highest threshold that still catches at least `target` of the positives."""
    precision, recall, thresholds = precision_recall_curve(y, p)
    ok = np.where(recall[:-1] >= target)[0]
    return float(thresholds[ok[-1]]) if len(ok) else float(np.min(p))


def recall_at_precision(y, p, min_precision: float) -> float:
    precision, recall, _ = precision_recall_curve(y, p)
    ok = precision >= min_precision
    return float(np.max(recall[ok])) if ok.any() else 0.0


def at_threshold(y, p, threshold: float) -> dict:
    predicted = (np.asarray(p) >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {"threshold": float(threshold), "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
            "precision": float(precision), "recall": float(recall),
            "f1": float(2 * precision * recall / (precision + recall)) if precision + recall else 0.0,
            "accuracy": float((tp + tn) / len(predicted))}


# Risk levels shown to users: low < 10% <= moderate <= 30% < high. The spec's proposal (30% / 60%) labelled a 16-28%
# chance "low" although only 7% of training companies failed. Chosen on validation companies: about 1% of "low",
# 16% of "moderate" (twice the average) and 74% of "high" failed; the company holdout confirmed it (2%, 14%, 67%).
RISK_BANDS = {"low": 0.10, "high": 0.30}


def risk_bands(y, p, low: float = RISK_BANDS["low"], high: float = RISK_BANDS["high"]) -> dict:
    """Observed failure rate in each risk level."""
    y, p = np.asarray(y), np.asarray(p)
    bands = {"low": p < low, "moderate": (p >= low) & (p <= high), "high": p > high}
    return {name: {"count": int(mask.sum()), "observed_rate": float(y[mask].mean()) if mask.any() else None}
            for name, mask in bands.items()}


def summary(y, p) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    return {"rows": int(len(y)), "positives": int(y.sum()), "pr_auc": pr_auc(y, p), "roc_auc": roc_auc(y, p),
            "brier": float(brier_score_loss(y, p)), "calibration_error": calibration_error(y, p)}


def segments(y, p, labels, min_positives: int = 15) -> dict[str, dict]:
    """PR-AUC per segment (industry, size); segments with too few positives to measure are skipped."""
    y, p, labels = np.asarray(y), np.asarray(p), np.asarray(labels)
    out = {}
    for label in sorted(set(labels)):
        mask = labels == label
        if y[mask].sum() >= min_positives:
            out[str(label)] = {"rows": int(mask.sum()), "positives": int(y[mask].sum()), "pr_auc": pr_auc(y[mask], p[mask])}
    return out


def bootstrap_intervals(y, p, groups, threshold: float, draws: int = 500, seed: int = 0) -> dict[str, list[float]]:
    """95% intervals for PR-AUC, precision and recall, resampling whole businesses (their months are not independent)."""
    y, p, groups = np.asarray(y), np.asarray(p), np.asarray(groups)
    rows_of = [np.flatnonzero(groups == g) for g in np.unique(groups)]
    rng = np.random.default_rng(seed)
    stats = {"pr_auc": [], "precision": [], "recall": []}
    for _ in range(draws):
        rows = np.concatenate([rows_of[i] for i in rng.integers(len(rows_of), size=len(rows_of))])
        if y[rows].sum() == 0:
            continue
        t = at_threshold(y[rows], p[rows], threshold)
        stats["pr_auc"].append(pr_auc(y[rows], p[rows]))
        stats["precision"].append(t["precision"])
        stats["recall"].append(t["recall"])
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in stats.items()}
