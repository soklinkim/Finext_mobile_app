# FINEXT

**Bookkeeping, financial statements and AI risk insight for Cambodian micro, small and medium businesses (MSMEs),
in Khmer and English, with USD and KHR.**

A shop owner records sales and costs on their phone. FINEXT turns those records into standard financial statements,
checks the business's financial health, uses AI to estimate how likely it is to run into financial stress, and
packages it all into one document a bank or microfinance institution (MFI) can use to judge a loan.

## The problem

From the World Bank Enterprise Surveys, Cambodia 2023 [1]:

| | Cambodia | East Asia & Pacific | All economies |
|---|---:|---:|---:|
| Firms with a bank loan or line of credit | **13.5%** | 34.8% | 36.3% |
| Loans that require collateral | **100%** | 64.4% | 67.1% |
| Firms with a checking or savings account | 95.2% | 85.5% | 89.9% |

Most firms bank, but few borrow, and every loan needs collateral: lenders cannot judge a small business from its
records, because the records rarely exist in a form they can use. FINEXT gives the business those records, and the
lender evidence instead of collateral.

## What it does

| Area | What the user gets |
|---|---|
| **Bookkeeping** | Simple entries (sales, costs, stock, loans, payments, transfers…) that work offline and sync when online. Each entry is posted to a double-entry ledger by fixed accounting rules. |
| **Bank statement import** | Upload a bank statement PDF (ACLEDA, ABA, Wing, Canadia and others, English or Khmer). Every transaction is read out, given a suggested entry type and checked for duplicates, and the owner reviews it before anything is saved. The PDF is not stored. The reader is by Saron Borak (see [Credits](#credits)). |
| **Financial statements** | Income statement, statement of financial position and cash flow statement, plus weekly, monthly and annual reports, with prior-period comparison. Each is previewed, then downloaded as a PDF. |
| **Financial health** | Key ratios (margins, liquidity, debt, receivable and inventory days) against targets, with plain-language alerts, and an optional owner check-in using the FinHealth Score® survey [11]. |
| **AI: probability of financial stress** | **Next 3 months:** a projection of the business's own cash flow against the stress conditions (cash under two weeks of expenses, operating cash flow negative three months running, or loan repayments not covered). **Next 12 months:** an XGBoost model trained on real company accounts, with the top reasons for each score. |
| **AI: how to lower the risk** | Concrete changes (break even, collect from customers, cut costs, a longer loan term…), each re-scored with the same AI so the owner sees the effect, e.g. "stress in 3 months 100% → 0%". |
| **Debt capacity** | How much the business can repay each month, repayment cover, missed instalments, and a "Can I afford this loan?" check that shows the largest safe amount. |
| **Loan application pack** | One PDF for a lender: AI summary, debt capacity, key ratios and the three statements. |
| **Lender portal** | Bank staff see only the businesses sharing with them, and only what each one consented to; they record a decision the owner sees in the app. |
| **Data and AI policies** | A formal Data and AI Policy, Privacy Policy, AI Use Statement, Terms of Use and Governance page in the app, aligned with the NIST AI RMF [12], the OECD AI Principles [13] and Cambodian law [14–16]. |
| **Also** | Spending categories, savings goals, business documents (photo or file), loan readiness score, Khmer and English throughout. |

## How the AI works

**Only real data is used for training; nothing is simulated or generated.**

- **Deployed 12-month model:** XGBoost [5] trained on the Polish companies bankruptcy data [2] (UCI 365, CC BY 4.0), using
  23 ratios FINEXT computes from a business's own books. Split 60/20/20 into train, validation and test (companies
  never seen), with 5-fold grouped cross-validation inside the training set.
- **Why XGBoost:** four models (XGBoost, Logistic Regression, Random Forest [7], LightGBM [8]) compared with the same
  tuning budget and a selection rule fixed before the results, on three real datasets from three countries (Poland [2],
  the US [3] and Taiwan [4]). Gradient boosting was at or near the top every time and XGBoost clearly best on the dataset closest to
  FINEXT's use. It also handles missing values natively, follows finance-direction rules (e.g. more receivable days
  can only raise risk) and gives exact explanations (SHAP [6]), which the app shows as reasons.
- **Cambodian failure rate:** the training data has a 7.0% bankruptcy rate; Cambodia's bank non-performing loan rate
  is 8.3% (National Bank of Cambodia [9]). Percentages are shifted to the Cambodian rate by a standard prior
  correction [10]. This changes the level of the numbers, not which business ranks riskier, and not who gets an alert.
- **3-month projection:** 2,000 possible next three months built from the business's own last six months and the loan
  instalments already scheduled, checked against the stress conditions above.

**Results on companies the model never saw** (Polish data, final test set):

| | XGBoost | Altman Z′-score (textbook formula) [17] |
|---|---:|---:|
| ROC-AUC | **0.93** | — |
| PR-AUC (bankruptcy is rare: 7%) | **0.67** | 0.24 |
| Bankruptcies caught | **91%** | 44% |

