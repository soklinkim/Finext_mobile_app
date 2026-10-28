# FINEXT ML: Layer 2 (future financial risk)

Implements the training side of the AI pipeline spec, Stage C: four candidate models (XGBoost, Logistic Regression,
Random Forest, LightGBM), grouped cross-validation, holdouts, PR-AUC selection with calibration and segment checks,
SHAP explanations for every candidate, and a model card.

**Only real data is used.** Nothing is simulated or generated. Three public datasets of real company accounts with
real bankruptcy outcomes; the Polish one gives the deployed model, the other two are evidence:

- **Polish companies bankruptcy** (`--data polish`; UCI 365, CC BY 4.0; Tomczak, Zięba et al. 2016): about 5,900
  companies, ratios from their last reported year, bankrupt within one year or not. Only the 23 ratios FINEXT can
  also compute from an MSME's books are inputs.
- **US Company Bankruptcy Prediction** (`--data us`, the default; sowide/bankruptcy_dataset, CC BY 4.0; Lombardo et
  al. 2022): about 78,700 company-years of US listed companies, 1999–2018, bankrupt within one year or not. Has years,
  so it also gets a time holdout.
- **Taiwanese bankruptcy** (`--data taiwan`; UCI 572, CC BY 4.0; Liang et al. 2016): 6,819 listed companies,
  1999–2009, 94 ratios. A **benchmark only**: the publisher rescaled the ratios to 0–1, so they are not in units
  FINEXT computes and cannot be compared with the other two datasets.

All are larger companies in other economies than Cambodian MSMEs: describe output as *likely deterioration*, never
as a prediction of loan default.

## Setup

Python 3.11 (ML libraries publish wheels for it reliably; on this machine Windows Smart App Control blocked pandas 3.1, so pandas is pinned to 2.3.3).

```sh
cd ml
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

Data (not in git):

- `american_bankruptcy_dataset.csv` from https://github.com/sowide/bankruptcy_dataset to `ml/data/raw/us_bankruptcy/`.
- The zip from https://archive.ics.uci.edu/dataset/365, unpacked to `ml/data/raw/polish_bankruptcy/` (`5year.arff` is used).
- The zip from https://archive.ics.uci.edu/dataset/572, unpacked to `ml/data/raw/taiwan_bankruptcy/` (`data.csv`).

## Run

```sh
.venv/Scripts/python -m finext_ml.train_and_compare --data polish          # ~10 min
.venv/Scripts/python -m finext_ml.train_and_compare --data us              # ~40 min
.venv/Scripts/python -m finext_ml.train_and_compare --data taiwan          # benchmark, ~5 min
.venv/Scripts/python -m finext_ml.train_and_compare --data polish --quick  # smoke test
.venv/Scripts/python -m finext_ml.transfer_test                            # train in one country, score the other (~20 min)
.venv/Scripts/python -m finext_ml.export_model artifacts/<dataset>/<run id> # model for the backend
.venv/Scripts/python -m pytest tests
```

Each run writes `artifacts/<dataset>/<run id>/`: `model_card.md`, `metrics.json` (everything, including
calibration bins and example predictions in the spec's C6 format) and `model.joblib` (the winner with its calibrator).

## What the code does

```
ml/finext_ml/
  data/                           where the training data comes from
    polish_bankruptcy_dataset.py  reads the ARFF file, names the ratios, checks their meanings, drops duplicates, splits
    us_bankruptcy_dataset.py      loads the US CSV, restores lost decimal points, names X1-X18, builds its label
    dataset_definition.py         what training needs to know about any dataset (features, splits, segments, baselines,
                                  card text); Altman's Z-score baseline
  preprocessing/                  turning data into model inputs
    us_bankruptcy_features.py     ratios, year-on-year changes, volatility and streaks for the US data
  models/
    candidate_models.py           the four candidates, tuning spaces, early stopping, monotonic constraints,
                                  LR imputation and scaling, Platt calibration (C5, C5b)
  evaluation/
    evaluation_metrics.py         PR-AUC, ROC-AUC, calibration, threshold metrics, risk bands, segments,
                                  bootstrap intervals (C5)
    shap_explanations.py          SHAP for all four models in one format; top-5 drivers in plain words (C5b, C6)
    model_card.py                 the model card
  train_and_compare.py            runs it all: tuning, selection rule, holdouts, checks, artifacts (C5, C5b)
  transfer_test.py                trains XGBoost in one country and scores the other, against Altman's formula
  export_model.py                 writes the winner as portable XGBoost JSON + metadata; RiskModel scores and
                                  explains with only xgboost and numpy (C6)
