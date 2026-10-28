"""Layer 2 scoring: the trained XGBoost model, its calibration, and per-business explanations (spec C6).

The model files in `app/risk_model_files/` come from `python -m finext_ml.export_model <run>` (ml/). They hold the
trees in XGBoost's portable JSON format and a metadata file (feature order, plain labels, calibration, alert
threshold, risk bands, local failure rate, version). Only xgboost and numpy are needed here: no pickles, no training code.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_DIR = Path(__file__).resolve().parent / "risk_model_files"


class RiskModel:
    """Scores rows of features and explains each score (exact tree SHAP values, computed by XGBoost itself)."""

    def __init__(self, export_dir: str | Path = MODEL_DIR):
        import xgboost

        export_dir = Path(export_dir)
        self.meta = json.loads((export_dir / "model_meta.json").read_text(encoding="utf-8"))
        self.features: list[str] = self.meta["features"]
        self.booster = xgboost.Booster()
        self.booster.load_model(export_dir / "model.json")
        self._xgboost = xgboost
        # Prior correction: the calibration matches how often the training companies failed; `local_prior` (an official
        # local bad-loan rate) moves every percentage to that rate. Monotonic, so rankings and alerts do not change.
        prior = self.meta.get("local_prior")
        logit = lambda p: np.log(p / (1 - p))  # noqa: E731
        self.prior_shift = float(logit(prior["rate"]) - logit(prior["training_rate"])) if prior else 0.0
        self.alert_threshold = float(self._shift(np.array(self.meta["alert_threshold"])))

    def _shift(self, p: np.ndarray) -> np.ndarray:
        return 1 / (1 + np.exp(-(np.log(p / (1 - p)) + self.prior_shift)))

    def _matrix(self, rows: list[dict]):
        values = np.array([[np.nan if r.get(f) is None else float(r[f]) for f in self.features] for r in rows], dtype=float)
        return self._xgboost.DMatrix(values, feature_names=self.features, missing=np.nan)

    def probability(self, rows: list[dict]) -> np.ndarray:
        raw = np.clip(self.booster.predict(self._matrix(rows)), 1e-6, 1 - 1e-6)
        c = self.meta["calibration"]
        return 1 / (1 + np.exp(-(c["slope"] * np.log(raw / (1 - raw)) + c["intercept"] + self.prior_shift)))

    def band(self, p: float) -> str:
        bands = self.meta["risk_bands"]
        return "high" if p > bands["high"] else "moderate" if p >= bands["low"] else "low"

    def score(self, rows: list[dict], top: int = 5, notes: dict[str, str] | None = None) -> list[dict]:
        """One result per row: probability, band, alert flag and the top drivers in plain words.
        `notes` maps a feature to what to show instead of its number (why it is missing or was substituted)."""
        probabilities = self.probability(rows)
        contributions = self.booster.predict(self._matrix(rows), pred_contribs=True)[:, :-1]  # last column is the bias
        out = []
        for row, p, contrib in zip(rows, probabilities, contributions):
            drivers = []
            for i in np.argsort(-np.abs(contrib))[:top]:
                name, value = self.features[i], row.get(self.features[i])
                if (notes or {}).get(name):
                    text = notes[name]
                elif value is None:
                    text = self.meta["missing_text"].get(name, "not available")
                else:
                    text = f"{value:.2f}"
                drivers.append({"feature": name, "label": self.meta["labels"].get(name, name), "value": value,
                                "value_text": text, "direction": "raises risk" if contrib[i] > 0 else "lowers risk",
                                "contribution": float(contrib[i])})
            out.append({"probability": float(p), "risk_class": self.band(float(p)),
                        "alert": bool(p >= self.alert_threshold), "top_drivers": drivers,
                        "model_version": self.meta["model_version"]})
        return out


@lru_cache(maxsize=1)
def default_model() -> RiskModel:
    return RiskModel()
