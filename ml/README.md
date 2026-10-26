# FINEXT ML: Layer 2 (future financial risk)

Implements the training side of the AI pipeline spec, Stage C: four candidate models (XGBoost, Logistic Regression,
Random Forest, LightGBM), grouped cross-validation, a time holdout, PR-AUC selection with calibration and segment checks,
SHAP explanations for every candidate, and a model card.

Two datasets:

- **FINEXT synthetic MSMEs** (`--data synthetic`, the default): simulated grocery stores, bakeries, service
  businesses and traders, recorded as ordinary FINEXT entries and run through the backend's own posting rules and
  Stage A snapshots (`backend/app/snapshots.py`), labelled with the spec's `stress_3m`. **Synthetic**: say so wherever
  results are shown, and describe predictions as *likely deterioration*.
- **US Company Bankruptcy Prediction** (`--data us`): a research baseline on real accounts. It proved the pipeline;
  it does **not** produce a model for scoring FINEXT businesses.

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
.venv/Scripts/python -m finext_ml.train_and_compare --data synthetic          # simulates 400 businesses on first use (~5 min, cached in data/synthetic/)
.venv/Scripts/python -m finext_ml.train_and_compare --data us                 # US baseline (~10 min)
.venv/Scripts/python -m finext_ml.train_and_compare --data synthetic --quick  # smoke test
.venv/Scripts/python -m pytest tests
```

Each run writes `artifacts/<dataset>/<run id>/`: `model_card.md`, `metrics.json` (everything, including
calibration bins and example predictions in the spec's C6 format) and `model.joblib` (the winner with its calibrator).

## What the code does

```
ml/finext_ml/
  data/                         where the training data comes from
    sme_simulator.py            simulates Cambodian MSMEs as FINEXT entries, runs them through the backend snapshots,
                                builds the stress_3m label (spec C3, C4)
    finext_dataset.py           FINEXT training set: rows from month 6, splits by business and by time (C1, C5)
    us_bankruptcy_dataset.py    loads the US CSV, restores lost decimal points, names X1-X18, builds its label
    dataset_definition.py       what training needs to know about any dataset (features, splits, segments, card text)
  preprocessing/                turning data into model inputs
    finext_features.py          ratios, shares, streaks and 3-month trends from the snapshots; Layer 1 features (A2, A3)
    us_bankruptcy_features.py   ratios, year-on-year changes, volatility and streaks for the US data
  models/
    candidate_models.py         the four candidates, tuning spaces, monotonic constraints, LR imputation and scaling,
                                Platt calibration (C5, C5b)
  evaluation/
    evaluation_metrics.py       PR-AUC, ROC-AUC, calibration, threshold metrics, risk bands, segments (C5)
    shap_explanations.py        SHAP for all four models in one format; top-5 drivers in plain words (C5b, C6)
    model_card.py               the model card
  train_and_compare.py          runs it all: Layer 1 test, tuning, selection rule, holdouts, artifacts (C5, C5b)
```

**Preprocessing, step by step (FINEXT):**

1. `backend/app/snapshots.py` (Stage A, in the backend because the live app uses it too, and the simulator imports
   that same code so training and real data are computed identically): turns entries into monthly figures, skips
   months whose books do not balance, leaves missing values as None with a reason, never 0.
2. `preprocessing/finext_features.py`: makes businesses of any size comparable (amounts become ratios and shares)
   and adds 3-month trends.
3. `data/finext_dataset.py`: keeps rows from month 6 that have a label, holds out 20% of businesses, splits the rest
   by time with 3-month gaps.
4. `models/candidate_models.py`: Logistic Regression alone needs median imputation, missing-value flags and
   rank-based scaling; the tree models take missing and extreme values as they are.

## The US dataset needs correcting

Checked against accounting identities in `tests/test_us_dataset.py`:

1. **Lost decimal points.** About 65% of cells were written without their decimal point (`511.267` → `511267`), so values
   jump 1000× between a company's years. Cells with no decimal point are divided by 1000; afterwards revenue − COGS =
   gross profit and EBITDA − D&A = EBIT hold in 99.99% of rows.
2. **Column meanings.** X1–X18 do not follow the order in the paper. The mapping in `us_bankruptcy_dataset.COLUMNS` comes from the
   identities and from inequalities that hold in every row (e.g. total assets ≥ current assets).
3. **The label.** `status_label` is "failed" on every year of a company that later went bankrupt, up to 19 years earlier.
   Training on it row by row would leak the future. The target is `fails_next_year`: only a failed company's last
   reported year (609 of 78,682 rows).

## The synthetic data

`sme_simulator.py` simulates each business day by day: sales with seasons (Khmer New Year, Pchum Ben, rainy season) and
noise, credit customers with payment terms, weekly restocking with supplier credit, rent, wages, utilities, transport,
tax, owner drawings and loans with real schedules. Bills are paid only when there is cash; otherwise they are recorded
as unpaid, restocking shrinks and instalments fall into arrears. About half the businesses get one or two problems
(falling demand, supplier price rise, late or defaulting customers, over-borrowing, a large equipment purchase,
rising drawings), and records are imperfect (late entries, duplicates mostly reversed, sales without a cost).

`stress_3m` (spec C3) for month t uses months t+1..t+3 only: cash runway under two weeks in any of them, operating
cash flow negative in all three, or DSCR ≤ 1.0 over them. Rows start at month 6 (spec C1).

## Next steps toward the spec

1. **Serving (C6)**: score at month-end close from `GET /accounting/snapshots`, store predictions and SHAP drivers,
   show them on the dashboard; low-confidence flag for gaps and estimated records.
2. **Real outcomes**: replace or blend the synthetic labels with missed or late repayments, restructuring and
   closures from partner banks; retrain and monitor drift (C7).
