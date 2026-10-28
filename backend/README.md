# FINEXT backend and Supabase sync

## Supabase database setup

Run [`sql/001_sync.sql`](sql/001_sync.sql) once in the Supabase SQL Editor. The API stores all synced ledger rows in `public.sync_rows`, keyed by user, table, and row ID. Do not put the database connection string in the frontend.

Set `DATABASE_URL` to the Supabase PostgreSQL connection string and `SUPABASE_URL` to the project's URL in `backend/.env`. The API validates Supabase access tokens and scopes every read and write by the token's user ID.

## Run the API locally

From the `backend` directory, install the pinned packages and start FastAPI:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The web frontend defaults to `http://localhost:8000`. On a physical phone, set `EXPO_PUBLIC_API_URL` in `frontend/.env.local` to the computer's LAN address, such as `http://192.168.1.20:8000`, then restart Expo.

Browsers may call the API only from the Expo web dev server (`:8081` on localhost or a private LAN address) and the same-origin lender portal. To allow another web front end, such as a deployed web app, list its origins in `ALLOWED_ORIGINS` in `backend/.env`, comma-separated. Native apps are not affected.

## Sync behavior

Bookkeeping writes go to local SQLite first with `syncStatus = 'pending'`. The client pushes pending rows, marks only accepted rows as synced, then pulls server changes using a per-user sequence cursor. Invalid rows stay pending and are reported. If the server has a newer version of a row, it returns that version and the client merges it into SQLite. Soft deletes sync as tombstones.

## Experimental forecast

`GET /accounting/forecast` uses the authenticated user's six most recently completed bookkeeping months to fit separate linear trends for income and expense, then estimates the next three months. It returns no forecast until all six months have activity. Before that, it returns rule-based six-month totals and flags data coverage as low (0–2 active months), moderate (3–5), or high (6). These coverage flags describe available history, not the user's financial health. Forecast ranges are experimental planning aids, not guarantees or accounting advice. Forecasting uses the server's existing Python dependencies and does not send ledger data to a third-party AI service.

## Future risk (Layer 2)

`GET /accounting/risk` returns three answers for the financial health dashboard, all from the business's own books:

- `stress3m`: the probability of financial stress in the next 3 months (pipeline spec C3: cash under two weeks of
  usual expenses in any month, operating cash flow negative in all three, or debt service cover ≤ 1.0). A projection,
  not a trained model (`app/stress_forecast.py`): today's cash and the instalments already scheduled, with each coming
  month repeating one of the business's own last 6 months, over 2,000 futures. Also says which conditions already hold
  now, and the expected cash at each month end. Same levels as the 12-month answer.

- `model`: the chance of serious financial distress within 12 months, from the XGBoost model trained on real company
  accounts in `ml/` (files in `app/risk_model_files/`, scored by `app/risk_model.py` with `xgboost` only). Inputs are
  23 annual ratios from the last 12 complete months (`app/risk_features.py`); needs 6 months, low confidence under 12.
  Returns the probability, a level (low < 10% ≤ moderate ≤ 30% < high; chosen for a 7% failure rate in training)
  and the top 5 reasons in plain words.
- `debtCapacity`: future over-indebtedness. Money available for repayments each month (operating profit before
  depreciation, less tax and the owner's usual drawings; the lower of the 3- and 12-month averages) against scheduled
  instalments for the next 3 months (DSCR, target 1.25), the cash flow trend, instalments due in 14 days against
  cash, and recent borrowing. Gives a level, reasons and the affordable monthly instalment.

`advice` (in `GET /accounting/risk`): how to lower the risk (`app/advice.py`). Changes an owner can make, applied to
the books and re-scored with the same 3-month projection and 12-month model: break even (the monthly gap to stop
losing money), collect from customers and get paid on time, sell down extra stock, cut operating costs 10%, raise the
gross margin 2 points, keep owner drawings within half the profit, ask for a longer loan term. Only changes that apply
and help are offered, never one that raises either risk; none when both risks are low. Before and after use the same
random draws, so the difference is the change, not chance.

`POST /accounting/risk/loan-check` with a proposed loan (`amount`, `termMonths`, `annualInterestRate`, `rateType`,
`repaymentFrequency`, optional `installmentAmount`) adds `debtCapacity.proposed`: its monthly instalment, DSCR with it,
whether it fits, the largest amount on the same terms that does, and the model's probability before and after (the
loan assumed spent on the business, not kept as cash). Decision support, not a credit decision.

## Loan readiness and the lender portal

Run [`sql/002_business_documents.sql`](sql/002_business_documents.sql) and [`sql/003_loan_sharing.sql`](sql/003_loan_sharing.sql) once, after `001_sync.sql`.

**Loan readiness** (`GET /loan/readiness`) is a 0–100 score built from the business's own records: ability to repay (30%), financial strength (25%), profitability (20%), record keeping (15%) and registration & documents (10%). Each check is pass, warn or fail. Checks without enough data are left out. With under 50% data coverage, or fewer than 3 months of entries, the level is `insufficient_data`. The rules live in [`app/loan_readiness.py`](app/loan_readiness.py). The score is decision support, not a credit decision.

**Sharing.** In the app (Analysis › Loan), an SME picks a partner bank, ticks what it may see (readiness, statements, health ratios, monthly trend, documents) and for how long (30, 90 or 180 days). Business name, owner name and contact details are always included. The SME can stop sharing at any time. Every time bank staff open the report, the view is logged, and the SME sees the view count.

**Lender portal.** Bank staff use the web portal at `http://localhost:8000/portal/`. They see only businesses that are currently sharing with their bank, and only the parts each business consented to. They can record a decision (reviewing, approved or declined) with a note, which the SME sees in the app. Set `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` (the same public key as the app's `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) so staff can sign in. A bank staff login is refused by the SME app and its API (`403`); `GET /me` reports whether a login is `sme` or `lender`.

**Access is by invitation only.** Banks cannot sign up: otherwise anyone could claim to be a bank and see businesses' data. The portal has Sign in and Forgot password only, and the app's login screen links bank staff to it ("Bank or MFI staff? Lender portal"). A bank login used in the app is shown the way to the portal.

To add a bank and invite its staff (recommended):

1. In Supabase, Authentication › URL Configuration › Redirect URLs, add the portal address (`http://localhost:8000/portal/`, or `PORTAL_URL` once deployed).
2. Put the project's secret (service role) key in `backend/.env` as `SUPABASE_SECRET_KEY`. Only this script uses it; never put it in the app or the portal.
3. From the `backend` folder, run:

```powershell
venv/Scripts/python.exe scripts/add_lender.py "ACLEDA Bank" loans@acleda.example --invite
venv/Scripts/python.exe scripts/add_lender.py --list
```

Each staff member gets an email. Its link opens the portal, where they choose their own password and go straight to their bank's applicants. FINEXT never sees or sends a password. Staff who forget theirs use **Forgot password?** on the portal.

Without the secret key, create the login by hand (Authentication › Users › Add user), then run the same command without `--invite`, and send the staff member the portal link.
