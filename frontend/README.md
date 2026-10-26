# Finext (mobile app)

Expo (React Native) + TypeScript + Expo Router + NativeWind. A bookkeeping and financial-health app for small businesses in Cambodia, in Khmer and English, with USD and KHR.

**The app is offline-first for bookkeeping and online for analysis.** It stores bookkeeping data locally and syncs it to the FastAPI development backend when connected.

Source documents (one folder up): `FINEXT_STYLE_GUIDE_MERGED.md` (visuals), `FINEXT_FINANCE_RULES.md` (accounting), `FINEXT_APP_MODULES_AND_FLOWS.md` (screens and flows). The screens were built from those files and the Figma file `iWtJcoDJn6HefdaGOTN8Pe` (page "App").

## Run it

```bash
npm install --legacy-peer-deps   # react-dom peer range conflicts with Expo 58; the flag is needed
npx expo start                   # then press a (Android) or i (iOS), or scan with a development build
npx tsc --noEmit                 # typecheck
```

### Sync with the local FastAPI backend

The app pushes pending SQLite rows and pulls server changes on launch, after local writes, when connectivity returns, and when the app resumes. For browser development on the same computer, the API defaults to `http://localhost:8000`.

For phone testing, start FastAPI so the phone can reach the computer on your Wi-Fi:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The app uses Expo's development host address when available. If using a tunnel or a custom network, set `EXPO_PUBLIC_API_URL=http://<computer-lan-ip>:8000` in `frontend/.env.local`, then restart Expo. The current backend store is in-memory and has no authentication or per-user isolation; use demo data only until persistent storage and authentication are added.

`expo-sqlite` needs a native build, so use a development build or Expo Go for SDK 58 on a device or emulator. The first launch creates `finext.db`, runs the migrations and seeds demo data.

**Test offline mode:** Profile → Setting → *Simulate offline* (or use airplane mode). Analysis screens then show the cached data with an "Offline · last updated …" banner; bookkeeping keeps working. *Reset demo data* in the same screen restores the sample data.

## Architecture

```
src/
  app/            Expo Router screens (one file per route). Screens call hooks and services only.
  components/     Reusable UI from the style guide (ScreenShell, BottomNav, BarChartCard, ...).
  hooks/          useNetworkStatus, useLocalQuery (bookkeeping), useAnalysisQuery (analysis), useSummary.
  services/
    bookkeeping/  OFFLINE. Reads/writes the local DB. Computes balances and totals on the device.
    analysis/     ONLINE + local cache. Mock server responses today (marked `// TODO: replace with server API`).
    sync/         Pushes pending SQLite rows and pulls server changes automatically.
    network.ts    Connectivity check shared by services and the hook.
  db/             expo-sqlite + Drizzle: schema.ts, migrations.ts, client.ts, seed.ts.
  theme/          Design tokens (style guide §13). The only place raw hex values exist.
  i18n/           en.ts (en-GB) and km.ts (Khmer). Every visible string goes through t().
  lib/            Pure helpers (date and axis formatting).
