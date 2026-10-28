# Model card: polish_bankruptcy-xgboost-20261027-162955

> **Real data, different businesses.** Annual accounts of Polish manufacturing companies (2000–2013) and whether they went bankrupt within a year. FINEXT computes the same ratios from an MSME's books, but Cambodian MSMEs are smaller and differently financed: describe output as *likely deterioration*, never as a prediction of loan default.

## Data
- Polish companies bankruptcy data (UCI 365, CC BY 4.0; Tomczak, Zięba et al. 2016), `5year.arff`: 5,850 companies after dropping 60 exact duplicate rows.
- Attribute meanings checked against ratios built from the same figures: assets/liabilities = 1/(liabilities/assets) 99.98%, working capital/assets = (current ratio - 1) × short-term bills/assets 99.98%, sales/receivables = 365/receivable days 99.98%, sales/inventory = 365/inventory days 99.98%.
- **Target** `bankrupt_next_year`: 408 bankrupt within a year (7.0%).
- 23 of the 64 ratios are used: those FINEXT can also compute from a shop's books.
- Source file SHA-256 `cb3f6f250ac46bd8…`.

| Split | Rows | Businesses | Positives |
|---|---:|---:|---:|
| train | 3,510 | 3,510 | 244 |
| validation | 1,170 | 1,170 | 82 |
| company holdout | 1,170 | 1,170 | 82 |

Companies split 60 / 20 / 20 into train (grouped CV inside), validation and a company holdout, each stratified by outcome. The data has no years, so there is no time holdout.

## Candidates (5-fold grouped CV, up to 30 configurations each)

| Model | CV PR-AUC (mean ± sd) | CV ROC-AUC | Train PR-AUC / ROC-AUC | Validation PR-AUC | Validation calibration error | Worst segment PR-AUC |
|---|---|---:|---:|---:|---:|---:|
| XGBoost **(winner)** | 0.635 ± 0.032 | 0.898 | 0.745 / 0.956 | 0.750 | 0.0252 | 0.607 |
| Logistic Regression | 0.587 ± 0.016 | 0.889 | 0.610 / 0.911 | 0.609 | 0.0144 | 0.553 |
| Random Forest | 0.527 ± 0.036 | 0.896 | 0.650 / 0.953 | 0.664 | 0.0222 | 0.482 |
| LightGBM | 0.602 ± 0.035 | 0.895 | 0.665 / 0.938 | 0.716 | 0.0206 | 0.558 |

Positives are 7.0% of rows, so a random model scores PR-AUC ≈ 0.070. Probabilities are Platt-calibrated on out-of-fold scores. The train column scores each model on the rows it was fitted on: a large gap to CV means it memorises training cases.

Against overfitting: each configuration is chosen by the one-standard-error rule (among those within one standard error of the best CV PR-AUC, the one with the smallest train-vs-CV gap); boosted models stop adding trees when PR-AUC stops improving on training businesses held back for that purpose; trees are shallow with large minimum leaf sizes and L2 penalties; risk ratios have monotonic constraints.

| Model | Best configuration: CV / gap | Chosen: CV / gap | Trees |
|---|---:|---:|---:|
| XGBoost | 0.635 / 0.093 | 0.635 / 0.093 | 234 |
| Logistic Regression | 0.590 / 0.026 | 0.587 / 0.025 | — |
| Random Forest | 0.527 / 0.112 | 0.527 / 0.112 | — |
| LightGBM | 0.618 / 0.113 | 0.602 / 0.060 | 366 |

## Selection
XGBoost is the champion. A challenger replaces it only if it gains ≥ 0.02 CV PR-AUC on average, wins in ≥ 4 of 5 folds, and its calibration error and worst-segment PR-AUC are no worse.

| Challenger | PR-AUC gain | Folds won | Margin | Consistent | Calibration | Segments | Replaces |
|---|---:|---:|:-:|:-:|:-:|:-:|:-:|
| Logistic Regression | -0.048 | 1 | ✗ | ✗ | ✓ | ✗ | ✗ |
| Random Forest | -0.108 | 0 | ✗ | ✗ | ✓ | ✗ | ✗ |
| LightGBM | -0.033 | 0 | ✗ | ✗ | ✓ | ✗ | ✗ |

