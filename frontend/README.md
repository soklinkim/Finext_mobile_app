# Finext (mobile app)

Expo (React Native) + TypeScript + Expo Router + NativeWind. A bookkeeping and financial-health app for small businesses in Cambodia, in Khmer and English, with one currency per business (USD or KHR).

**The app is hybrid: offline-first for bookkeeping, online for analysis.** Every entry is written to a local SQLite database first, so bookkeeping works with no connection. A background sync pushes changes to the FastAPI backend (Supabase Postgres, per-user) and pulls what is new. Statements, ratios and risk results are calculated on the server and shown from a cache when offline. Sign-in is Supabase Auth.

Source documents (one folder up): `FINEXT_STYLE_GUIDE_MERGED.md` (visuals), `FINEXT_FINANCE_RULES.md` (accounting), `FINEXT_APP_MODULES_AND_FLOWS.md` (screens and flows, with "Current build" notes where the product has moved on from the original design) and `STATEMENT_TERMS_REVIEW.md` (statement wording against the Cambodian IFRS for SMEs reference).

## Run it

```bash
npm install --legacy-peer-deps   # react-dom peer range conflicts with Expo 58; the flag is needed
npm run dev                      # one server for the browser (http://localhost:8081) and a phone (QR code)
npx tsc --noEmit                 # typecheck
```

Create `frontend/.env.local` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the public key, never the secret one). Optionally set `EXPO_PUBLIC_API_URL` (see below). Restart Expo after changing it. The backend needs `backend/.env` too: see [`../backend/README.md`](../backend/README.md).

### Sync with the local FastAPI backend

For browser development on the same computer, the API defaults to `http://localhost:8000`. For phone testing, start FastAPI so the phone can reach the computer on your Wi-Fi:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The app uses Expo's development host address when available. If using a tunnel or a custom network, set `EXPO_PUBLIC_API_URL=http://<computer-lan-ip>:8000` in `frontend/.env.local`, then restart Expo.

**Phone says "Can't reach the FINEXT server" (Windows Firewall blocks Python):** start the app with `npm run dev` (same as `npm run phone`) instead of `npx expo start`. It runs a small Node relay on port 8001 that passes requests to the API on `localhost:8000`; Windows allows Node (it already serves Expo), so no firewall change or administrator rights are needed. The relay is reachable by other devices on the same Wi-Fi while it runs, like the API itself would be; stop it (Ctrl+C) when done, and avoid running it on public Wi-Fi. For a demo away from your own network, host the API online.

Open the web app in only one browser tab at a time (the browser lets one copy use the offline database). `expo-sqlite` needs a native build, so use a development build or Expo Go for SDK 58 on a device or emulator. The first launch creates `finext.db`, runs the migrations and seeds the starting rows (a Cash account, three sample bank / wallet accounts and the starting categories).

**Test offline mode:** Profile → Settings → *Simulate offline* (or use airplane mode). Analysis screens then show the cached data with an "Offline · last updated …" banner; bookkeeping keeps working.

## Architecture

```
src/
  app/            Expo Router screens (one file per route). Screens call hooks and services only.
  components/     Reusable UI from the style guide (ScreenShell, BottomNav, FieldLabel, MonthPickerModal, EvidenceSection, ...).
  hooks/          useNetworkStatus, useLocalQuery (bookkeeping), useAnalysisQuery (analysis), useSummary.
  services/
    bookkeeping/  OFFLINE. Reads/writes the local DB (entries, accounts, evidence photos, loans list, totals).
    analysis/     ONLINE + local cache. Calls the backend; keeps the last answer for offline use.
    sync/         Pushes pending SQLite rows and pulls server changes automatically.
    auth.ts       Supabase Auth, and the check that a device's offline ledger belongs to one account.
    documents.ts  Business registration documents (online only) and the photo picker shared with evidence.
    evidenceFiles.ts   Turns a picked photo into a small data URI for an entry.
    statementPdf.ts, loanPackPdf.ts, finextMark.ts   Printable statement and loan pack pages (with the Finext mark).
    preferences.ts     Small device preferences (simple terms, dismissed warnings).
    network.ts    Connectivity check shared by services and the hook.
  db/             expo-sqlite + Drizzle: schema.ts, migrations.ts, client.ts, seed.ts.
  theme/          Design tokens (style guide §13). The only place raw hex values exist.
  i18n/           en.ts, km.ts (every visible string goes through t()), plain.ts (simple words), standardKm.ts (standard Khmer for server labels).
  lib/            Pure helpers (date and axis formatting, confirm dialogs).
```