**Checked for trust:** small train/test gap (0.75 vs 0.63 PR-AUC, the floor for this amount of data); early stopping,
the one-standard-error rule and monotonic constraints against overfitting; bootstrap intervals and five training
seeds; a transfer test (train in one country, score another); and a behaviour test of 18 realistic MSME profiles run
through the real app pipeline (worse books always score higher, size never changes the answer).

**Limits, stated plainly:** the model learned from foreign companies, so its accuracy on Cambodian MSMEs is not yet
measured, and the 3-month answer is a projection, not a trained model. Both are labelled as indicative, never a
credit decision. With repayment outcomes from partner lenders, both can be validated and retrained on FINEXT's own
records. Full details: [`ml/README.md`](ml/README.md).

**Training data** (public, real company accounts, all CC BY 4.0; not in this repository, download to `ml/data/raw/`):

| Dataset | Used for | Download | Save to |
|---|---|---|---|
| Polish companies bankruptcy [2] | the deployed model | [UCI 365](https://archive.ics.uci.edu/dataset/365) (zip; `5year.arff` is used) | `ml/data/raw/polish_bankruptcy/` |
| US company bankruptcy [3] | model comparison, transfer test | [sowide/bankruptcy_dataset](https://github.com/sowide/bankruptcy_dataset) (`american_bankruptcy_dataset.csv`) | `ml/data/raw/us_bankruptcy/` |
| Taiwanese bankruptcy [4] | model comparison | [UCI 572](https://archive.ics.uci.edu/dataset/572) (zip; `data.csv`) | `ml/data/raw/taiwan_bankruptcy/` |

**The deployed model is in the repository:** training run
[`ml/artifacts/polish_bankruptcy/20261027-162955`](ml/artifacts/polish_bankruptcy/20261027-162955) (trained model,
results, model card) and the copy the backend serves, [`backend/app/risk_model_files/`](backend/app/risk_model_files/).
`model_meta.json` names the run and gives the SHA-256 of both model files, so anyone can check they match
(`Get-FileHash` or `sha256sum`).

**For lenders:** [`backend/scripts/validate_lender_data.py`](backend/scripts/validate_lender_data.py) lets a bank or MFI
test the model on its own past loans, inside the bank, from a one-row-per-loan CSV
([template](backend/scripts/lender_validation_template.csv)). It outputs only summary figures (ranking score, alerts,
calibration by band), so no customer data leaves the lender.

## Repository

```
frontend/   Expo (React Native) app for iOS, Android and web: TypeScript, Expo Router, NativeWind, SQLite (offline)
backend/    FastAPI: sync, posting rules and ledger, statements, ratios, AI risk endpoints, lender portal (/portal)
ml/         Training pipeline: datasets, preprocessing, four candidate models, evaluation, model cards, export
FINEXT_FINANCE_RULES.md          Chart of accounts, posting rules and accounting decisions
FINEXT_APP_MODULES_AND_FLOWS.md  Screens and user flows
FINEXT_STYLE_GUIDE_MERGED.md     Visual design system
posting_rules.json               Entry types and their journal postings
```

## Run it locally

**Requirements:** Node.js, Python 3.11+ (3.14 works for the backend; the ML pipeline uses 3.11), a Supabase project.

**1. Backend** (from `backend/`). Run [`sql/001_sync.sql`](backend/sql/001_sync.sql) once in the Supabase SQL editor,
then create `backend/.env` with `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs · lender portal: http://localhost:8000/portal/

**2. App** (from `frontend/`). Create `frontend/.env.local` from [`.env.example`](frontend/.env.example) with the
Supabase URL and publishable key, then:

```powershell
npm install --legacy-peer-deps
npm run dev
```

One server for both: the **browser** at http://localhost:8081 and a **phone** with Expo Go (scan the QR code, same
Wi-Fi). `npm run dev` also starts a small relay so the phone can reach the API even when Windows Firewall blocks
Python. Open the web app in only one tab at a time (the browser lets one copy use the offline database).

**3. ML pipeline** (optional, from `ml/`): download the datasets ([links above](#how-the-ai-works)), then see
[`ml/README.md`](ml/README.md) and `python -m finext_ml.train_and_compare --data polish`. Not needed to run the app:
the trained model is already in `backend/app/risk_model_files/`.

## Tests

```powershell
cd backend; .\venv\Scripts\python -m pytest tests     # 209 tests: posting rules, statements, ratios, AI risk, statement import, lender kit
cd ml; .venv\Scripts\python -m pytest tests           # 19 tests: datasets, training checks, export, backend bridge
cd frontend; npx tsc --noEmit                         # type check
```

## Documentation

- [`frontend/README.md`](frontend/README.md): app architecture, offline/online split, local database
- [`backend/README.md`](backend/README.md): API, sync, AI risk endpoints, loan readiness and the lender portal
- [`ml/README.md`](ml/README.md): data, training, model selection, overfitting checks, benchmarks, limitations
- [`FINEXT_FINANCE_RULES.md`](FINEXT_FINANCE_RULES.md): accounting rules and decisions

## Credits

- **Bank statement reader:** [`backend/app/statement_reader.py`](backend/app/statement_reader.py) (the
  `statement_to_excel` tool, which reads a bank statement PDF into a clean table across Cambodian banks, in English or
  Khmer) was written by **Saron Borak**. FINEXT runs it unchanged behind the statement import screen.
- **Datasets:** the Polish [2], US [3] and Taiwanese [4] bankruptcy datasets, published under CC BY 4.0 by their
  authors.
- **Open-source software:** Expo and React Native, Expo Router, NativeWind, expo-sqlite, FastAPI, Supabase, XGBoost,
  scikit-learn, LightGBM, pdfplumber, html2pdf.js and the other packages listed in `frontend/package.json`,
  `backend/requirements.txt` and `ml/`.

## References

**Data and context**

1. World Bank. *Enterprise Surveys: Cambodia 2023.* https://www.enterprisesurveys.org
2. Tomczak, S. *Polish Companies Bankruptcy* [dataset]. UCI Machine Learning Repository, 2016. CC BY 4.0.
   https://archive.ics.uci.edu/dataset/365. Described in: Zięba, M., Tomczak, S. K., & Tomczak, J. M. (2016).
   Ensemble boosted trees with synthetic features generation in application to bankruptcy prediction.
   *Expert Systems with Applications*, 58, 93–101.
3. Lombardo, G., Pellegrino, M., Adosoglou, G., Cagnoni, S., Pardalos, P. M., & Poggi, A. (2022). Machine learning for
   bankruptcy prediction in the American stock market: dataset and benchmarks. *Future Internet*, 14(8), 244.
   Data: https://github.com/sowide/bankruptcy_dataset (CC BY 4.0).
4. Liang, D., Lu, C.-C., Tsai, C.-F., & Shih, G.-A. (2016). Financial ratios and corporate governance indicators in
   bankruptcy prediction: a comprehensive study. *European Journal of Operational Research*, 252(2), 561–572.
   Data: *Taiwanese Bankruptcy Prediction*, UCI Machine Learning Repository, https://archive.ics.uci.edu/dataset/572
   (CC BY 4.0).

**Methods**

5. Chen, T., & Guestrin, C. (2016). XGBoost: a scalable tree boosting system. *Proceedings of the 22nd ACM SIGKDD
   International Conference on Knowledge Discovery and Data Mining*, 785–794.
6. Lundberg, S. M., Erion, G., Chen, H., et al. (2020). From local explanations to global understanding with
   explainable AI for trees. *Nature Machine Intelligence*, 2, 56–67.
7. Breiman, L. (2001). Random forests. *Machine Learning*, 45, 5–32.
8. Ke, G., Meng, Q., Finley, T., et al. (2017). LightGBM: a highly efficient gradient boosting decision tree.
   *Advances in Neural Information Processing Systems*, 30.
9. National Bank of Cambodia. *Annual Supervision Report 2025.*
   https://www.nbc.gov.kh/download_files/supervision/sup_an_rep_eng/EN%20Annual%20Supervision%20Report%202025.pdf
10. Saerens, M., Latinne, P., & Decaestecker, C. (2002). Adjusting the outputs of a classifier to new a priori
    probabilities: a simple procedure. *Neural Computation*, 14(1), 21–41.
11. Financial Health Network. *FinHealth Score® Toolkit* (2021). https://finhealthnetwork.org

**Governance and law**

12. National Institute of Standards and Technology (2023). *Artificial Intelligence Risk Management Framework
    (AI RMF 1.0)*, NIST AI 100-1. https://doi.org/10.6028/NIST.AI.100-1
13. OECD (2019, updated 2024). *Recommendation of the Council on Artificial Intelligence* (OECD AI Principles),
    OECD/LEGAL/0449. https://oecd.ai/en/ai-principles
14. Kingdom of Cambodia. *Law on Electronic Commerce* (2019).
15. Kingdom of Cambodia. *Law on Consumer Protection* (2019).
16. Kingdom of Cambodia. *Draft Law on Personal Data Protection* (followed in advance; not yet adopted).

**Baselines**

17. Altman, E. I. (1968). Financial ratios, discriminant analysis and the prediction of corporate bankruptcy.
    *The Journal of Finance*, 23(4), 589–609. The Z′-score for private firms: Altman, E. I. (1983). *Corporate
    Financial Distress.* Wiley.

## Status

A working prototype for demonstration. Partner banks in the app are demo entries, not live integrations. AI outputs
are decision support, not credit decisions.
