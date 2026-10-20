# Finext — UI Style Guide (merged)

> Merged edition: the original guide (dashboard, analysis, calendar, charts, onboarding) plus the bookkeeping entry flow, financial statements, business profile, currency switch and accounting rules. Where the two guides disagreed, the decisions are listed in §15.

> **For Claude Code:** This is the source of truth for building the Finext mobile UI (a digital bookkeeping app for small businesses in Cambodia, bilingual Khmer / English). Use these tokens and component specs exactly. Do not introduce new colors, fonts, radii or shadows. When a value is not specified here, pick the closest existing token. Values marked *(approx.)* were measured from mockups. Keep them consistent rather than "fixing" them.

---

## 1. Design Principles

1. **Calm blue, high clarity.** The UI uses one blue family on white. Color carries meaning (income vs. expense, active vs. inactive). It is not decoration.
2. **Two-layer layout.** Every screen has a light-blue **hero band** at the top and a white **sheet** with large rounded top corners that slides over it.
3. **Soft and rounded.** Use pill buttons, rounded tiles and generous radii. There are no sharp corners anywhere except the full-screen edge.
4. **Numbers first.** Balances and amounts are the largest, boldest text on a screen.
5. **Bilingual by default.** Every string must be localizable (Khmer + English UK). Layouts must tolerate Khmer text, which is taller and often longer.

---

## 2. Color Tokens

### 2.1 Primary / Brand (from `Color style.svg`)

| Token | Hex | Usage |
|---|---|---|
| `primary-900` | `#0D47A1` | Titles, headings, active nav item, selected buttons, positive amounts, input text |
| `primary-500` | `#2196F3` | Accent text, calendar weekday headers, icon tiles |
| `primary-200` | `#90CAF9` | **Hero band background**, selected segment pill, income chart bars, page-dot (active), icon buttons |
| `primary-50`  | `#E3F2FD` | Inputs, unselected buttons, segmented control track, chart cards, bottom nav background, bell button |

### 2.2 Neutral (from `Color style.svg`)

| Token | Hex | Usage |
|---|---|---|
| `neutral-900` | `#343434` | Body text, "Next" text button, labels on white |
| `neutral-600` | `#898989` | Secondary text, placeholders |
| `neutral-500` | `#989898` | Disabled text, helper text |
| `neutral-300` | `#CACACA` | Borders, dividers on white |
| `neutral-200` | `#E0E0E0` | Subtle dividers, skeleton loaders |
| `white`       | `#FFFFFF` | Sheet background, cards on blue, balance numbers on hero |

### 2.3 Semantic (from `Color style.svg`)

| Token | Hex | Usage |
|---|---|---|
| `danger`  | `#FF4267` | Errors, validation messages, destructive actions, over-budget |
| `warning` | `#FFAF2A` | Warnings, budget approaching limit |
| `success` | `#52D5BA` | Success toasts, "Looks good" states, goal reached |
| `alert`   | `#FB6B18` | Notifications badge, attention / pending items |

### 2.4 Supporting blues (used in mockups, not in the palette sheet)

| Token | Hex *(approx.)* | Usage |
|---|---|---|
| `accent-expense` | `#0068FF` | Expense amounts, expense chart bars, transaction date/time, progress-ring arc |
| `accent-tile`    | `#6CB4FF` | Target cards, Financial Statements tiles, light icon tiles |
| `accent-tile-strong` | `#3D9BFF` | Mid-tone transaction icon tiles |

### 2.5 Special

| Token | Hex | Usage |
|---|---|---|
| `progress-fill` | `#000000` | Fill of the budget progress bar (black pill with white % label) |

### 2.6 Color rules

- **Income / positive** amounts → `primary-900`. **Expense / negative** amounts → `accent-expense`, always prefixed with `-`.
- **Chart pairs:** income = `primary-200`, expense = `accent-expense`.
- Text on `primary-200` hero: titles `primary-900`, big numbers `white`, the "Finext" wordmark word `primary-50`.
- Never use semantic colors for decoration. Use them only for status.

---

## 3. Typography

**Font family:** `Poppins` (Google Fonts) for Latin text.
**Khmer fallback:** `Kantumruy Pro` (or `Noto Sans Khmer`). Use stack `'Poppins', 'Kantumruy Pro', sans-serif`.

