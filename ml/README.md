# FINEXT ML: Layer 2 (future financial risk)

Implements the training side of the AI pipeline spec, Stage C: four candidate models (XGBoost, Logistic Regression,
Random Forest, LightGBM), grouped cross-validation, a time holdout, PR-AUC selection with calibration and segment checks,
SHAP explanations for every candidate, and a model card.

The first dataset is the **US Company Bankruptcy Prediction** data. It proves the pipeline end to end; it does **not**
produce a model for scoring FINEXT businesses (see *Limitations* in the generated model card).

## Setup

Python 3.11 (ML libraries publish wheels for it reliably; on this machine Windows Smart App Control blocked pandas 3.1, so pandas is pinned to 2.3.3).

```sh
cd ml
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

Data (not in git): download `american_bankruptcy_dataset.csv` from https://github.com/sowide/bankruptcy_dataset
(CC BY 4.0) to `ml/data/raw/us_bankruptcy/`.

## Run

```sh
.venv/Scripts/python -m finext_ml.train --quick   # ~1 min smoke test
.venv/Scripts/python -m finext_ml.train           # full run, ~15-30 min
.venv/Scripts/python -m pytest tests
```

Each run writes `artifacts/us_bankruptcy/<run id>/`: `model_card.md`, `metrics.json` (everything, including
calibration bins and example predictions in the spec's C6 format) and `model.joblib` (the winner with its calibrator).

## What the code does

| File | Spec | Purpose |
|---|---|---|
| `finext_ml/us_dataset.py` | C4/C5 data | Loads the CSV, restores lost decimal points, names the X1–X18 columns, builds the label |
| `finext_ml/features.py` | A2, A3 | Ratios, period-on-period changes, volatility and streaks, from the current and earlier periods only |
| `finext_ml/models.py` | C5, C5b | The four candidates, their tuning spaces, monotonic constraints, Platt calibration |
| `finext_ml/evaluate.py` | C5 | PR-AUC, ROC-AUC, calibration error and curve, threshold metrics, risk bands, segments |
| `finext_ml/explain.py` | C5b, C6 | SHAP for all four models in one format; top-5 drivers with business-friendly labels |
| `finext_ml/train.py` | C5, C5b | Splits, tuning, selection rule, holdout scoring, artifacts |
| `finext_ml/model_card.py` | C5b | The model card |

## The US dataset needs correcting

Checked against accounting identities in `tests/test_us_dataset.py`:

1. **Lost decimal points.** About 65% of cells were written without their decimal point (`511.267` → `511267`), so values
   jump 1000× between a company's years. Cells with no decimal point are divided by 1000; afterwards revenue − COGS =
   gross profit and EBITDA − D&A = EBIT hold in 99.99% of rows.
2. **Column meanings.** X1–X18 do not follow the order in the paper. The mapping in `us_dataset.COLUMNS` comes from the
   identities and from inequalities that hold in every row (e.g. total assets ≥ current assets).
3. **The label.** `status_label` is "failed" on every year of a company that later went bankrupt, up to 19 years earlier.
   Training on it row by row would leak the future. The target is `fails_next_year`: only a failed company's last
   reported year (609 of 78,682 rows).

## Next steps toward the spec

1. **Stage A snapshots from the FINEXT ledger**: monthly feature snapshots built by the backend's own statement code,
   with missing-value reason codes and `data_source` tags.
2. **Synthetic MSMEs (C4)** run through the real posting rules, giving monthly data with cash, OCF and DSCR, so the
   `stress_3m` label can be built; retrain with this same harness, with and without Layer 1 features.
3. **Serving (C6)**: score at month-end close, store predictions and SHAP drivers, show them on the dashboard.