Dependency rules (keep them true):

| Layer | May import | Must not import |
|---|---|---|
| `app/`, `components/`, `hooks/` | `services/*`, `theme`, `i18n`, `lib` | `@/db`, `expo-sqlite`, `expo-network`, AsyncStorage |
| `services/bookkeeping` | `db`, `lib` | the network |
| `services/analysis` | `services/network`, AsyncStorage | `db` |
| `db` | `drizzle-orm`, `expo-sqlite` | services, UI |
| `components/` | colours only through `theme` tokens | raw hex or `rgba()` literals |

**Styling.** `src/theme/tokens.js` holds the style guide tokens; `tailwind.config.js` reads from it (NativeWind classes like `bg-primary-200`, `rounded-sheet`), and `src/theme/index.ts` exposes the same values to code (`colors`, `radius`, `shadow`, `textStyle`, `tint`). Colour on text is set with the `tone` prop of `<Text>`, never with className. Fonts: Poppins for Latin, Kantumruy Pro when the language is Khmer (Poppins has no Khmer glyphs).

**Navigation.** Every screen is a flat Stack route that renders its own `BottomNav` variant (`ScreenShell nav="..."`). `/` is a gate: onboarding finished → `/home`, otherwise the onboarding flow. Routes live in `src/app/` (see `AGENTS.md`).

## Wording, language and currency

- **Language** is `settings.language` (`en-GB` or `km`). Every string goes through `t()`.
- **Finance words:** the owner chooses *standard* terms or *simple* everyday words at setup (device preference `plainLanguage`, read through `useI18n().plain`). `plain.ts` holds the simple wording for the app's own texts (`PLAIN_KEYS`) and for labels the server sends (`TERMS`). `useI18n().term(label)` translates a server label: simple words when simple terms are on, otherwise the official Khmer from `standardKm.ts` in Khmer, otherwise the label as sent.
- **Field names show the other wording.** `components/FieldLabel.tsx` (used by TextField, SelectField and CurrencyInput) asks `useI18n().alt(label)` for the other wording and shows a small (i) with it. Never put the (i) inside another button: on web a button cannot contain a button.
- **Financial statements are always standard.** `StandardTerms` (in `i18n/index.tsx`) re-provides the i18n context with simple terms off; the statements screens are wrapped in it.
- **One currency per business.** `settings.display_currency` is chosen at setup and changeable in Settings only while `canChangeCurrency()` is true (no entries, opening balances, budgets or opening figures). There is no currency switch on amounts and no exchange-rate setting in the UI; `rate_khr_per_usd` stays in the data to convert older entries recorded in the other currency.

## Forms

- `ScreenShell` handles the keyboard: it adds the keyboard's height to the bottom padding (on Android and web) and scrolls the focused field into view.
- **Required fields** (`required` prop on TextField / SelectField) show a red `*`. When a screen's main (primary) button is pressed and a field has an error, `components/FieldFocus.tsx` scrolls to the topmost field with an error and puts the cursor in it.
- Password fields show the eye as a state (open = visible), with word placeholders, not dots.

## Evidence photos on entries

Any entry can carry up to 5 photos (a receipt or invoice): `components/EvidenceSection.tsx` (Add Entry keeps them as drafts until the entry is saved; the entry detail page adds, views and removes them). They are stored as base64 data URIs in the local table `entry_attachments` (`services/bookkeeping/evidence.ts`) and **stay on the device: they are not synced to the server yet**. Photos are shrunk to a JPEG no wider than 2000 px. Only photos are supported, not PDFs.

## One account per device

The offline ledger is one database per device, so a device holds one account's data. After sign-in or sign-up, `bindLocalLedger` (in `services/auth.ts`) records the account that owns the device (`@finext.auth.local-owner.v1`). A different account is refused with `LocalLedgerOwnedError`. Sign-up checks this *before* the account is created. The login and sign-up screens then show `LedgerConflictNotice`, which offers to erase the device's data (`resetLocalLedger`: the local tables, the saved sync position, the cached analysis and the saved check-in answers) after a confirmation that says how many unsynced changes would be lost. A separate local database per account would remove the limit; it is not built.

## Offline / online split