**Winner: XGBoost.**

## Winner on the holdouts (scored once, after selection)

Alert threshold 0.0476: the lower of the thresholds that catch ≥ 85% of positives on validation (0.0903) and on out-of-fold scores for businesses the model had not seen (0.0476), so it also holds for new businesses.

| Holdout | PR-AUC | ROC-AUC | Brier | Calibration error | Precision | Recall | F1 | Accuracy | Recall at precision ≥ 20% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| company holdout (82 positives in 1,170) | 0.667 | 0.930 | 0.0379 | 0.0104 | 0.231 | 0.915 | 0.369 | 0.781 | 0.927 |

Company holdout at the alert threshold: 75 caught, 7 missed, 249 false alarms, 839 correctly left alone.

Company holdout risk bands (spec proposal: low < 0.30 ≤ moderate ≤ 0.60 < high): low 1,097 rows, 0.03 observed; moderate 43 rows, 0.56 observed; high 30 rows, 0.83 observed.

95% intervals (bootstrap over businesses, 500 draws) and the spread over 5 training seeds:

| Holdout | PR-AUC | Precision | Recall | PR-AUC across seeds |
|---|---|---|---|---|
| company holdout | 0.557–0.753 | 0.185–0.280 | 0.854–0.969 | 0.648–0.667 |

## Does the model beat simple rules?

| Holdout | Method | PR-AUC | Precision | Recall |
|---|---|---:|---:|---:|
| company holdout | **XGBoost** | 0.667 | 0.231 | 0.915 |
| | Altman Z'-score (textbook bankruptcy formula) | 0.243 | 0.224 | 0.439 |
| | Loss-making this year | 0.160 | 0.214 | 0.622 |

## Learning curve (winner, same settings, growing share of training businesses)

| Training businesses per fold | CV PR-AUC | Train PR-AUC | Gap |
|---:|---:|---:|---:|
| 702 (25%) | 0.516 | 0.751 | 0.235 |
| 1404 (50%) | 0.603 | 0.762 | 0.159 |
| 2106 (75%) | 0.631 | 0.750 | 0.119 |
| 2808 (100%) | 0.649 | 0.746 | 0.097 |

CV PR-AUC rises from 0.516 to 0.649 and the gap narrows (0.235 → 0.097). A gap that shrinks with more businesses is variance that more data fixes; both scores low and close would be underfitting.

Accuracy is shown for completeness only: predicting "no bankrupt_next_year" for everyone would score 93%.

## What drives the predictions (mean |SHAP| on validation, top 5)

- **XGBoost**: Sales relative to last year; Operating profit relative to interest and finance costs; Quick ratio (current assets without stock, relative to short-term bills); Retained earnings relative to assets; Sales relative to assets
- **Logistic Regression**: Liabilities relative to assets; Profit before tax relative to sales; Sales relative to last year; Equity relative to assets; Profit plus depreciation relative to liabilities
- **Random Forest**: Operating profit relative to interest and finance costs; Sales relative to last year; Quick ratio (current assets without stock, relative to short-term bills); Profit plus depreciation relative to liabilities; Operating profit margin
- **LightGBM**: Sales relative to last year; Operating profit relative to interest and finance costs; Retained earnings relative to assets; Quick ratio (current assets without stock, relative to short-term bills); Liabilities relative to assets

## Limitations
- Polish manufacturing companies, annual accounts: much larger than Cambodian MSMEs, a different economy and period.
- No years in the data, so results cannot be checked on a later period.
- No cash flow statement or loan schedules, so DSCR and cash runway are approximated (liquid days of expenses).
- Some extreme values in the source (e.g. negative liabilities ratios) are kept: tree models are not sensitive to them.
- Thresholds and risk bands (0.30 / 0.60) are the spec's proposals, not final.

Run 20261027-162955, 13.7 min. Seed 20261027. python 3.11.9, numpy 2.4.6, pandas 2.3.3, scikit-learn 1.9.1, xgboost 3.2.0, lightgbm 4.7.0, shap 0.51.0.
