"""Export a trained winner for the backend, and the code that scores with it (spec C6).

    python -m finext_ml.export_model artifacts/polish_bankruptcy/<run id>

Writes `<run>/export/model.json` (the XGBoost trees, in XGBoost's own portable format) and `<run>/export/model_meta.json`
(feature order, plain labels, calibration, alert threshold, risk bands, version, headline results). The backend
needs only `xgboost` and `numpy` to use them: no pickles, no training code. The scorer that uses them lives in the
backend (`backend/app/risk_model.py`) and is imported here for checks; copy the two files to
`backend/app/risk_model_files/` to deploy.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))
from app.risk_model import RiskModel  # noqa: E402,F401  (the backend's scorer)

from finext_ml.evaluation.evaluation_metrics import RISK_BANDS  # noqa: E402

# Where FINEXT is used, how common bad outcomes are: the published non-performing loan ratio of Cambodia's commercial
# banks at end-2025 (loans 90+ days overdue, share of the loan book). An official figure, not an estimate of ours. The
# model learned where about 7% of companies failed; the backend moves its percentages to this rate (prior correction:
# the order of businesses and who is flagged stay the same). Update it when the NBC publishes a new report.
LOCAL_PRIOR = {
    "rate": 0.083,
    "what": "Non-performing loan ratio, commercial banks, Cambodia, end-2025",
    "source": "National Bank of Cambodia, Annual Supervision Report 2025",
    "url": "https://www.nbc.gov.kh/download_files/supervision/sup_an_rep_eng/EN%20Annual%20Supervision%20Report%202025.pdf",
}


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
        # The calibration matches the training companies' failure rate; this moves it to the local rate (see LOCAL_PRIOR).
        "local_prior": LOCAL_PRIOR | {"training_rate": float(data.parts["train"][data.target].mean())},
        # The 1st and 99th percentiles of each input in training. In the training data a missing value usually meant
        # trouble (e.g. no sales last year: 96% bankrupt), so the backend does not send "missing" where FINEXT knows
        # the gap is harmless (no bills owed, no interest paid): it sends the healthy end of this range instead.
        "range": {f: {"low": float(data.parts["train"][f].quantile(0.01)), "high": float(data.parts["train"][f].quantile(0.99))}
                  for f in trained.features},
        "results": {name: {k: h[k] for k in ("pr_auc", "roc_auc", "calibration_error")} | {"recall": h["at_alert_threshold"]["recall"],
                                                                                          "precision": h["at_alert_threshold"]["precision"]}
                    for name, h in report["holdout"].items()},
        "card": data.card["warning"],
    }
    (out / "model_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(export(sys.argv[1]))