| | Bookkeeping (`services/bookkeeping`) | Analysis (`services/analysis`) |
|---|---|---|
| Source of truth | Local SQLite database | The server |
| Works offline | Always, fully | Only from the last cached response |
| Computed where | On the device: entry lists, the Bookkeeping overview totals for the chosen months, filters and search, loan list | On the server: Home and Account Balance totals, charts, targets, category breakdown, financial statements, ratios, risk, loan readiness, notifications |
| Screens | Bookkeeping overview, Add entry, Transactions (with filters), Entry detail, Calendar "Spends", Quick Analysis tiles and recent entries | Home, Account Balance, Analysis, Quick Analysis chart, Calendar "Categories" (for the month shown in the calendar), Financial Statements, Financial Health, Loan, Notifications |

**How the analysis cache works** (`services/analysis/cache.ts`, one `withCache(key, fetcher)` for every call):

1. Online → call the server, store `{data, fetchedAt}` in AsyncStorage under `finext.analysis.v2:<key>`, return it with `source: 'network'`.
2. Offline, or the call fails → return the stored copy with `source: 'cache'`. Screens show `<OfflineBanner fetchedAt=…>`.
3. Offline and nothing cached → throws `NoCachedDataError`; screens show an empty state.
4. `useAnalysisQuery` re-runs when the connection returns, so cached screens refresh by themselves.

Connectivity comes from `expo-network` (`services/network.ts`, hook `useNetworkStatus`). The *Simulate offline* switch overrides it for testing.

## Sync

`services/sync` pushes rows with `sync_status = 'pending'` to `POST /sync/push` and pulls changes from `GET /sync/changes` with a per-user cursor (last-writer-wins for newer local edits). `BackgroundSync` in `app/_layout.tsx` runs it about a third of a second after a local change, every 30 seconds while the app is open and connected (the heavier health-alert refresh runs only when something was sent or received), when the connection returns, when the app returns to the foreground, and at login (the profile is fetched first, so a new device does not send an owner who finished onboarding elsewhere through onboarding again).

Synced tables: `banks`, `categories`, `transactions`, `business_assets`, `budgets`, `settings`, `onboarding_financial_entries`. **Not synced:** `entry_attachments` (evidence photos) and the small device preferences. Profile › Cloud sync has a **Sync now** button and shows when this device last synced (`getLastSynced`, kept per account in AsyncStorage); offline it shows that time instead of "everything is synced". An entry detail says "Not synced" while pending.

## Database schema

Drizzle schema: `src/db/schema.ts`. The SQL that actually creates the tables is `src/db/migrations.ts` (versioned with `PRAGMA user_version`; append a new entry for every schema change, never edit a shipped one). The two are kept in step by hand; `drizzle-kit` is configured (`drizzle.config.ts`) if you would rather generate migrations.

**Columns on every table**

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | UUID v4 generated on the device (`expo-crypto`). Never autoincrement. |
| `created_at`, `updated_at` | integer | Epoch milliseconds. `updated_at` is bumped on every change. |
| `deleted_at` | integer, null | Soft delete. Rows are never physically removed. |
| `sync_status` | text | `'pending'` (default) or `'synced'`. Every local write sets `pending`. |

**Money** is stored as integers in minor units: USD in cents, KHR in riel, plus a `currency` column. There are no floats in the database or in the services. `exchange_rate` (KHR per 1 USD) is stored on the transaction at entry time and used only to convert entries recorded in the other currency.