| Token | Size / Line height | Weight | Usage |
|---|---|---|---|
| `display`      | 28 / 38 | 600 | Onboarding titles ("Welcome To Finext", "Select Language") |
| `title-lg`     | 26 / 36 | 600 | "Next" text button, form screen title ("1. Enter Business Assets") |
| `title`        | 20 / 30 | 600 | Screen header title ("Account Balance", "Analysis") |
| `amount-xl`    | 24 / 32 | 700 | Total Balance / Total Expense on hero |
| `amount-lg`    | 20 / 28 | 600 | Income/Expense summary amounts, card amounts |
| `section`      | 20 / 28 | 600 | Section headers on sheet ("Transactions", "April", "March") |
| `body-lg`      | 16 / 24 | 500 | Button labels, list titles, stat labels |
| `body`         | 15 / 22 | 500 | Transaction title, chart card title |
| `body-sm`      | 13 / 20 | 400 | Category column, field labels |
| `caption`      | 12 / 18 | 500–600 | Transaction date/time, tile labels, hero labels |
| `micro`        | 11 / 16 | 400 | Status bar, chart axis labels |

Rules:
- Amounts use **tabular numbers** (`font-variant-numeric: tabular-nums`).
- Sentence or Title Case as shown. Never ALL CAPS, except the small form sub-header `CURRENT ASSETS` (13/600, `primary-900`).
- The "Next" text button and its heading have a soft text shadow: `0 4px 4px rgba(0,0,0,0.25)`.

---

## 4. Spacing, Radius, Elevation

### 4.1 Spacing scale (4-pt grid)
`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

- Screen horizontal padding: **24px** (onboarding buttons), **36px** (lists and cards inside sheet) *(approx.)*.
- Gap between list rows: **16px**. Gap between form groups: **24px**.

### 4.2 Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm`   | 10px | Icon buttons in chart cards (search, calendar) |
| `radius-field` | 12px | Text inputs on entry forms, subtotal rows |
| `radius-md`   | 18px | Transaction icon tiles, active nav item, segment pill, group cards |
| `radius-lg`   | 20px | Inputs, small cards |
| `radius-xl`   | 22px | Statement tiles, segmented control track |
| `radius-2xl`  | 40px | Chart cards, target cards, summary cards on hero (16px for the white Income/Expense cards) |
| `radius-sheet`| 72px | Top-left / top-right of the white sheet *(approx.)* |
| `radius-pill` | 999px | Primary buttons, progress bar, chips |
| Device frame  | 40px | Outer screen corners (mockup only) |

### 4.3 Elevation

| Token | Value | Usage |
|---|---|---|
| `shadow-soft` | `0 4px 30px rgba(54, 41, 183, 0.07)` | Cards and swatches (from palette file) |
| `shadow-button` | `0 4px 4px rgba(0, 0, 0, 0.25)` | Pill choice buttons, primary buttons, bank selector chip |
| `shadow-inner-selected` | `inset 0 4px 4px rgba(0, 0, 0, 0.25)` | Any **selected** tab, chip, currency segment, active nav pill (matches the components library) |
| `shadow-footer` | `0 -4px 12px rgba(13, 71, 161, 0.10)` | Sticky footer above the bottom nav on entry screens |

---

## 5. Layout & Screen Anatomy

**Reference frame:** 430 × 932 (iPhone 14/15 Pro Max). Build responsive and test at 375 and 390 widths too.

```
┌───────────────────────────────┐
│ Status bar (16:04 …)          │  bg: primary-200
│ ← back    Title     (🔔)      │  Header row, height ~56
│                               │
│  HERO BAND (primary-200)      │  summary, balances, progress
│                               │
│ ╭───────────────────────────╮ │  White SHEET, radius-sheet top corners
│ │  Sheet content            │ │  starts at y ≈ 283–435 depending on screen
│ │                           │ │
│ ╰───────────────────────────╯ │
│ ╭───────────────────────────╮ │  Bottom nav, primary-50, radius 60 top
│ │  🏠   🔍📊   ✏️   ≋   👤   │ │
│ ╰───────────────────────────╯ │
└───────────────────────────────┘
```