```

Dependency rules (verified with grep when this was written; keep them true):

| Layer | May import | Must not import |
|---|---|---|
| `app/`, `components/`, `hooks/` | `services/*`, `theme`, `i18n`, `lib` | `@/db`, `expo-sqlite`, `expo-network`, AsyncStorage |
| `services/bookkeeping` | `db`, `lib` | the network |
| `services/analysis` | `services/network`, AsyncStorage | `db` |
| `db` | `drizzle-orm`, `expo-sqlite` | services, UI |
| `components/` | colours only through `theme` tokens | raw hex or `rgba()` literals |

**Styling.** `src/theme/tokens.js` holds the style guide tokens; `tailwind.config.js` reads from it (NativeWind classes like `bg-primary-200`, `rounded-sheet`), and `src/theme/index.ts` exposes the same values to code (`colors`, `radius`, `shadow`, `textStyle`, `tint`). Colour on text is set with the `tone` prop of `<Text>`, never with className. Fonts: Poppins for Latin, Kantumruy Pro when the language is Khmer (Poppins has no Khmer glyphs).

**Navigation.** Every screen is a flat Stack route that renders its own `BottomNav` variant (`ScreenShell nav="..."`), matching the "Bottom Navigation - &lt;variant&gt;" components in Figma. `/` is a gate: onboarding finished → `/home`, otherwise `/launch`.

**Layout reminder for the Expo version:** routes live in `src/app/` (see `AGENTS.md`).

## Offline / online split

| | Bookkeeping (`services/bookkeeping`) | Analysis (`services/analysis`) |
|---|---|---|
| Source of truth | Local SQLite database | The server (mocked for now) |
| Works offline | Always, fully | Only from the last cached response |
| Computed where | On the device: account balances, income and expense totals, budget %, period totals, month overview | On the server: charts, targets, category breakdown, financial statements, notifications |
| Screens | Home totals and lists, Account Balance, Transactions, Calendar "Spends", Search, Bookkeeping overview, Add entry, Categories, Savings, Profile | Analysis (all four periods), Quick Analysis chart, My Targets, Calendar "Categories" donut, Financial Statements, Notifications, goal rings |

**How the analysis cache works** (`services/analysis/cache.ts`, one `withCache(key, fetcher)` for every call):

1. Online → call the server, store `{data, fetchedAt}` in AsyncStorage under `finext.analysis.v1:<key>`, return it with `source: 'network'`.
2. Offline, or the call fails → return the stored copy with `source: 'cache'`. Screens show `<OfflineBanner fetchedAt=…>` ("Offline · last updated 20 Oct, 14:32").
3. Offline and nothing cached → throws `NoCachedDataError`; screens show an empty state ("No saved data yet").
4. `useAnalysisQuery` re-runs when the connection returns, so cached screens refresh by themselves.

Every analysis function is `async` and returns `CachedResult<T>`: `getAnalysis(period)`, `getTargets()`, `getCategoryBreakdown()`, `getStatements()`, `getNotifications()`.

Connectivity comes from `expo-network` (`services/network.ts`, hook `useNetworkStatus`). The *Simulate offline* switch overrides it for testing.

## Database schema

Drizzle schema: `src/db/schema.ts`. The SQL that actually creates the tables is `src/db/migrations.ts` (versioned with `PRAGMA user_version`; append a new entry for every schema change, never edit a shipped one). The two are kept in step by hand; `drizzle-kit` is configured (`drizzle.config.ts`) if you would rather generate migrations.

**Columns on every table**

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | UUID v4 generated on the device (`expo-crypto`). Never autoincrement. |
| `created_at`, `updated_at` | integer | Epoch milliseconds. `updated_at` is bumped on every change. |
| `deleted_at` | integer, null | Soft delete. Rows are never physically removed. |
| `sync_status` | text | `'pending'` (default) or `'synced'`. Every local write sets `pending`. |

**Money** is stored as integers in minor units: USD in cents, KHR in riel, plus a `currency` column. There are no floats in the database or in the services. Conversion uses `exchange_rate` (KHR per 1 USD) stored on the transaction at entry time.

| Table | Columns (besides the common ones) |
|---|---|
| `banks` | `name`, `kind` (`cash` \| `bank` \| `wallet`), `logo_key` |
| `categories` | `name`, `icon` (key into `components/Icon.tsx`), `kind` (`expense` \| `income` \| `savings`), `built_in` |
| `transactions` | `title`, `type_id` (see `entryTypes.ts`), `direction` (`in` \| `out` \| `move`), `group_id`, `amount`, `currency`, `exchange_rate`, `pay_method` (`cash` \| `bank` \| `later`), `bank_id` → banks, `to_bank_id` → banks (moves), `category_id` → categories, `counterparty`, `note`, `occurred_at`, `review_flag`, `meta` (JSON: cost, lender, lender type, term, asset name, useful life, loan name, interest) |
| `business_assets` | `kind` (`cash_bank` \| `receivable` \| `inventory` \| `prepaid` \| `equipment` \| `other_long_term`), `name`, `bank_id`, `amount`, `currency`, `as_of`. Opening balances from onboarding. |
| `budgets` | `name`, `period` (`all` \| `monthly`), `target_amount`, `currency` |
| `settings` | One row, `id = 'app'`: `language` (`en-GB` \| `km`), `onboarding_status` (`not_started` \| `in_progress` \| `completed`), `start_option`, `display_currency`, `rate_khr_per_usd`, business profile fields, `push_notifications`, `dark_theme` |

Users always type positive numbers; `direction` decides the sign. Posted transactions are never edited or deleted in the UI.

**How the local numbers are computed** (`services/bookkeeping/index.ts`):

- **Account balance** = opening `cash_bank` assets + transactions paid by cash or bank (in +, out −, moves −source +destination). *Pay later* entries do not touch cash.
- **Total Balance** = all account balances converted to the display currency. **Total Income** = types that count as sales or other income. **Total Expense** = COGS + operating costs + loan interest + income tax; it excludes stock purchases, equipment, loan principal, owner drawings and transfers (finance rules §8.5). A product sale without a cost entered uses an estimated cost of 67% of the sale (rules Q4).
- **Budget bar** = Total Expense ÷ budget target; status switches to warning at 70% and danger at 100%.

**Seed data** (`src/db/seed.ts`, first launch and *Reset demo data*) mirrors the Figma screens: Total Balance $7,783.00, Total Expense −$1,187.40, budget $20,000, Employee Salary $4,000, Food Supplies −$100, Rent −$674.40, Transport −$4.13, other income $120 (Income $4,120.00), banks Cash / KB PRASAC / ABA / Wing, the eight spending categories and four savings goals. Seed dates are relative to today so the Daily / Weekly / Monthly views always have data.

## Remaining backend work

### Sync persistence and account isolation

The app now automatically pushes pending local rows to `POST /sync/push` and pulls changes from `GET /sync/changes`, using a saved cursor and last-writer-wins for newer local edits. It triggers on launch, local writes, network reconnect, and app resume.

The current FastAPI implementation still uses a process-local in-memory dictionary. It loses data on server restart and shares one namespace across all devices. Login and signup are UI-only. Before inviting multiple people or using real financial data, replace the store with persistent per-user storage (for example Supabase Postgres) and add authentication and authorization.

### Analysis API (`src/services/analysis/`)

Replace the mock bodies (`mock.ts`) with HTTP calls. Keep the function signatures and return shapes in `types.ts`; the cache wrapper stays as is. Each function carries a `// TODO: replace with server API` comment with a suggested route:

| Function | Suggested route | Returns |
|---|---|---|
| `getAnalysis(period)` | `GET /analysis?period=daily\|weekly\|monthly\|yearly` | `AnalysisResult`: `labels[]`, `income[]`, `expense[]` (minor units), `totals` |
| `getTargets()` | `GET /targets` | `Target[]` (`product-sale`, `profit-goals`, `savings-goals`, each with `percent`) |
| `getCategoryBreakdown()` | `GET /analysis/categories` | `CategorySlice[]` (name, percent, amount) |
| `getStatements()` | `GET /statements?period=` | `Statements`: Income Statement, Balance Sheet and Cash Flow as generic sections of lines (`current`, optional `prior`, style `line \| subtotal \| total`), KPI tiles, check strip |
| `getNotifications()` | `GET /notifications` | `AppNotification[]` |

Notes for the server:

- Statements are derived from the ledger (finance rules §§3–8: chart of accounts, posting rules, statements, the §8.4 sample must reproduce exactly). The server therefore needs the double-entry engine; the device does not post journal entries in this build.
- All money is integer minor units. Labels are English strings today; add Khmer or send keys (the app has `i18n` for its own labels but not for server labels).
- Ratios and the health-manager alerts (finance rules §§9–10) are not in the app yet; the server is the natural place to compute them (online analysis), except the "every entry" triggers (cash short, sales spike, new loan while weak), which are meant to run on the device.
- Return fast and cache-friendly responses; the app shows the last response when offline and re-fetches when the connection returns.

## What is built and what is not

**Built:** launch, Log In and Sign Up (UI only), onboarding (welcome, language, start option, business profile, current assets with opening balances), Home, Account Balance, Quick Analysis, Analysis (Daily / Weekly / Monthly / Year), Search, Calendar (Spends / Categories), Transactions, Bookkeeping overview (grouped by month), **Add an entry** (all 19 types plus Move money, KHR | USD switch, impact strip, Pay later rules, validation), Categories and Savings goals (with the New dialog), Financial Statements tiles and the three statements, Notifications, Profile menu, Edit Business Profile, Setting (language, display currency, exchange rate, offline tools), Khmer and English strings.

**Not built (documented gaps, not hidden ones):**

- No journal entries. The device stores one row per transaction and computes totals from the transaction types. Opening-balance posting, depreciation, accruals, reversals ("Reverse / Correct"), mark-as-paid, refunds and open items (owed to me / I owe), loan and asset records are not implemented, and the Pay later entry only records the party and keeps cash unchanged.
- Auth, Forgot Password, PIN and fingerprint, Security, Help and Online Support screens, Delete Account.
- Onboarding steps for non-current assets, liabilities, equity, revenue and operating expenses (only current assets are collected).
- Financial-health ratios and the AI manager triggers.
- PDF export (the Download PDF button explains this), "Add New Template", savings-goal detail and category-detail screens, dark theme (the toggle only stores the preference), push notifications.
- Notifications are mock server data, so there is no read/unread state.
- The welcome illustration (soft 3D coins) and bank logos are placeholders; flags are drawn in SVG.

## Known deviations and decisions

- **Budget percentage.** The Figma screens show "30%" next to $20,000 with $1,187.40 spent, which does not add up (it is 6%). The app computes the real percentage from the data, so the seed shows 6%. The "30%" ring and target values come from the analysis mock.
- **Progress bar fill is black everywhere** (style guide §6.3); the Figma Home screen uses blue.
- **Selected-state inset shadow** (`shadow-inner-selected`) has no React Native equivalent; selected chips and tabs use the filled style plus the button shadow.
- **Expense colour.** Expense amounts use `accent-expense` with a minus sign (style guide §15). Semantic colours are used for fills and strips only, except the budget status line on the hero.
- **Khmer text** gets 20% more line height than the type scale so it is never clipped.
- The style guide file is `FINEXT_STYLE_GUIDE_MERGED.md` (the request called it `FINEXT_STYLE_GUIDE.md`).
- Bookkeeping groups (`overview`) use the transaction type's group, not the user's spending category.

## Verification done

Typecheck (`npx tsc --noEmit`), `expo-doctor` (20/20), a Metro/Hermes Android export, a script that creates the tables from `migrations.ts` in SQLite and checks every column against `schema.ts`, and runtime checks of the money formatting/parsing and Pay later rules. The screens have **not** been run on a device or emulator in this environment, so expect some layout tuning against the Figma frames at 375, 390 and 430 widths.
