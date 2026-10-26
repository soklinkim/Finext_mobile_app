"""SHAP explanations in one format for every candidate (spec C5b, C6), so the dashboard does not depend on the winner."""
from __future__ import annotations

import numpy as np
import pandas as pd
import shap

from finext_ml.features import FEATURES, LABELS


def _positive_class(values) -> np.ndarray:
    """SHAP returns (rows, features), (rows, features, classes) or a list per class depending on the model."""
    if isinstance(values, list):
        values = values[-1]
    values = np.asarray(values)
    return values[..., -1] if values.ndim == 3 else values


def shap_values(candidate_kind: str, model, rows: pd.DataFrame, background: pd.DataFrame) -> np.ndarray:
    """Contribution of each feature to each row's raw score (log-odds for boosted models and LR)."""
    if candidate_kind == "tree":
        return _positive_class(shap.TreeExplainer(model).shap_values(rows[FEATURES]))
    # Logistic regression: explain the transformed inputs, then add each feature's value and missing-flag parts.
    prepare, linear = model.named_steps["prepare"], model.named_steps["model"]
    explainer = shap.LinearExplainer(linear, shap.maskers.Independent(prepare.transform(background[FEATURES])))
    parts = _positive_class(explainer.shap_values(prepare.transform(rows[FEATURES])))
    n = len(FEATURES)
    return parts[:, :n] + parts[:, n:2 * n]


def global_importance(values: np.ndarray, top: int = 10) -> list[dict]:
    mean_abs = np.abs(values).mean(axis=0)
    order = np.argsort(mean_abs)[::-1][:top]
    return [{"feature": FEATURES[i], "label": LABELS[FEATURES[i]], "mean_abs_shap": float(mean_abs[i])} for i in order]


def top_drivers(values_row: np.ndarray, features_row: pd.Series, top: int = 5) -> list[dict]:
    """Spec C6: feature, its value, direction and contribution, with a business-friendly label."""
    order = np.argsort(np.abs(values_row))[::-1][:top]
    drivers = []
    for i in order:
        value = features_row[FEATURES[i]]
        drivers.append({
            "feature": FEATURES[i], "label": LABELS[FEATURES[i]],
            "value": None if pd.isna(value) else float(value),
            "direction": "raises risk" if values_row[i] > 0 else "lowers risk",
            "contribution": float(values_row[i]),
        })
    return drivers