- **Hero band:** `primary-200` (Financial Statements screen uses `accent-tile` hero).
- **Sheet:** `white`, overlaps hero, scrolls independently. Content padding-top 32px.
- **Onboarding screens:** no header row, no bottom nav. Title centered in hero; "Next" pinned near the bottom of the sheet.

---

## 6. Components

### 6.1 Header bar
- Left: back arrow icon (24px, `primary-900`; `primary-50` on Calendar).
- Center: title, `title` token, `primary-900`.
- Right: bell button, 32px circle, `primary-50` bg, bell icon 18px `primary-900`.

### 6.2 Balance summary (hero)
- Two columns separated by a 1px vertical `white` divider (height ~40).
- Label: `caption`, `neutral-900`, with a 12px outlined arrow-in-square icon (↗ balance / ↘ expense).
- Value: `amount-xl`. Balance = `white`, Expense = `accent-expense`.

### 6.3 Budget progress bar
- Height 28, `radius-pill`, track `white`, fill `progress-fill` (black).
- Inside fill: percentage `caption`/500 `white`, left-aligned with 16px padding.
- Right end of track: target amount, `caption` italic 500, `neutral-900`.
- Below: status caption with check-square icon, `body-sm`/500 `neutral-900` — e.g. "30% Of Your Expenses, Looks Good." Switch icon/text color to `warning` at ≥70% and `danger` at ≥100%.

### 6.4 Income / Expense stat cards
- **On hero (Dashboard):** two white cards, 170 × 100, radius 16, centered content: outlined arrow-square icon 28px (income `primary-200`, expense `primary-900`), label `body-lg` `primary-900`, amount `amount-lg` (income `primary-900`, expense `accent-expense`).
- **On sheet (Analysis):** same content, no card background, two centered columns.

### 6.5 Transaction row
```
[Icon tile] Title             │ Category │   Amount
            18:27 - April 30  │          │
```
- Icon tile: 56 × 56, `radius-md`, background one of `accent-tile`, `primary-500`, `accent-tile-strong`; icon 28px `white` line icon.
- Title: `body` `neutral-900` (black). Subtitle: `caption`/600 `accent-expense`.
- Two 1px vertical dividers, `primary-200`, height ~36.
- Category: `body-sm` `neutral-900`, centered.
- Amount: `body` right-aligned. Positive `primary-900`, negative `accent-expense` with `-`.
- Row height ~70, gap 16.
- Group by month with a `section` header in `primary-900` ("April", "March").

### 6.6 Segmented control (Daily / Weekly / Monthly / Year)
- Track: `primary-50`, `radius-xl`, height ~60, full width minus 36px padding.
- Item: `body-lg`/400 `neutral-900`.
- Active: pill `primary-200`, `radius-md`, inset 4px, text `neutral-900`.

### 6.7 Chart card (bar chart)
- Container: `primary-50`, `radius-2xl`, padding 24.
- Title: `body` `primary-900`, top-left.
- Top-right: two icon buttons (search, calendar), 32 × 32, `primary-200` bg, `radius-sm`, icon `primary-900`.
- Y-axis labels: `micro`, `primary-500`, values `1k, 5k, 10k, 15k`.
- Gridlines: 1px dotted `primary-200`.
- Bars: paired, width 6px, gap 6px, rounded top (3px). Income `primary-200`, expense `accent-expense`.
- X-axis: 1px solid `primary-900` baseline; labels `caption`/400 `primary-900` (Mon–Sun, 1st–4th Week, Jan–Jun).

### 6.8 Half-donut chart (Categories)
- 180° semicircle, segments separated by 3px `white` gaps.
- Segment colors in order: `accent-expense`, `accent-tile`, `primary-500`.
- Percentage labels inside segments: `body-lg`/600 `white`.
- Legend below: 8px dot + label `caption`/600 `primary-900`.

### 6.9 Target / goal card
- 170 × 170, `accent-tile` bg, `radius-2xl`.
- Progress ring: 100px diameter, 3px stroke, track `primary-50`, arc `accent-expense`, starts at 12 o'clock and runs clockwise.
- Center: percentage `amount-lg` `white`. Label below the ring: `body` `primary-50`.
- **Savings on goals (hero variant):** 100px ring on `primary-200`, icon (car) inside in `primary-900`, label under in `primary-900`.

### 6.10 Buttons

