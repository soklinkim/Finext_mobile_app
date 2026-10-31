# Financial statement wording: app vs. the Cambodian reference

Reference: *IFRS for SMEs Illustrative Financial Statements* (Accounting and Auditing Regulator of Cambodia, CamEd Business School), English and Khmer, example company "Cute Candle Co. Ltd.", year ended 31 December 2020.

This note lists where the app's financial statement wording **matches** the reference and where it **differs**, so the team can decide what to change. The team approved following the reference wording in English wherever it matches and means the same thing; section 1 records what was applied and what was kept. Section 2 (Khmer) has also been changed to follow the reference.

How this was checked: by reading the app's labels in the code against the reference, not by opening the statements in the running app.

---

## 1. English statements (approved: follow the reference where it means the same thing)

### Applied (labels now use the reference wording)
- Statement names: Statement of Comprehensive Income, Statement of Financial Position, Statement of Cash Flows (screen tiles, titles and the formal page)
- Revenue (was Sales revenue; the extra "Revenue" section heading was removed to avoid repeating it), Employee benefits expense, Rent expense, Utilities expense, Income tax expense
- Cash, Trade receivables, Inventories, Property and equipment, Trade payables
- Total assets, Total liabilities, Total equity, Total liabilities and equity, Liabilities and equity (sentence case instead of capitals)
- Cash flow headings: Cash flows from operating / investing / financing activities
- Cash flow lines: Change in trade receivables, Change in inventories, Change in trade payables, Net increase (decrease) in cash

