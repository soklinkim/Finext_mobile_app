# FINEXT

**Bookkeeping, financial statements and AI risk insight for Cambodian micro, small and medium businesses (MSMEs),
in Khmer and English, with USD and KHR.**

**Try it live:** https://finext-neon.vercel.app/launch (no install needed; opens in the browser on phone or computer)

A shop owner records sales and costs on their phone, even offline. FINEXT turns those records into standard financial
statements, checks the business's financial health, uses AI to estimate the risk of financial stress (with the reasons),
and lets the owner share a loan pack with a bank, only with their consent.

**Why:** only 13.5% of Cambodian firms have a bank loan or credit line, against 34.8% in East Asia & Pacific, and 100% of
loans require collateral [1]. Lenders cannot judge a small business without usable records; FINEXT creates them.

> **Status:** a working prototype for the 2026 Data, AI & Policy APAC Hackathon (Team F4), supported by KB PRASAC.
> Partner banks in the app are demo entries, not live integrations. AI outputs are decision support, not credit decisions.

**Contents:** [Tech stack](#tech-stack) · [Architecture](#architecture) · [How data flows](#how-data-flows) ·
[Repository structure](#repository-structure) · [Run it for the first time](#run-it-for-the-first-time) ·
[Environment variables](#environment-variables) · [Everyday commands](#everyday-commands) · [Tests](#tests) ·
[Troubleshooting](#troubleshooting) · [Deploying](#deploying) · [Features](#features) · [The AI](#the-ai) ·
[Documentation](#documentation) · [Credits](#credits) · [References](#references)

---

## Tech stack

| Part | Technology | Folder |
|---|---|---|
| **App** (Android, iOS, web) | Expo 58 / React Native 0.88, TypeScript, Expo Router, NativeWind (Tailwind), expo-sqlite + Drizzle ORM for the offline database | [`frontend/`](frontend/) |
| **API** | Python, FastAPI, Uvicorn, pydantic, psycopg 3, pdfplumber (bank statement PDFs), XGBoost + NumPy (AI scoring) | [`backend/`](backend/) |
| **Database and sign-in** | Supabase: PostgreSQL (one `sync_rows` table plus loan-sharing tables) and Supabase Auth | [`backend/sql/`](backend/sql/) |
| **Lender portal** | Static web page served by the API at `/portal/` | [`backend/portal/`](backend/portal/) |
| **ML training** (offline, optional) | Python 3.11, pandas, scikit-learn, XGBoost, LightGBM, SHAP | [`ml/`](ml/) |

No paid AI service is called. The model, forecasts, unusual-entry checks and statement reader all run on our own API.

## Architecture

```
┌──────────────────────────── Phone or browser ────────────────────────────┐
│  FINEXT app (Expo / React Native)                                         │
│                                                                           │
│   Screens (src/app) ──► services/bookkeeping ──► local SQLite (offline)   │
│        │                                              │                   │
│        │                                     services/sync (push / pull)  │
│        └────────► services/analysis ──► AsyncStorage cache (last answer)  │
└──────────────┬──────────────────────────────────┬─────────────────────────┘
               │ sign-in (Supabase Auth)           │ HTTPS + Supabase access token
               ▼                                   ▼
┌──────────────────────────┐        ┌──────────────────────────────────────────────┐
│  Supabase                │        │  FastAPI backend (backend/app)                │
│  • Auth (users, tokens)  │◄──────►│  /sync        push and pull ledger rows       │
│  • PostgreSQL            │  SQL   │  /accounting  ledger, statements, ratios,     │
│    sync_rows, loan_*     │        │               forecast, AI risk, what-if      │
│    tables, documents     │        │  /import      bank statement PDF reader       │
└──────────────────────────┘        │  /loan        readiness score, sharing        │
                                    │  /lender      lender portal API               │
                                    │  /portal/     lender portal web page          │
                                    │  risk_model_files/  trained XGBoost model     │
                                    └──────────────────────────────────────────────┘
                                                        ▲
                                    ml/ (offline, once): trains and exports the model
```

**Design rules worth knowing before you change code:**

- **Offline first for bookkeeping, online for analysis.** Every entry is written to SQLite on the device first
  (`sync_status = 'pending'`), so recording never needs a connection. Statements, ratios and AI results are computed
  on the server and cached on the device for offline viewing.
- **One generic sync table.** The server stores every synced row in `public.sync_rows` (user, table, row id, JSON
  data, a per-user sequence number). Newer `updated_at` wins. Deletes are soft (`deleted_at`) and sync as tombstones.
- **The server is the accountant.** The API turns entries into double-entry journal lines with fixed posting rules
  ([`posting_rules.json`](posting_rules.json), [`FINEXT_FINANCE_RULES.md`](FINEXT_FINANCE_RULES.md)), then builds
  statements, ratios and AI inputs from that journal. App, lender portal and AI all use the same numbers.
- **Money is integers in minor units:** USD in cents, KHR in whole riel. No floats in the database.
- **Every request is scoped to the signed-in user.** The API checks the Supabase access token and only reads or writes
  that user's rows. Bank staff accounts are refused by the SME API and use the portal.

## How data flows

**1. Recording an entry (works offline)**
```
Add entry screen → services/bookkeeping writes to SQLite (pending)
  → services/sync pushes it to POST /sync/push (when online; ~0.3 s after a change, then every 30 s)
  → backend stores it in sync_rows → other devices pull it from GET /sync/changes
```

**2. Seeing statements, health and AI results (needs a connection, then cached)**
```
Analysis screen → services/analysis → GET /accounting/statements | /ratios | /risk | /forecast
  → backend reads the user's rows → posts them to the journal → monthly snapshots → answers
  → app shows the answer and keeps a copy in AsyncStorage for offline use
```

**3. Importing a bank statement**
```
Owner picks a PDF → POST /import/statement → statement readers extract every row (the PDF is not stored)
  → app shows an account summary and duplicate checks → owner gives every row a type
  → app saves the confirmed rows as normal entries → they sync like any other entry
```

**4. The AI risk answer** (details in [The AI](#the-ai))
```
journal → monthly snapshots (only months whose books balance) → 23 financial ratios
  → XGBoost model (backend/app/risk_model_files) → calibrated % set to Cambodia's 8.3% bad-loan rate
  → level (low / moderate / high) + top reasons (SHAP) + 3-month cash-stress projection + advice
```

**5. Sharing with a bank**
```
Owner picks a bank, what it may see and for how long (30 / 90 / 180 days) → POST /loan/shares
  → bank staff sign in to /portal/ → see only what was shared (every view logged)
  → bank records a decision or an offer → owner sees it in the app and answers
```

## Repository structure

```
Finext_mobile_app/
├── frontend/                     The app (Expo / React Native, TypeScript)
│   ├── src/app/                  Screens, one file per route (Expo Router); (tabs)/ = bottom tabs
│   ├── src/components/           Reusable UI (ScreenShell, BottomNav, cards, inputs, charts)
│   ├── src/services/bookkeeping/ OFFLINE: reads and writes the local database
│   ├── src/services/analysis/    ONLINE: calls the API, caches the last answer
│   ├── src/services/sync/        Push and pull between SQLite and the API
│   ├── src/services/             auth, statement import, loans, PDFs, reminders, missed days, …
│   ├── src/db/                   SQLite schema, migrations, seed (Drizzle)
│   ├── src/i18n/                 English and Khmer strings, simple vs standard finance wording
│   ├── src/content/policies.ts   The in-app Data and AI policies
│   ├── src/theme/                Design tokens (the only place colours are defined)
│   ├── scripts/                  `npm run dev` launcher and the phone → API relay
│   └── vercel.json               Web hosting settings (headers the offline database needs)
├── backend/                      The API (FastAPI)
│   ├── app/main.py               App entry point: routers, CORS, /health, /portal
│   ├── app/routers/              sync, accounting, import, documents, loan, lender
│   ├── app/bookkeeping.py        Posting rules → journal lines
│   ├── app/snapshots.py          Monthly financial snapshots (AI inputs)
│   ├── app/risk*.py, stress_forecast.py, advice.py, what_if.py, forecasting.py   AI answers
│   ├── app/statement_*.py        Bank statement PDF readers
│   ├── app/risk_model_files/     The trained model the API serves (model.json + model_meta.json)
│   ├── portal/                   Lender portal web page
│   ├── sql/                      Database setup scripts (run once, in order)
│   ├── scripts/                  Demo data loaders, add a bank, lender validation kit
│   └── tests/                    225 pytest tests
├── ml/                           Model training (optional; the trained model is already in backend/)
│   ├── finext_ml/                Datasets, features, 4 candidate models, evaluation, export
│   ├── artifacts/                Training runs: metrics, model cards, exported models
│   └── tests/                    19 pytest tests
├── posting_rules.json            Entry types and their journal postings
└── FINEXT_*.md, STATEMENT_TERMS_REVIEW.md   Finance rules, screens and flows, style guide, statement wording
```

## Run it for the first time

You need about 30 minutes the first time. Commands are for **Windows PowerShell**; on macOS or Linux use
`source venv/bin/activate` and `venv/bin/python` instead of the `venv\Scripts\…` paths.

### 0. Install the tools

| Tool | Version | Check with |
|---|---|---|
| Git | any recent | `git --version` |
| Node.js | 20 LTS or newer (tested on 24) | `node --version` |
| Python | 3.11 or newer for the backend (tested on 3.14); 3.11 for `ml/` | `python --version` |
| Expo Go app (optional) | on an Android or iPhone, for testing on a phone | from the app store |

You also need a free **Supabase** account: https://supabase.com

### 1. Get the code

```powershell
git clone https://github.com/soklinkim/Finext_mobile_app.git
cd Finext_mobile_app
```

### 2. Set up Supabase (once per project)

1. Create a new Supabase project (or ask the team for access to the existing one).
2. In the Supabase **SQL Editor**, run these files **in this order**, one at a time:
   [`001_sync.sql`](backend/sql/001_sync.sql) → [`002_business_documents.sql`](backend/sql/002_business_documents.sql) →
   [`003_loan_sharing.sql`](backend/sql/003_loan_sharing.sql) → [`004_loan_offers.sql`](backend/sql/004_loan_offers.sql).
3. Collect four values (you will paste them into `.env` files next):
   - **Project URL** and **publishable key**: Project Settings → API Keys.
   - **Secret key**: same page. Keep it private; only backend scripts use it.
   - **Database connection string**: the **Connect** button → a PostgreSQL URI (with your database password filled in).

### 3. Start the backend

Create **`backend/.env`**:

```env
DATABASE_URL=postgresql://...            # Supabase connection string
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...        # optional; only for scripts/add_lender.py --invite
```

Then, in a terminal:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Check it works:** open http://localhost:8000/health (should answer) and http://localhost:8000/docs (all API
endpoints). Leave this terminal running.

### 4. Start the app

Create **`frontend/.env.local`**:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # the PUBLIC key, never the secret one
```

Then, in a **second** terminal:

```powershell
cd frontend
npm install --legacy-peer-deps      # the flag is needed (a react-dom peer range conflicts with Expo 58)
npm run dev
```

- **Browser:** open http://localhost:8081 (or press `w`). Use only **one tab**: the offline database allows one copy.
- **Phone:** scan the QR code with **Expo Go**. The phone must be on the **same Wi-Fi** as the computer.
  `npm run dev` also starts a small relay (port 8001) so the phone can reach the API even when Windows Firewall
  blocks Python.

### 5. First use

1. **Sign up** in the app (business details are asked at sign-up), confirm the email if Supabase asks.
2. Finish the one-screen setup (language, finance wording, currency) and onboarding (opening balances).
3. Add a few entries. Check sync in **Profile › Cloud sync**.

The AI risk answers need at least **6 complete months** of records, so a new account will show "needs more history".
To see everything working straight away, load demo data (next step).

### 6. Optional: load demo data

Sign up a separate demo account and open it once while online, then from `backend/`:

```powershell
# Sample Grocery Shop from FINEXT_FINANCE_RULES.md (worked example)
.\venv\Scripts\python.exe scripts\seed_demo.py DEMO_EMAIL            # preview
.\venv\Scripts\python.exe scripts\seed_demo.py DEMO_EMAIL --write    # load

# Or: a real bank statement PDF with identities removed (real dates and amounts, made-up labels)
.\venv\Scripts\python.exe scripts\seed_statement_demo.py "PATH\TO\statement.pdf" DEMO_EMAIL --write
```

Then pull to refresh in the app. Running a loader again replaces the same rows.

### 7. Optional: the lender portal

Open http://localhost:8000/portal/. Bank staff accounts are invitation only:

```powershell
.\venv\Scripts\python.exe scripts\add_lender.py "Bank name" staff@bank.example --invite   # needs SUPABASE_SECRET_KEY
.\venv\Scripts\python.exe scripts\add_lender.py --list
```

Add `http://localhost:8000/portal/` to Supabase › Authentication › URL Configuration › Redirect URLs first. Details:
[`backend/README.md`](backend/README.md#loan-readiness-and-the-lender-portal).

## Environment variables

| Variable | File | Required | What it is |
|---|---|---|---|
| `DATABASE_URL` | `backend/.env` | yes | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | `backend/.env` | yes | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `backend/.env` | for the portal | Public key; lets bank staff sign in to the portal |
| `SUPABASE_SECRET_KEY` | `backend/.env` | no | Secret key, only for `add_lender.py --invite`. **Never** in the app or portal |
| `ALLOWED_ORIGINS` | `backend/.env` | when deployed | Extra web origins allowed to call the API, comma-separated (e.g. your Vercel address). Local dev origins are allowed already |
| `PORTAL_URL` | `backend/.env` | when deployed | Public address of the portal, for invitation emails |
| `EXPO_PUBLIC_SUPABASE_URL` | `frontend/.env.local` | yes | Same as `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `frontend/.env.local` | yes | Same public key as `SUPABASE_PUBLISHABLE_KEY` |
| `EXPO_PUBLIC_API_URL` | `frontend/.env.local` | when deployed | API address. Leave unset locally (web uses `http://localhost:8000`, a phone uses the computer's address) |

`.env` and `.env.local` are git-ignored. Never commit keys. After changing an `EXPO_PUBLIC_` value, restart Expo.

## Everyday commands

```powershell
# Terminal 1: API
cd backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: app (browser + phone)
cd frontend; npm run dev

# Get your team's latest changes (then `npm install --legacy-peer-deps` / `pip install -r requirements.txt`
# if package.json or requirements.txt changed, and run any new backend/sql/*.sql file in Supabase)
git pull

# Re-export the in-app policies for the lender portal after editing frontend/src/content/policies.ts
node backend/scripts/export_policies.mjs
```

## Tests

```powershell
cd backend; .\venv\Scripts\python.exe -m pytest tests   # 225 tests: posting rules, statements, ratios, AI risk, import, loans, lender kit
cd ml; .venv\Scripts\python -m pytest tests            # 19 tests: datasets, training checks, export, backend bridge
cd frontend; npx tsc --noEmit                          # type check (run after every change)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails with a peer-dependency error | Use `npm install --legacy-peer-deps` |
| PowerShell refuses `Activate.ps1` | Skip activation: call `.\venv\Scripts\python.exe …` directly, as in this README |
| Web app is blank or cannot save | Use one browser tab only; hard-refresh (Ctrl+Shift+R). Deployed: check the two headers in `frontend/vercel.json` |
| Phone says "Can't reach the FINEXT server" | Start with `npm run dev` (not `npx expo start`); phone and computer on the same Wi-Fi; backend running |
| Browser shows a CORS error | Add the web app's address to `ALLOWED_ORIGINS` in `backend/.env` and restart the API |
| API fails at start with a settings error | `backend/.env` is missing `DATABASE_URL` or `SUPABASE_URL` |
| Sign-in or sync suddenly fails | A free Supabase project pauses after about a week idle: restore it in the Supabase dashboard |
| "Port 8000 is already in use" | Another API copy is running: close it, or stop the process using port 8000 |
| Analysis says it needs more history | The AI needs 6 complete months; load demo data (step 6) |
| A loader says "No account for …" | Sign up with that email and open the app once while online, then run it again |
| Another account's data is on the device | One account per device: the app offers to erase the device's data (unsynced changes are counted first) |

## Deploying

Deploy so the app works without your computer: **backend on Render** (or similar), **web app on Vercel**, database
already on Supabase. Every `git push` to the connected branch redeploys automatically (Vercel ~1–3 min, Render
~2–5 min).

| Service | Settings |
|---|---|
| **Render** (Web Service) | Root `backend` · build `pip install -r requirements.txt` · start `uvicorn app.main:app --host 0.0.0.0 --port $PORT` · env: the `backend/.env` values plus `ALLOWED_ORIGINS` (the Vercel address), `PORTAL_URL`, `PYTHON_VERSION` · Starter plan so it does not sleep |
| **Vercel** | Root `frontend` (build settings come from `vercel.json`) · env: `EXPO_PUBLIC_API_URL` (the Render address) and the two `EXPO_PUBLIC_SUPABASE_*` values · redeploy after changing env values |
| **Supabase** | Authentication › URL Configuration: add the Vercel and portal addresses so sign-up and password-reset emails work |

Phones can keep using Expo Go against the deployed API by setting `EXPO_PUBLIC_API_URL`, or install a build made with
`eas build`.

## Features

| Area | What the user gets |
|---|---|
| **Bookkeeping** | Simple entries (sales, costs, stock, loans, payments, transfers) that work offline and sync; posted to a double-entry ledger by fixed rules. Entries can be edited or deleted, carry receipt photos, and are filtered by type, unpaid, evidence and month. One currency per business (USD or KHR) |
| **Bank statement import** | PDF statements from ACLEDA, ABA, Wing, Canadia and others, English or Khmer. Account summary checked against the statement's totals, duplicate checks, and **no guessed types**: the owner chooses each entry's type. The PDF is not stored |
| **Missing data and reminders** | Calendar flags recorded, "nothing happened" and missing days; the owner enters figures, confirms zero, or fills an average marked as an estimate. In-app daily, weekly or monthly reminders |
| **Financial statements** | Income, financial position and cash flows, worded after the Cambodian IFRS for SMEs reference, weekly and monthly reports, PDF download; tap a figure to see its formula and entries |
| **Financial health** | Key ratios against targets with plain-language alerts, and an optional FinHealth Score® check-in [11] |
| **AI** | 12-month risk of financial difficulty with reasons, 3-month cash-stress projection, debt capacity and "Can I afford this loan?", advice re-scored by the AI, what-if sliders |
| **Loans** | Loan readiness score, loan application pack PDF, consent-based sharing with a bank, lender portal with decisions and offers |
| **Policies** | Data and AI Policy, Privacy, AI use, Terms, Rules for partner banks and Governance, in the app |
| **Language** | Khmer and English, with simple or standard finance wording and an (i) showing the other wording |

Screens and flows in detail: [`FINEXT_APP_MODULES_AND_FLOWS.md`](FINEXT_APP_MODULES_AND_FLOWS.md) and
[`frontend/README.md`](frontend/README.md#what-is-built-and-what-is-not).

## The AI

**Only real data is used for training; nothing is simulated or generated.** No chatbot or large language model is used.

- **12-month risk (trained model):** XGBoost [5] trained on real accounts of 5,850 Polish companies and whether each went
  bankrupt within a year [2], using 23 ratios FINEXT computes from a business's own books. Chosen over Logistic
  Regression, Random Forest [7] and LightGBM [8] by a rule fixed in advance, on three countries' data [2–4].
  Percentages are shifted to Cambodia's 8.3% bank non-performing loan rate [9, 10]; reasons come from SHAP [6].
- **3-month cash stress (projection, not trained):** 2,000 possible next three months built from the business's own
  last six months and its scheduled loan instalments.
- **Debt capacity, advice, what-if, loan readiness:** standard lending arithmetic and rules on the business's own books.

**Results on 1,170 companies the model never saw:** ROC-AUC **0.93**, PR-AUC **0.67** (Altman Z′ [17]: 0.24), 91% of
bankruptcies caught (Altman: 44%). Checked with cross-validation, early stopping, bootstrap intervals, five seeds, a
transfer test between countries and 18 realistic MSME profiles run through the app.

**Limits:** trained on foreign companies, so accuracy on Cambodian MSMEs is not yet measured; outputs are labelled
indicative, never a credit decision. Lenders can test the model on their own past loans with
[`backend/scripts/validate_lender_data.py`](backend/scripts/validate_lender_data.py)
([template](backend/scripts/lender_validation_template.csv)); only summary figures leave the bank.

**Where things are:** the served model is in [`backend/app/risk_model_files/`](backend/app/risk_model_files/)
(`model_meta.json` names the training run and the SHA-256 of both files); the training run is
[`ml/artifacts/polish_bankruptcy/20261027-162955`](ml/artifacts/polish_bankruptcy/20261027-162955). To retrain, download
the datasets below to `ml/data/raw/` and follow [`ml/README.md`](ml/README.md). Not needed to run the app.

| Dataset | Used for | Download | Save to |
|---|---|---|---|
| Polish companies bankruptcy [2] | the deployed model | [UCI 365](https://archive.ics.uci.edu/dataset/365) (zip; `5year.arff` is used) | `ml/data/raw/polish_bankruptcy/` |
| US company bankruptcy [3] | model comparison, transfer test | [sowide/bankruptcy_dataset](https://github.com/sowide/bankruptcy_dataset) (`american_bankruptcy_dataset.csv`) | `ml/data/raw/us_bankruptcy/` |
| Taiwanese bankruptcy [4] | model comparison | [UCI 572](https://archive.ics.uci.edu/dataset/572) (zip; `data.csv`) | `ml/data/raw/taiwan_bankruptcy/` |

## Documentation

- [`frontend/README.md`](frontend/README.md): app architecture, offline/online split, local database schema, sync
- [`backend/README.md`](backend/README.md): API, sync, statement readers, AI risk endpoints, loan readiness, lender portal
- [`ml/README.md`](ml/README.md): data, training, model selection, overfitting checks, benchmarks, limitations
- [`FINEXT_FINANCE_RULES.md`](FINEXT_FINANCE_RULES.md): chart of accounts, posting rules and accounting decisions
- [`FINEXT_APP_MODULES_AND_FLOWS.md`](FINEXT_APP_MODULES_AND_FLOWS.md): screens, flows and build decisions
- [`FINEXT_STYLE_GUIDE_MERGED.md`](FINEXT_STYLE_GUIDE_MERGED.md): visual design system
- [`STATEMENT_TERMS_REVIEW.md`](STATEMENT_TERMS_REVIEW.md): statement wording against the Cambodian IFRS for SMEs reference

## Credits

- **Bank statement reader:** [`backend/app/statement_reader.py`](backend/app/statement_reader.py) (the
  `statement_to_excel` tool, which reads a bank statement PDF into a clean table across Cambodian banks, in English or
  Khmer) was written by **Saron Borak**. FINEXT runs it unchanged behind the statement import screen. For statements it cannot read, FINEXT adds two fallback readers of its own (`statement_aligned.py`, `statement_ruled.py`) that reuse its building blocks.
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