| Variant | Spec |
|---|---|
| **Choice – selected** | Pill, height 84, full width (−48px), bg `primary-900`, text `body-lg`/600 `white`, `shadow-button` |
| **Choice – unselected** | Same size, bg `primary-50`, text `primary-900`, `shadow-button` |
| **Choice with flag** | 60px circular flag image inset 14px left; label centered in the remaining space |
| **Choice with info** | 14px filled info icon to the right of the label (`primary-50` on dark, `primary-900` on light) — tap shows tooltip |
| **Text button "Next"** | No background, `title-lg` `neutral-900`, text shadow, centered, min tap area 48 × 48 |
| **Text link** | `body-sm`/500 `neutral-900`, e.g. "Add More Bank", "See all" (`primary-900`) |

Choice buttons behave as a **single-select radio group**: tapping one selects it and deselects the others. "Next" is disabled (`neutral-500`) until a choice is made.

### 6.11 Form inputs (Business Assets)
- Field label: `body`/500 `primary-900`, optional info icon (16px circle, `primary-50` bg, `primary-900` "!").
- Input: height 40, `primary-50` bg, `radius-lg`, padding 0 20px, no border. Text `body`/500 `primary-900`.
- **Currency input:** amount on the left, currency code (`KHR` / `USD`) right-aligned `body`/500 `neutral-900`. KHR amounts use the `៛` symbol suffix; USD uses `$` prefix. Each asset group shows a **KHR row and a USD row**.
- **Date input:** placeholder `DD/MM/YY`, right-aligned 24px calendar icon button (`primary-200` bg, radius 6).
- **Bank selector chip:** white pill, height 32, `shadow-button`, 24px bank logo + bank name `body-sm`/600 `primary-900` + chevron-down.
- Focus: 2px `primary-500` outline. Error: 2px `danger` outline + helper text `caption` `danger` beneath.

### 6.12 Page indicator (onboarding)
- 12px dots, 16px gap. Active: filled `primary-200`. Inactive: 2px ring `primary-900`, transparent fill.

### 6.13 Calendar
- Month & year dropdowns: `body-lg`/400 `primary-200` with chevron.
- Weekday header (Mon–Sun, week starts Monday): `caption`/400 `primary-500`.
- Dates: `body`/400 `neutral-900`, 7-column grid, row height 40.
- Selected date: 36px circle `primary-900`, text `white`. Today: 1px ring `primary-500`.
- Below: two-tab toggle (Spends / Categories), each half-width pill, height 36. Active `primary-200`, inactive `primary-50`, text `body`/500 `primary-900`.

### 6.14 Financial Statements tile grid
- 3-column grid, tile 105 × 97, `radius-xl`, gap 22 horizontal / 70 vertical (including label).
- Default bg `accent-tile`, selected bg `primary-900`.
- Label below tile: `caption`/500 `primary-900`, centered, max 2 lines.
- "Add New Template" tile: same size, `white` 2px plus icon 48px centered.
- Tiles: Income Statement, Balance Sheet, Cash Flow, Weekly Report, Monthly Report, Annual Report.

### 6.15 Bottom navigation
- Container: `primary-50`, height ~105, top corners radius 60, full width, sits above safe area.
- 5 evenly spaced icons (32px line icons, 1.5px stroke, `primary-900`):
  1. **Home** → Account Balance
  2. **Analysis** (magnifier + bar chart) → Analysis / Quickly Analysis / Calendar
  3. **Transactions** (pencil on line) → Transaction list
  4. **Statements** (stacked layers) → Financial Statements
  5. **Profile** (person) → Profile/Settings
- Active item: 58 × 58 rounded square `primary-900`, `radius-md`, icon `white`.


### 6.16 Tab switch (Money in | Money out | Move money)
- Same as the segmented control (6.6) but 3 equal items, track `primary-50`, `radius-xl`, padding 4, gap 4, height 44, 382 wide. Items padding 9 vertical, `radius-md`.
- **Selected:** `primary-900` fill, `white` SemiBold 13.5 text, `shadow-inner-selected`. Unselected: no fill, `primary-900` Medium 13.5.
- Also used for Income | Balance sheet | Cash flow.

