"""The four candidates (spec C5b), each with its tuning space, plus probability calibration (spec C5)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
from lightgbm import LGBMClassifier
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import MissingIndicator, SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import QuantileTransformer
from xgboost import XGBClassifier


CHAMPION = "xgboost"


@dataclass
class Candidate:
    name: str
    make: Callable[..., Any]  # (params, negatives per positive, seed, features, monotone) -> unfitted model
    space: dict[str, list]
    notes: str
    explainer: str  # "tree" or "linear"


def _xgboost(params: dict, imbalance: float, seed: int, features: list[str], monotone: dict[str, int]) -> XGBClassifier:
    return XGBClassifier(**params, scale_pos_weight=imbalance, monotone_constraints=tuple(monotone.get(f, 0) for f in features),
                         tree_method="hist", eval_metric="aucpr", n_jobs=-1, random_state=seed)


def _lightgbm(params: dict, imbalance: float, seed: int, features: list[str], monotone: dict[str, int]) -> LGBMClassifier:
    return LGBMClassifier(**params, scale_pos_weight=imbalance, monotone_constraints=[monotone.get(f, 0) for f in features],
                          subsample_freq=1, n_jobs=-1, random_state=seed, verbose=-1)


def _random_forest(params: dict, imbalance: float, seed: int, features: list[str], monotone: dict[str, int]) -> RandomForestClassifier:
    # Handles missing values natively (scikit-learn >= 1.4); no monotonic constraints.
    return RandomForestClassifier(**params, n_estimators=300, class_weight="balanced_subsample", n_jobs=-1, random_state=seed)


def _logistic(params: dict, imbalance: float, seed: int, features: list[str], monotone: dict[str, int]) -> Pipeline:
    # Needs imputation and scaling. Ratios have very long tails, so a rank-based transform replaces z-scores;
    # a missing-value flag per feature stands in for the reason codes (no previous period, zero denominator).
    prepare = ColumnTransformer([
        ("value", Pipeline([("impute", SimpleImputer(strategy="median")),
                            ("scale", QuantileTransformer(output_distribution="normal", n_quantiles=1000, random_state=seed))]), features),
        ("missing", MissingIndicator(features="all"), features),
    ])
    return Pipeline([("prepare", prepare),
                     ("model", LogisticRegression(**params, class_weight="balanced", max_iter=5000, random_state=seed))])


CANDIDATES: list[Candidate] = [
    # Spaces lean towards strong regularisation: with a few hundred positives and heavy class weights, deep
    # trees memorised the US training failures (train ROC-AUC 0.996 vs 0.84 unseen in the first run).
    Candidate("xgboost", _xgboost, {
        "n_estimators": [100, 200, 400], "learning_rate": [0.02, 0.05, 0.1], "max_depth": [2, 3, 4],
        "min_child_weight": [10, 30, 60], "subsample": [0.6, 0.8], "colsample_bytree": [0.5, 0.8],
        "reg_lambda": [5.0, 20.0, 50.0], "gamma": [0.0, 1.0, 5.0],
    }, "Default champion: native missing values, monotonic constraints.", "tree"),
    Candidate("logistic_regression", _logistic, {
        "C": [0.01, 0.03, 0.1, 0.3, 1.0, 3.0],
    }, "Explainable baseline: median imputation + missing flags, rank-normal scaling.", "linear"),
    Candidate("random_forest", _random_forest, {
        "max_depth": [4, 6, 10], "min_samples_leaf": [50, 100, 200, 400], "max_features": ["sqrt", 0.3, 0.5],
    }, "Native missing values; no monotonic constraints.", "tree"),
    Candidate("lightgbm", _lightgbm, {
        "n_estimators": [100, 200, 400], "learning_rate": [0.02, 0.05, 0.1], "num_leaves": [3, 7, 15],
        "min_child_samples": [100, 200, 400], "subsample": [0.6, 0.8], "colsample_bytree": [0.5, 0.8],
        "reg_lambda": [5.0, 20.0, 50.0],
    }, "Gradient-boosting alternative: native missing values, monotonic constraints.", "tree"),
]


class PlattCalibrator:
    """Platt scaling on the log-odds of out-of-fold scores, so the raw model's ranking is kept.

    Fitted on predictions the model did not train on (grouped cross-validation), then applied to the
    model refitted on all training rows. Class weights inflate raw scores; this brings them back to rates.
    """

    def fit(self, scores, y) -> "PlattCalibrator":
        self.model = LogisticRegression(C=1e6, max_iter=1000).fit(self._logit(scores), y)
        return self

    def transform(self, scores) -> np.ndarray:
        return self.model.predict_proba(self._logit(scores))[:, 1]

    @staticmethod
    def _logit(scores) -> np.ndarray:
        p = np.clip(np.asarray(scores, dtype=float), 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)


@dataclass
class TrainedModel:
    """What a prediction run needs: the fitted model, its calibrator, and the exact feature order."""
    name: str
    version: str
    model: Any
    calibrator: PlattCalibrator
    features: list[str]

    def predict(self, frame) -> np.ndarray:
        return self.calibrator.transform(self.model.predict_proba(frame[self.features])[:, 1])
