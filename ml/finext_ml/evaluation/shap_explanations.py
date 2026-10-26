"""SHAP explanations in one format for every candidate (spec C5b, C6), so the dashboard does not depend on the winner."""
from __future__ import annotations

import numpy as np
import pandas as pd
import shap


def _positive_class(values) -> np.ndarray:
    """SHAP returns (rows, features), (rows, features, classes) or a list per class depending on the model."""
    if isinstance(values, list):
        values = values[-1]
    values = np.asarray(values)
    return values[..., -1] if values.ndim == 3 else values


def shap_values(candidate_kind: str, model, rows: pd.DataFrame, background: pd.DataFrame, features: list[str]) -> np.ndarray:
    """Contribution of each feature to each row's raw score (log-odds for boosted models and LR)."""
    if candidate_kind == "tree":
        return _positive_class(shap.TreeExplainer(model).shap_values(rows[features]))
    # Logistic regression: explain the transformed inputs, then add each feature's value and missing-flag parts.
    prepare, linear = model.named_steps["prepare"], model.named_steps["model"]
    explainer = shap.LinearExplainer(linear, shap.maskers.Independent(prepare.transform(background[features])))
    parts = _positive_class(explainer.shap_values(prepare.transform(rows[features])))
    n = len(features)
    return parts[:, :n] + parts[:, n:2 * n]


def global_importance(values: np.ndarray, features: list[str], labels: dict[str, str], top: int = 10) -> list[dict]:
    mean_abs = np.abs(values).mean(axis=0)
    order = np.argsort(mean_abs)[::-1][:top]
    return [{"feature": features[i], "label": labels[features[i]], "mean_abs_shap": float(mean_abs[i])} for i in order]


# Snapshot reason codes (backend/app/snapshots.py) in plain words.
REASON_TEXT = {"not_yet_available": "not enough history yet", "not_applicable": "does not apply this month",
               "no_data": "not recorded"}


def missing_text(feature: str, features_row: pd.Series, missing: dict[str, str]) -> str:
    """Why a value is missing, in plain words: a missing value is often a signal in itself (e.g. no profit)."""
    if feature in missing:
        return missing[feature]
    reason = features_row.get(f"reason_{feature}")
    return REASON_TEXT.get(reason, "not available") if isinstance(reason, str) else "not available"


def top_drivers(values_row: np.ndarray, features_row: pd.Series, features: list[str], labels: dict[str, str],
                missing: dict[str, str] | None = None, top: int = 5) -> list[dict]:
    """Spec C6: feature, its value, direction and contribution, with a business-friendly label.
    `value_text` is what to show: the number, or why there is none."""
    order = np.argsort(np.abs(values_row))[::-1][:top]
    drivers = []
    for i in order:
        feature, value = features[i], features_row[features[i]]
        present = not pd.isna(value)
        drivers.append({
            "feature": feature, "label": labels[feature],
            "value": float(value) if present else None,
            "value_text": f"{float(value):.2f}" if present else missing_text(feature, features_row, missing or {}),
            "direction": "raises risk" if values_row[i] > 0 else "lowers risk",
            "contribution": float(values_row[i]),
        })
    return drivers