### 6.17 Chip (choice on forms)
- Pill, padding 6 × 11, `radius-pill`, text 11.5 Medium. Unselected: `white`, 1px `primary-200` border, `primary-900` text.
- **Selected:** `primary-900` fill, `white` SemiBold text, 10px check icon on the left, `shadow-inner-selected`.
- Chips wrap (gap 6, row gap 6). Labels 1–3 words.

### 6.18 Group card
- `primary-50` fill, `radius-md`, padding 9 / 12 / 11 / 12. Title 13 SemiBold `primary-900`, optional 11 Light `neutral-600` subtitle, then a chip row.
- Money in groups: *Sales*, *Other money in*. Money out groups: *Monthly expenses*, *Stock & equipment*, *Loans, tax & owner*.

### 6.19 Collapsed step row
- After a type is chosen, step 1 collapses into a `primary-50` row (`radius-lg`, padding 8 × 14): "1. What is it for?" 11 Light `neutral-600`, type 14 SemiBold, group 11 Light, and "Change ⌄" in `primary-500` on the right.

### 6.20 Amount input with currency switch
- Row: label "2. How much?" (14 Medium `primary-900`) + input `primary-50`, `radius-lg`, height ≈ 46.
- Left inside the input: **KHR | USD switch** (6.21). Right: symbol (18 Medium `primary-500`) + number (24 Bold `primary-900`). USD → `$`, KHR → `៛` (use Noto Sans Khmer for the glyph, Poppins has none).
- When KHR is selected, show under the row: "About $600 at ៛4,000 = $1" (11 Light `neutral-600`). 4,000 KHR = 1 USD is a placeholder, read it from settings.
- Always comma thousands: `$1,200`, `៛2,400,000`.

### 6.21 Currency switch
- `white` pill, 1px `primary-200` border, padding 2, two segments `KHR` and `USD` (11px). Selected segment: `primary-900`, `white` SemiBold, `shadow-inner-selected`, `radius-pill`.

### 6.22 Entry text field
- Optional label 11 Light `neutral-600` above. Box `primary-50`, `radius-field`, padding 8 × 12, text 12 (Light `neutral-500` placeholder, Medium `primary-900` filled). Date field: calendar icon (`primary-500`) on the left. Dropdown: chevron on the right.
- Two short fields may sit side by side (each fills half, gap 10).

### 6.23 Pay row
- Label "3. How did you pay?" (money out) or "3. How did you get paid?" (money in), then chips `Cash`, `Bank or wallet`, `Pay later`.
- Show `Pay later` only where allowed (§9.2). If selected, show a Supplier (money out) or Customer (money in) field and the hint *You will find this under "I owe" until it is paid.*

### 6.24 Impact strip (entry footer)
- Left: one plain sentence (11.5 Medium). Right: the effect (14 Bold). Text `primary-900`.
- Background = semantic colour at 15% over `white`: `success` for sales, `alert` for costs, `primary-50` for entries with no profit effect (stock, equipment, drawings, transfers, loans, capital, deposits).
- Examples: "Counts as sales for the month | Sales +$120", "Counts as a cost for the month | Profit -$35", "Added to equipment - not a monthly cost | Profit $0", "Between your own accounts - no profit effect | Moves $300".

### 6.25 Info card
- `white`, 1px `primary-200` border, `radius-lg`, info icon `primary-500` + 11.5 Regular `primary-900` text, one to two lines. Explains why an option is or is not available.

### 6.26 Sticky footer (entry and statement screens)
- `white`, padding 10 / 24 / 8 / 24, `shadow-footer`, ends at y = 824 (top of the bottom nav). Contains the impact strip (if any) and the **primary button**: full width (382), `primary-900`, `white` 15 SemiBold, `radius-pill`, padding 11 × 24, `shadow-button`. One primary button per screen.

### 6.27 KPI tile
- `radius-lg`, padding 10 × 12. Label 10.5 Regular, value 16–18 Bold, optional 10 Light caption. First tile can be the highlight: `primary-900` fill, `white` value, `primary-200` label. Others `primary-50`.

### 6.28 Grouped list (bookkeeping overview)
- `white` card, 1px `neutral-200` border, `radius-xl`. Group row: title 15 SemiBold + count 12 Light `neutral-600`; amount 15 Bold `primary-900` + chevron. Expanded: child rows indented 14px (name 13.5 Medium, date 11.5 Light, amount 13.5 Medium).

