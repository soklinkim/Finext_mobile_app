import json

import numpy as np
import pandas as pd

from finext_ml.export_model import RiskModel
from finext_ml.models.candidate_models import CANDIDATES, PlattCalibrator, TrainedModel


def test_exported_model_scores_like_the_trained_one(tmp_path):
    rng = np.random.default_rng(0)
    X = pd.DataFrame({"a": rng.normal(size=400), "b": rng.normal(size=400)})
    X.loc[::7, "b"] = np.nan
    y = (X["a"] + rng.normal(0, 0.5, 400) > 1).astype(int).to_numpy()
    xgb = next(c for c in CANDIDATES if c.name == "xgboost")
    model = xgb.make({"n_estimators": 30, "max_depth": 2}, 3.0, 0, ["a", "b"], {"a": 1}).fit(X, y)
    calibrator = PlattCalibrator().fit(model.predict_proba(X)[:, 1], y)
    trained = TrainedModel("xgboost", "test", model, calibrator, ["a", "b"])

    model.get_booster().save_model(tmp_path / "model.json")
    (tmp_path / "model_meta.json").write_text(json.dumps({
        "model_version": "test", "features": ["a", "b"], "labels": {"a": "Ratio A"}, "missing_text": {"b": "no data"},
        "calibration": {"slope": float(calibrator.model.coef_[0][0]), "intercept": float(calibrator.model.intercept_[0])},
        "alert_threshold": 0.5, "risk_bands": {"low": 0.3, "high": 0.6}}))
    risk = RiskModel(tmp_path)
    records = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in X.to_dict("records")]
    assert np.abs(risk.probability(records) - trained.predict(X)).max() < 1e-6

    result = risk.score([{"a": 2.5, "b": None}])[0]
    assert result["risk_class"] in {"low", "moderate", "high"} and result["alert"] == (result["probability"] >= 0.5)
    drivers = {d["feature"]: d for d in result["top_drivers"]}
    assert drivers["a"]["label"] == "Ratio A" and drivers["a"]["direction"] == "raises risk"
    assert drivers["b"]["value_text"] == "no data"