| Table | Columns (besides the common ones) |
|---|---|
| `banks` | `name`, `kind` (`cash` \| `bank` \| `wallet`), `logo_key` |
| `categories` | `name`, `icon`, `kind` (`expense` \| `income` \| `savings`), `built_in`, target columns. Still stored and synced, but no screen shows or picks them any more: entries are classified by their type. |
| `transactions` | `title`, `type_id` (see `entryTypes.ts`), `direction` (`in` \| `out` \| `move`), `group_id`, `amount`, `currency`, `exchange_rate`, `pay_method` (`cash` \| `bank` \| `later`), `bank_id` → banks, `to_bank_id` → banks (moves), `category_id` → categories (now always empty for new entries), `counterparty`, `note`, `occurred_at`, `review_flag`, `meta` (JSON: cost, lender, lender type, term, rate, asset name, useful life, loan name, interest) |
| `entry_attachments` | `transaction_id` → transactions, `file_name`, `mime_type`, `size_bytes`, `data` (base64 data URI). Device only. |
| `business_assets` | `kind` (`cash_bank` \| `receivable` \| `inventory` \| `prepaid` \| `equipment` \| `other_long_term`), `name`, `bank_id`, `amount`, `currency`, `as_of`. Opening balances from onboarding. |
| `budgets` | `name`, `period` (`all` \| `monthly`), `target_amount`, `currency` |
| `onboarding_financial_entries` | `section`, `entry_key`, `amount`, `currency`, `as_of`, period dates. Opening liabilities, equity and income-statement figures. |
| `settings` | One row, `id = 'app'`: `language`, `onboarding_status`, `start_option`, `display_currency` (the business's one currency), `rate_khr_per_usd`, business profile fields, `push_notifications`, `dark_theme` |

Users always type positive numbers; `direction` decides the sign. **Entries can be edited and deleted** (a deliberate change from the original "reverse only" rule): `updateEntry` changes the row in place and `deleteEntry` soft-deletes it (`deleted_at`) together with the payments, write-offs and reversals that point at it and its receipt photos; the deletion syncs like any change. Payments, write-offs, reversals and loans cannot be edited, an entry with payments cannot be edited, and a loan with repayments cannot be deleted. `reverseEntry` still exists but no screen uses it.

**How the local numbers are computed** (`services/bookkeeping/index.ts`):

- **Account balance** = opening `cash_bank` assets + transactions paid by cash or bank (in +, out −, moves −source +destination). *Pay later* entries do not touch cash.
- **Bookkeeping overview** (`getMonthsOverview`) adds the entries of the chosen months (one or several, not necessarily next to each other), grouped by entry group. Transfers, payments and reversals are left out. "Money in" and "Left over" are plain sums: they include owner's money put in, loans and unpaid sales.
- **Total Expense** (server, shown on the hero) = COGS + operating costs + loan interest + income tax; it excludes stock purchases, equipment, loan principal, owner drawings and transfers (finance rules §8.5). A product sale without a cost entered uses an estimated cost of 67% of the sale (rules Q4), so it is an accounting figure, not cash paid.

## What is built and what is not

**Built:** launch, Log In, Sign Up (two steps: business details and review), Forgot password, one-screen setup (language, finance words, currency), onboarding (start option, business profile, opening balances: assets including property / equipment / vehicles and added long-term assets, liabilities with several lenders, equity, and income figures for an existing business), Home, Account Balance, Quick Analysis, Analysis, Calendar (green / yellow / red days, expenses by category for the month), Transactions (a date or date range, several categories at once, "Missing records", "Recent Entries" in the order they were recorded; the old Search screen redirects here), Bookkeeping overview with a multi-month picker, **Add an entry** (all entry types plus Move money, impact strip, Pay later rules, loan repayment against recorded loans, optional photo evidence, validation that scrolls to the first missing field), entry detail (mark as paid, write off, edit, delete, evidence), bank statement import (account summary, a type chosen for every entry, search and bulk type, leftovers can be continued),  reminders and missed-day pop-ups, tap-to-see-the-formula sheets in Analysis and the statements, Financial Statements (three statements, weekly and monthly reports, PDF download, standard terms in English and Khmer), Financial Health, Loan readiness and sharing, Loan application pack, Notifications, Profile, Edit profile, Security (change password, sign out everywhere), Settings, Policies, Help, simple and standard finance wording with explanations.

**Not built (known gaps):**

- Evidence photos and device preferences are not synced, and reminders are kept on the device only.
- Photo evidence only (no PDFs), and it is not included in statements or the loan pack.
- A separate local database per account (one account per device today).
- PIN and fingerprint, Delete account, Online Support chat, push notifications. Reminders only fire while the app is open (a phone alarm needs `expo-notifications` and a development build).
- Statement of Changes in Equity, Notes to the statements and current / non-current subtotals (see `STATEMENT_TERMS_REVIEW.md`); the downloadable statement page and PDF are English only.
- Formulas for the health score, loan readiness, risk and forecast figures (they come from the server's models); health ratios show their formula but not the figures behind it.
- Khmer text added for these features was written without a native speaker and needs review before release.
- A dedicated "Owed to me / I owe" list (the Transactions "Unpaid" filter is the closest).

## Notes and decisions

- **Expense colour.** Expense amounts use `accent-expense` with a minus sign (style guide §15). Semantic colours are used for fills and strips only.
- **Khmer text** gets 20% more line height than the type scale so it is never clipped.
- The style guide file is `FINEXT_STYLE_GUIDE_MERGED.md`.
- Bookkeeping groups use the entry type's group.
- New Khmer text written for the app (not taken from the Cambodian reference) is marked in `STATEMENT_TERMS_REVIEW.md` and needs a native speaker's review.

## Verification

`npx tsc --noEmit` is run after every change. The screens have **not** been run on a physical device in the environment this document was last updated in, so check layouts at 375, 390 and 430 widths.