### Kept as they are (the wording means something different from the reference)
- Transport & delivery, Marketing & advertising (broader than "Delivery expense" / "Advertising expense")
- Depreciation (the app has no amortization), Other income, Interest expense (not only bank accounts / bank loans)
- Net profit and Cash at end of period (the app also reports weeks and months, the reference says "for the year")
- Owner's capital and Owner's drawings (the reference is a company: share capital and dividends)
- Net cash from operating / investing activities (the reference's "inflow" / "used in" depend on the sign)
- Property & equipment line in the cash flow (net of sales, not only "Purchases of equipment")
- Accrued expenses & taxes payable, loan lines, prepaid expenses, customer deposits (not in the reference or combined differently)
- The short tab names Income / Balance sheet / Cash flow

Structure items (current / non-current subtotals, cash flow starting from operating profit, Statement of Changes in Equity, Notes) were not part of this change.

### Original comparison (before the change)

### Matches the reference
- Formal page headings: STATEMENT OF COMPREHENSIVE INCOME, STATEMENT OF FINANCIAL POSITION, STATEMENT OF CASH FLOWS
- Operating profit
- Profit before tax
- Total current assets
- Retained earnings
- Total liabilities
- Net increase / (decrease) in cash

### Income statement

| App says | Reference says |
|---|---|
| Income Statement (tab, screen title) | Statement of Comprehensive Income |
| Sales revenue | Revenue |
| Salaries & wages | Employee benefits expense |
| Depreciation | Depreciation and amortization expense |
| Rent | Rent expense |
| Utilities | Utilities expense |
| Transport & delivery | Delivery expense |
| Marketing & advertising | Advertising expense |
| Other income | Bank account interest income |
| Interest expense | Bank loan interest expense |
| Income tax | Income tax expense |
| Net profit | Profit for the year |

### Balance sheet

| App says | Reference says |
|---|---|
| Balance Sheet (tab, screen title) | Statement of Financial Position |
| Cash & bank balances | Cash |
| Accounts receivable | Trade receivables |
| Inventory | Inventories |
| Property, equipment & vehicles (net) | Property and equipment |
| Accounts payable | Trade and other payables |
| Short-term loans / Long-term loans | Bank loan (with "Current portion of bank loan") |
| Owner's capital | Share capital |
| Total owner's equity | Total equity |
| Liabilities & owner's equity | Liabilities and equity |
| Total liabilities & owner's equity | Total liabilities and equity |

### Cash flow statement

| App says | Reference says |
|---|---|
| Cash Flow (tab) / Cash Flow Statement | Statement of Cash Flows |
| Operating activities | Cash flows from operating activities |
| Net cash from operating activities | Net cash inflow from operating activities |
| Net cash from investing activities | Net cash used in investing activities |
| Property & equipment | Purchases of equipment |
| Change in accounts receivable | Increase in trade and other receivables |
| Cash at end of period | Cash at end of year |

### Structure differences
- The reference has "Current assets", "Non-current assets", "Current liabilities" and "Non-current liabilities" headings, each with a total. The app has one Assets list and one Liabilities list.
- The reference cash flow starts from **Operating profit** and shows interest received, interest paid and income tax paid as separate lines. The app starts from **Net profit**.
- The reference lists expenses by nature (raw materials used, employee benefits, ...). The app uses cost of goods sold and gross profit (function format). IFRS for SMEs allows either.
- The app has **no Statement of Changes in Equity** and **no Notes**. The reference has both.

### Decisions for the team
1. Rename the on-screen statement names to the IFRS names, or keep the everyday names (Income Statement, Balance Sheet, Cash Flow)?
2. Change each line label to the reference wording (table above)? The labels come from the server: `backend/app/routers/accounting.py` (statement builder). Simple-terms wording is separate and unaffected.
3. Add the current / non-current subtotals to the balance sheet?
4. Add a Statement of Changes in Equity and Notes?

---

## 2. Khmer statements (already changed to follow the reference)

The standard Khmer terms now follow the reference. Simple-terms Khmer is unchanged (it keeps what the app had before).

Terms changed to the reference wording:

| Before | Now (reference) | Meaning |
|---|---|---|
| របាយការណ៍ចំណូល | របាយការណ៍លទ្ធផល | income statement |
| តារាងតុល្យការ | របាយការណ៍ស្ថានភាពហិរញ្ញវត្ថុ | statement of financial position |
| ទ្រព្យសកម្មរយៈពេលវែង | ទ្រព្យសកម្មមិនមែនចរន្ត | non-current assets |
| បំណុលរយៈពេលខ្លី | បំណុលចរន្ត | current liabilities |
| បំណុលរយៈពេលវែង | បំណុលមិនមែនចរន្ត | non-current liabilities |
| ស្តុកទំនិញ | សន្និធិ | inventories |
| បំណុលត្រូវសងអ្នកផ្គត់ផ្គង់ | គណនីត្រូវសង | accounts payable |
| ពន្ធត្រូវសង | ពន្ធត្រូវបង់ | taxes payable |
| កាតព្វកិច្ចជួល | ភតិសន្យាត្រូវសង | lease obligations |
| ប្រាក់ខែ និងឈ្នួល | ប្រាក់បៀវត្ស និងប្រាក់ឈ្នួល | salaries and wages |
| ទឹក ភ្លើង និងសេវាប្រើប្រាស់ | ចំណាយអគ្គិសនី និងទឹក | utilities expense |
| ទីផ្សារ និងផ្សព្វផ្សាយ | ចំណាយផ្សាយពាណិជ្ជកម្ម | advertising expense |
| អចលនទ្រព្យ ឧបករណ៍ និងយានយន្ត (តម្លៃសុទ្ធ) | ទ្រព្យ និងបរិក្ខារ (តម្លៃសុទ្ធ) | property and equipment (net) |
| ឧបករណ៍ និងម៉ាស៊ីន | បរិក្ខារ | equipment |
| អចលនទ្រព្យ (ដី និងអគារ) | ដី និងអគារ | land and building |
| (everyday wording for the totals) | ទ្រព្យសកម្មសរុប / បំណុលសរុប / មូលធនសរុប | total assets / liabilities / equity |

Also added: official Khmer for every statement line, section heading and KPI label (previously English in Khmer mode). The table is in `frontend/src/i18n/standardKm.ts`.

### Khmer terms NOT in the reference (need a Khmer accountant's review)
These follow the reference's naming pattern but are not in the document. Each is marked "(not in reference)" in `standardKm.ts`:
- Cost of goods sold: ថ្លៃដើមទំនិញដែលបានលក់
- Gross profit: ចំណេញដុល
- Prepaid expenses: ចំណាយបង់ជាមុន
- Customer deposits: ប្រាក់កក់អតិថិជន
- Owner's drawings: ដក៖ ដកប្រាក់ប្រើប្រាស់ផ្ទាល់ខ្លួន
- Owner's capital: មូលធនរបស់ម្ចាស់ (the reference has share capital, មូលធនភាគហ៊ុន)
- Short-term / long-term loan lines, the cash flow "change in ..." lines, the balance and cash check labels, quick ratios
- Net profit: ប្រាក់ចំណេញសុទ្ធ (the reference says "profit for the year")

### Other Khmer points
- The reference's Khmer title for the income statement is របាយការណ៍លទ្ធផល និងចំណេញរក្សាទុក ("income and retained earnings"). The app uses it as the formal heading, but it is not an exact match for what the app's income statement shows.
- The simple-terms Khmer for profit before tax is ចំណេញមុនបង់ពន្ធ. The reference says ប្រាក់ចំណេញមុនគិតពន្ធ. This only shows in simple-terms mode, which is not meant to follow the reference.
- All new Khmer text written for the app (not taken from the reference) should be checked by a native speaker.

---

## 3. Related behaviour
- Statements are always shown in standard terms, whatever the simple-terms setting is.
- The three statement tiles each have a small (i) that explains the statement in everyday words.
- The Annual Report tile was removed from the Statements screen (the Loan application pack still offers a monthly or annual period).
- Every statement and loan pack PDF carries a small Finext mark in the bottom-right corner of each page.

## 4. Not covered yet
- The downloadable statement page and the PDF are English only, in both languages.
- The structure items listed under "Structure differences" (current / non-current subtotals, cash flow starting from operating profit, Statement of Changes in Equity, Notes).