### 6.29 Financial statement table
- Columns: label (fill) + 76px value columns, right aligned. Current period Medium `primary-900`, prior period Regular `neutral-600`.
- Section heading 12 SemiBold `primary-500`. Normal row: 1px bottom divider `neutral-200`. **Subtotal row:** `primary-50`, `radius-field`, SemiBold. **Grand total row:** `primary-900`, `white` Bold, `radius-md`.
- Negative numbers: minus sign (`-$3,000`), never colour alone. Cash flow shows `+` on positive adjustments.
- End with a check strip (`success` 15%): "Balance check … difference $0".
- Screen layout: header, tab switch, statement heading (business, title, period, "Amounts in USD", period picker pill), 3 KPI tiles, column header, table, check strip, "Download PDF". Nav: `statement` variant.

### 6.30 Business profile form
- Fields (same as onboarding "Create Business Profile"): Business Name, Business Industry (dropdown), Registration Status (dropdown), Registration Number (only when Registered, indented 20), Start Operation Date (date), Owner Name, Location, Phone or Email, Main Products or Services. Then Push Notifications and Dark Theme toggles and the soft "Update Profile" button. Labels 15 Medium `primary-900`, inputs 32 high `radius-lg`.

---

## 7. Iconography

- Style: **outlined line icons**, 1.5–2px stroke, rounded caps and joins (Lucide or Phosphor "regular" match closely).
- Default color `primary-900`. On colored tiles use `white`.
- Category icons used: banknotes stack (Salary), grocery bag (Groceries), key-in-hand (Rent), bus (Transport), fork & knife (Food), car (Savings goal).
- Never mix filled and outlined icons in the same component.

## 8. Imagery

- Onboarding hero uses a **soft 3D illustration** (hand with gold coins) on a 250px circle of `primary-50`.
- Flags: circular crops, 60px, for language selection (Cambodia, UK).
- Bank logos: circular, 24px.

---

## 9. Screen Inventory & Flow

```
Onboarding:  Welcome → Select Language → Start Option → (if existing balance) 1. Enter Business Assets → …
Main tabs:   Home (Account Balance) | Analysis | Transactions | Financial Statements | Profile
Analysis:    Daily / Weekly / Monthly / Year tabs, My Targets, Quickly Analysis, Calendar (Spends / Categories)
```

| Screen | Hero content | Sheet starts *(approx. y)* |
|---|---|---|
| Welcome / Language / Start | Centered `display` title | 308 |
| Enter Business Assets | Title left-aligned `title-lg` | 112 (square top corners) |
| Account Balance | Balance summary, progress, Income/Expense cards, status | 435 |
| Quickly Analysis | Savings ring + Revenue/Food last week | 307 |
| Transaction | Total Balance card (`primary-50`, radius 16), summary, progress | 333 |
| Analysis | Summary + progress | 282 |
| Calendar | Header only | 181 |
| Financial Statements | Summary + progress (hero `accent-tile`) | 282 |


### 9.1 Bookkeeping entry screen pattern
1. Title "Add an entry", tab switch directly under it.
2. Sheet content in order: step 1 (group cards, or the collapsed row once chosen) → step 2 amount (6.20) → step 3 pay row (6.23) → extra fields → date and note.
3. Sticky footer: impact strip + "Save entry". Bottom nav: `bookkeeping` variant at y = frameHeight − 108.
4. Fit the form above the footer without scrolling when possible. If it will not fit, let the sheet scroll. Never shrink text below 11.

### 9.2 Accounting rules the UI must follow
Source: `posting_rules.json` and the entry-rule spreadsheet.

**Money in**

| Type (label) | Pay later? | Extra fields | Impact line |
|---|---|---|---|
| Product sale | Yes (customer) | Cost of goods (optional, estimated if blank) | Counts as sales |
| Service income | Yes (customer) | Customer if pay later | Counts as sales |
| Deposit or advance from a customer | No | Customer (required) | Not a sale yet, held for the customer |
| Loan received | No | Lender, lender type (Bank / MFI or Family or informal), term (up to 12 months or longer) | Not income, added to loans you owe |
| Money I put into the business | No | none | Not income, added to your capital |
| Other income | No | Note (required), review flag | Counts as other income |