```

**Preprocessing, step by step:**

1. Load and correct (`data/`): fix known errors in the source files, check column meanings against accounting
   identities, build a label that does not leak the future, drop exact duplicates.
2. Features (`preprocessing/` for the US data; the Polish file already holds ratios): ratios whose denominator is
   zero or negative are left missing, never 0. Size is a reporting segment, not an input.
3. Splits: companies held out entirely, and for the US data a later period too.
4. `models/candidate_models.py`: Logistic Regression alone needs median imputation, missing-value flags and
   rank-based scaling; the tree models take missing and extreme values as they are.

## The US dataset needs correcting

Checked against accounting identities in `tests/test_us_bankruptcy_dataset.py`:

1. **Lost decimal points.** About 65% of cells were written without their decimal point (`511.267` → `511267`), so values
   jump 1000× between a company's years. Cells with no decimal point are divided by 1000; afterwards revenue − COGS =
   gross profit and EBITDA − D&A = EBIT hold in 99.99% of rows.
2. **Column meanings.** X1–X18 do not follow the order in the paper. The mapping in `us_bankruptcy_dataset.COLUMNS` comes from the
   identities and from inequalities that hold in every row (e.g. total assets ≥ current assets).
3. **The label.** `status_label` is "failed" on every year of a company that later went bankrupt, up to 19 years earlier.
   Training on it row by row would leak the future. The target is `fails_next_year`: only a failed company's last
   reported year (609 of 78,682 rows).

## The Polish dataset

`5year.arff` is used: ratios from a company's last year of reports, labelled bankrupt within one year (the same
horizon as the US data). The other four files look further ahead and repeat the same companies, so mixing them would
put one company in both training and test. Attribute meanings are checked in `tests/test_polish_bankruptcy_dataset.py`
(e.g. assets/liabilities = 1/(liabilities/assets) and sales/receivables = 365/receivable days hold in 99.98% of rows).
60 exact duplicate rows are dropped. The file has no years, so there is no time holdout. In Polish accounting
"gross profit" (*zysk brutto*) is profit **before tax**, so X19 is the pre-tax margin, not a gross margin.

## The Taiwanese dataset (benchmark)

6,819 companies, 220 bankrupt (3.2%), no duplicates or missing values; debt ratio + net worth/assets = 1 in every
row. The constant "Net Income Flag" is dropped. The publisher rescaled the ratios to 0–1: in 16 columns otherwise on
that scale, 578 values up to 1e10 are impossible and become missing; 8 columns mostly above 1 were never rescaled and
are kept as they are (trees use only the order; Logistic Regression ranks first). No company ids or years: 60/20/20
split like the Polish data. Altman's formula cannot be applied to rescaled ratios, so the baselines are single-ratio
rules.

## Three-dataset benchmark: why XGBoost

Same pipeline, tuning budget (30 configurations, 5-fold grouped CV) and selection rule, fixed before the results:

| Dataset | XGBoost | Logistic Regression | Random Forest | LightGBM | Kept |
|---|---:|---:|---:|---:|---|
| **Poland** (deployed) | **0.635** | 0.587 | 0.527 | 0.605 | XGBoost: clearly best |
| US | 0.077 | 0.045 | 0.081 | 0.061 | XGBoost: Random Forest +0.004, below the 0.02 margin |
| Taiwan | 0.391 | 0.402 | 0.398 | 0.433 | XGBoost: LightGBM +0.041 and steadier across folds, but worse on its weakest size group (0.199 vs 0.269) |

CV PR-AUC. Gradient boosting (XGBoost or LightGBM) is at or near the top on every dataset, and XGBoost is clearly
best on the one closest to FINEXT's use. Where a challenger scored higher, the gain was within noise (fold spread
±0.02–0.09) or came with a weaker result for one group of companies, which the rule does not allow. On Taiwan's
1,364 unseen companies XGBoost scores PR-AUC 0.414, ROC-AUC 0.923, and catches 82% of bankruptcies, against 0.310 for
the best single-ratio rule. XGBoost was not tuned further to win the benchmark: that would be fitting the test to
the answer. What else decides for it: native missing values, monotonic (finance-direction) constraints, and exact
SHAP explanations, which the app shows as reasons.

## Transfer test

FINEXT will score Cambodian MSMEs, which neither dataset contains. `transfer_test.py` reduces both datasets to the
same 15 ratios (Polish definitions, computed from the US amounts), trains XGBoost on one country and scores the
other with the threshold unchanged, next to a model trained on the target country itself and Altman's Z' score.
Compare ROC-AUC: unlike PR-AUC it does not depend on how common bankruptcy is in each country.

## Overfitting, underfitting and trust checks

Every run reports these in the model card:

| Check | What it guards against | How |
|---|---|---|
| Train vs CV gap per model | memorising training companies | each model scored on the rows it was fitted on and on unseen companies |
| One-standard-error rule | picking a lucky, over-complex configuration | among configurations within one standard error of the best CV PR-AUC, the one with the smallest gap |
| Early stopping (XGBoost, LightGBM) | too many trees | trees are added until PR-AUC stops improving on training companies held back for it |
| Shallow trees, large leaves, L2, monotonic constraints | fitting noise; explanations that contradict finance | built into the tuning spaces and model setup |
| Alert threshold from unseen companies | recall dropping on new customers | the lower of the thresholds reaching 85% recall on validation and on out-of-fold scores |
| Learning curve | telling underfitting from overfitting | CV and train PR-AUC at 25–100% of training companies |
| Bootstrap intervals, seed spread | trusting one lucky number | 95% intervals resampling whole companies; the winner refitted with 5 seeds |
| Simple-rule baselines | a model that adds nothing | Altman's Z-score (the textbook bankruptcy formula) and "loss-making this year" |
| Transfer test | a model that only works where it was trained | train in Poland, score the US, and the other way round |
| Behaviour test on FINEXT books | nonsense answers in the app | 18 hand-written MSME profiles run through the real backend pipeline (`backend/tests/test_risk_behaviour.py`) |

**Finance-direction constraints.** Profitability, liquidity and debt ratios, plus receivable days and short-term
bills in days of cost of goods, can only move risk in the direction finance expects. Adding the two "days" constraints
raised CV PR-AUC (0.630 → 0.635) and narrowed the gap (0.096 → 0.093). Inventory days and sales-to-assets were tried
too and left out: each cost accuracy on unseen companies (sales-to-assets: 0.635 → 0.616).

**Cambodian failure rate (prior correction).** The calibration matches the training companies (6.95% failed). The
backend moves every percentage to Cambodia's published rate: the commercial banks' non-performing loan ratio at
end-2025, 8.3% (National Bank of Cambodia, Annual Supervision Report 2025; `LOCAL_PRIOR` in `export_model.py`). Odds
are multiplied by 1.21 (10% becomes 11.9%). Rankings and alerts do not change, and it is not a test on Cambodian
businesses: no public data links Cambodian MSME accounts to loan outcomes. The ratio is a share of loan value, not of
borrowers, so it approximates how often businesses fail.

**Risk levels:** low < 10% ≤ moderate ≤ 30% < high, chosen on validation companies for the 7% failure rate (about 1%,
16% and 74% of each level failed; the company holdout confirmed 2%, 14%, 67%).

**Behaviour test findings** (all fixed, and now tests): recorded assets below zero flipped the sign of every ratio over
assets; the part of long-term loans due within a year was not a short-term debt; a loss-making business with no debt
read "no interest paid"; missed instalments were not detected. **Known limitation:** the model weighs late customers
lightly, and busy shops (high sales relative to assets) lose a little; the debt capacity check names late customers
and suppliers instead.

## Next steps toward the spec

1. **Serving (C6)**: `backend/app/risk_features.py` already computes the same 23 ratios from a FINEXT business's
   last 12 months of books (Polish definitions; `tests/test_backend_bridge.py` keeps the feature lists identical).
   Still to do: a scoring endpoint with `RiskModel`, stored monthly predictions, and the dashboard card.
2. **Real FINEXT outcomes**: once partner banks share missed or late repayments, restructuring and closures, train on
   FINEXT's own monthly snapshots (`backend/app/snapshots.py`) with the spec's `stress_3m` label; monitor drift (C7).
