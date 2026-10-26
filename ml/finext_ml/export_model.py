"""Export a trained winner for the backend, and the code that scores with it (spec C6).

    python -m finext_ml.export_model artifacts/polish_bankruptcy/<run id>

Writes `<run>/export/model.json` (the XGBoost trees, in XGBoost's own portable format) and `<run>/export/model_meta.json`
(feature order, plain labels, calibration, alert threshold, risk bands, version, headline results). The backend
needs only `xgboost` and `numpy` to use them: no pickles, no training code. `RiskModel` below is that scorer.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

RISK_BANDS = {"low": 0.30, "high": 0.60}  # spec C5 proposal: low < 0.30 <= moderate <= 0.60 < high


def export(run_dir: str | Path) -> Path:
    import joblib

    run_dir = Path(run_dir)
    report = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    trained = joblib.load(run_dir / "model.joblib")
    if trained.name != "xgboost":
        raise SystemExit(f"winner is {trained.name}; only XGBoost is exported for serving")
    out = run_dir / "export"
    out.mkdir(exist_ok=True)
    trained.model.get_booster().save_model(out / "model.json")
    platt = trained.calibrator.model
    from finext_ml.train_and_compare import load
    data = load({"polish_bankruptcy": "polish", "us_bankruptcy": "us"}[report["dataset"]])
    meta = {
        "model_version": report["model_version"], "dataset": report["dataset"], "target": report["target"],
        "features": trained.features,
        "labels": {f: data.labels.get(f, f) for f in trained.features},
        "missing_text": {f: t for f, t in data.missing_text.items() if f in trained.features},
        "calibration": {"slope": float(platt.coef_[0][0]), "intercept": float(platt.intercept_[0])},
        "alert_threshold": report["alert_threshold"], "risk_bands": RISK_BANDS,
        "results": {name: {k: h[k] for k in ("pr_auc", "roc_auc", "calibration_error")} | {"recall": h["at_alert_threshold"]["recall"],
                                                                                          "precision": h["at_alert_threshold"]["precision"]}
                    for name, h in report["holdout"].items()},
        "card": data.card["warning"],
    }
    (out / "model_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


class RiskModel:
    """Scores rows of features with an exported model and explains each score (exact tree SHAP from XGBoost itself)."""

    def __init__(self, export_dir: str | Path):
        import xgboost

        export_dir = Path(export_dir)
        self.meta = json.loads((export_dir / "model_meta.json").read_text(encoding="utf-8"))
        self.features: list[str] = self.meta["features"]
        self.booster = xgboost.Booster()
        self.booster.load_model(export_dir / "model.json")
        self._xgboost = xgboost

    def _matrix(self, rows: list[dict]) -> "xgboost.DMatrix":
        values = np.array([[np.nan if r.get(f) is None else float(r[f]) for f in self.features] for r in rows], dtype=float)
        return self._xgboost.DMatrix(values, feature_names=self.features, missing=np.nan)

    def probability(self, rows: list[dict]) -> np.ndarray:
        raw = np.clip(self.booster.predict(self._matrix(rows)), 1e-6, 1 - 1e-6)
        c = self.meta["calibration"]
        return 1 / (1 + np.exp(-(c["slope"] * np.log(raw / (1 - raw)) + c["intercept"])))

    def band(self, p: float) -> str:
        bands = self.meta["risk_bands"]
        return "high" if p > bands["high"] else "moderate" if p >= bands["low"] else "low"

    def score(self, rows: list[dict], top: int = 5) -> list[dict]:
        """One result per row: probability, band, alert flag and the top drivers in plain words."""
        probabilities = self.probability(rows)
        contributions = self.booster.predict(self._matrix(rows), pred_contribs=True)[:, :-1]  # last column is the bias
        out = []
        for row, p, contrib in zip(rows, probabilities, contributions):
            order = np.argsort(-np.abs(contrib))[:top]
            drivers = []
            for i in order:
                name, value = self.features[i], row.get(self.features[i])
                drivers.append({
                    "feature": name, "label": self.meta["labels"].get(name, name),
                    "value": value, "value_text": self.meta["missing_text"].get(name, "not available") if value is None else f"{value:.2f}",
                    "direction": "raises risk" if contrib[i] > 0 else "lowers risk", "contribution": float(contrib[i]),
                })
            out.append({"probability": float(p), "risk_class": self.band(float(p)),
                        "alert": bool(p >= self.meta["alert_threshold"]), "top_drivers": drivers,
                        "model_version": self.meta["model_version"]})
        return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(export(sys.argv[1]))