**Money out**

| Group | Types | Pay later? |
|---|---|---|
| Monthly expenses | Rent, Salaries & wages, Utilities, Transport & delivery, Marketing, Repairs & maintenance, Other (note required, review flag) | Yes (supplier) |
| Monthly expenses | Fees & licences | **No** |
| Stock & equipment | Stock & materials | Yes. Added to stock, not a cost yet |
| Stock & equipment | Equipment or vehicle | Yes. Fields: asset name, useful life. Added to equipment |
| Loans, tax & owner | Loan repayment | No. Fields: which loan, interest part (optional). Splits principal and interest |
| Loans, tax & owner | Income tax | No |
| Loans, tax & owner | Money I took out for myself | No. Includes personal bills paid from the business. Not a business cost |

**Move money:** from account, to account, amount. No group step, no profit effect, show a "balance after this move" preview.

**Other rules:** users always type positive numbers, the app decides direction. Posted entries are never edited or deleted: use "Reverse" or "Correct", never "Delete". Never show account codes or "debit / credit" in the UI.

### 9.3 Figma references
- File `iWtJcoDJn6HefdaGOTN8Pe` (Finext - Mobile App). Components library frame `80:4598` (page "Elements"). Original screens on page "App".
- Designed sections on the App page: Bookkeeping overview and entry set, Money in (one screen per type), Money out (13 screens, one per type), Financial statements (3 screens).

---

## 10. Content & Formatting Rules

- **Currency:** support **USD and KHR** everywhere. Format USD as `$4,000.00`; KHR as `5,000,000 ៛` (no decimals).
- **Standardize number format.** The mockups mix `$4.000,00`, `-$1.187.40` and `$4,000.00`. Always use **comma thousands, dot decimals** in English, and follow locale rules in Khmer.
- **Negative amounts:** `-$100.00` (minus before currency symbol).
- **Dates:** list subtitle `HH:mm - Month D` (e.g. `18:27 - April 30`); inputs `DD/MM/YY`.
- **Plain words on forms:** "What is it for?", "How much?", "How did you pay?", "Money in / Money out / Move money", "Owed to me" / "I owe". Never accounting jargon.
- **Copy fixes to apply in code:** "Calender" → "Calendar", "Asseets" → "Assets", "Quickly Analysis" → "Quick Analysis".
- All strings go through i18n (`en-GB`, `km`). Do not hard-code text.

---

## 11. Accessibility

- Minimum tap target 44 × 44 (nav items 58).
- `white` text on `primary-200` (balance numbers) has low contrast. Keep these values at **24px bold minimum** and add `primary-900` to secondary hero text.
- Amounts must not rely on color alone. Always show the `-` sign for expenses.
- Charts need text equivalents (accessible labels with values per bar or segment).
- Support dynamic type up to 130% without truncating amounts. Allow wrapping for Khmer.

---

## 12. Motion

- Sheet entrance: slide up 24px + fade, 280ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Segment / tab switch: active pill slides, 200ms ease-out.
- Progress bar and rings animate from 0 on mount, 600ms ease-out.
- Choice button press: scale 0.98, 120ms.
- Respect `prefers-reduced-motion`.

---

## 13. Design Tokens (copy-paste)

### CSS variables
```css
:root {
  /* Primary */
  --primary-900: #0D47A1;
  --primary-500: #2196F3;
  --primary-200: #90CAF9;
  --primary-50:  #E3F2FD;
  /* Supporting */
  --accent-expense: #0068FF;
  --accent-tile: #6CB4FF;
  --accent-tile-strong: #3D9BFF;
  /* Neutral */
  --neutral-900: #343434;
  --neutral-600: #898989;
  --neutral-500: #989898;
  --neutral-300: #CACACA;
  --neutral-200: #E0E0E0;
  --white: #FFFFFF;
  /* Semantic */
  --danger:  #FF4267;
  --warning: #FFAF2A;
  --success: #52D5BA;
  --alert:   #FB6B18;
  /* Type */
  --font-sans: 'Poppins', 'Kantumruy Pro', sans-serif;
  /* Radius */
  --radius-sm: 10px; --radius-md: 18px; --radius-lg: 20px;
  --radius-xl: 22px; --radius-2xl: 40px; --radius-sheet: 72px; --radius-pill: 999px;
  /* Shadow */
  --shadow-soft: 0 4px 30px rgba(54, 41, 183, 0.07);
  --shadow-button: 0 4px 4px rgba(0, 0, 0, 0.25);
}
```

### Tailwind `theme.extend`
```js
colors: {
  primary: { 900: '#0D47A1', 500: '#2196F3', 200: '#90CAF9', 50: '#E3F2FD' },
  accent:  { expense: '#0068FF', tile: '#6CB4FF', 'tile-strong': '#3D9BFF' },
  neutral: { 900: '#343434', 600: '#898989', 500: '#989898', 300: '#CACACA', 200: '#E0E0E0' },
  danger: '#FF4267', warning: '#FFAF2A', success: '#52D5BA', alert: '#FB6B18',
},
fontFamily: { sans: ['Poppins', 'Kantumruy Pro', 'sans-serif'] },
borderRadius: { sm: '10px', md: '18px', lg: '20px', xl: '22px', '2xl': '40px', sheet: '72px' },
boxShadow: {
  soft: '0 4px 30px rgba(54, 41, 183, 0.07)',
  button: '0 4px 4px rgba(0, 0, 0, 0.25)',
},
```

### Flutter / React Native
Mirror the same token names (`AppColors.primary900`, `AppRadius.sheet`, etc.) in a single `theme` file. Components must read from tokens only.

---

## 14. Build Checklist for Claude Code

- [ ] Create the token file first (CSS vars / Tailwind / theme) — no inline hex values in components.
- [ ] Build shared components: `ScreenShell` (hero + sheet + optional nav), `HeaderBar`, `BalanceSummary`, `BudgetProgress`, `StatCard`, `TransactionRow`, `SegmentedControl`, `BarChartCard`, `HalfDonut`, `TargetRing`, `ChoiceButton`, `CurrencyInput`, `DateInput`, `BankChip`, `PageDots`, `CalendarGrid`, `StatementTile`, `BottomNav`.
- [ ] Assemble screens from components in the order in §9.
- [ ] Apply the number/currency formatter and the copy fixes from §10.
- [ ] Wire i18n for `en-GB` and `km`; verify Khmer layout.
- [ ] Check every screen at 375, 390 and 430 widths.
- [ ] Entry screens: amount input has the KHR | USD switch, impact strip is present, and Pay later follows §9.2.
- [ ] Selected states use `shadow-inner-selected`; primary buttons use `shadow-button`.

---

## 15. Merge decisions and known deviations

Decisions taken when merging the two guides:

| Topic | Decision |
|---|---|
| Token names | Use `primary-*`, `neutral-*`, `danger`, `warning`, `success`, `alert` (original guide) |
| Button and selected shadows | Use the components-library values: drop `0 4 4 black 25%`, inner `0 4 4 black 25%` |
| Sheet top radius | `72px` (measured on the original screens) |
| Bottom nav height | `108px` (actual component size), `y = frameHeight − 108` |
| Expense amounts in lists and transactions | Keep `accent-expense` (`#0068FF`) with a minus sign, as on the original screens |
| Money in / money out on **new** entry, overview and statement screens | `success` / `alert` only as 15% tinted strips and tiles with `primary-900` text. No new hex values |
| Semantic colours as text | Do not use `success`, `warning`, `alert`, `danger` as small text on white (contrast). Use them for fills, dots, icons and strips |

The Figma screens drawn before this merge still differ and should be updated when touched:

| In the Figma bookkeeping, statement and profile screens | Change to |
|---|---|
| Sheet top radius 48 | 72 |
| Button shadow blue 35%, blur 10; selected inner shadow blue-black 40% | `shadow-button` and `shadow-inner-selected` |
| `#0068FF` for accents and links | `#2196F3` (keep `#0068FF` only for expense amounts) |
| `#BBDEFB` (borders), `#5F7DA0` (captions), `#D6E6F7` (dividers) | `#90CAF9`, `#898989`, `#E0E0E0` |
| `#1B7A50` / `#E3F5EC` (money in), `#B8420F` / `#FFF0E4` (money out) | `#52D5BA` and `#FB6B18` at 15% tint, text `#0D47A1` |
