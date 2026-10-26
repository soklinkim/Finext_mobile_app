# Finext — Finance Rules & Logic

> **For Claude Code and the backend developer:** This is the source of truth for how Finext records money, builds the financial statements, calculates ratios and raises health alerts. It combines `posting_rules.json` (v2), `FINEXT accounting entry rule.xlsx`, `FINEXT_Financial_Statement_Templates 3.xlsx`, `FINEXT Ratio and Health Manager.xlsx` and the Money In / Money Out / Move Money flow diagram.
>
> - `posting_rules.json` is the **machine-readable** version of sections 3–6. Load it in code rather than hard-coding the rules. This document explains it.
> - Where the source files disagree, this document says so in **§12 Open questions**. Do not guess. Raise them with the product owner.
> - UI styling lives in `FINEXT_STYLE_GUIDE.md`.

---

## 1. Core Principles

1. **Double-entry, hidden from the user.** The owner answers simple questions ("Money in → Sales → Product sale, $50, paid by ABA"). The app turns each answer into a balanced journal entry. The user never sees debits or credits unless they open a statement.
2. **Every entry balances.** The sum of debits equals the sum of credits for every journal entry. Reject any entry that does not.
3. **Posted entries are immutable.** Never edit or delete a posted entry. Corrections use a reversing entry plus a new entry (§6).
4. **Statements are derived, never stored.** The Income Statement, Balance Sheet and Cash Flow are calculated from account balances on demand.
5. **Offline-first.** Everything in §§2–7 (entry, posting, balances, statements) runs on the device with no network. Ratios and the AI health manager (§§9–10) may run online, but simple balances must not depend on them.
6. **Money is stored as integers**: USD in cents, KHR in riel. Never use floating point for amounts. Ratios are calculated as decimals at display time only.

---

## 2. User Flow for Recording a Transaction

This follows the flow diagram. It is the screen behind the **pencil (Transactions) tab**.

```
Step 1: Direction     Money in   |   Money out   |   Move money
Step 2: Group         (skipped for Move money)
Step 3: Type          (the specific transaction type)
Step 4: Details       amount, date, how paid (cash / bank or wallet / pay later),
                      extra fields for that type, optional note & photo
Step 5: Confirm       → app builds and posts the journal entry
```

| Direction | Group | Group id | Types (user-facing labels) |
|---|---|---|---|
| **Money in** | Sales | `sales` | Product sale · Service income · Deposit or advance from a customer |
| | Other money in | `otherin` | Loan received · Money I put into the business · Other income (interest, grants, gifts) |
| **Money out** | Monthly expenses | `monthly` | Rent · Salaries & wages · Utilities · Transport & delivery · Marketing · Repairs & maintenance · Fees & licences · Other monthly cost |
| | Stock & equipment | `stock` | Stock & materials · Equipment or vehicle |
| | Loans, tax & owner | `loantax` | Loan repayment · Income tax · Money I took out for myself |
| **Move money** | *(no group step)* | `move` | Move money between my accounts |

Group colors in the diagram: Money in groups = green, Money out groups = red, Move money = yellow. Map these to the style guide's semantic tokens (`success`, `danger`, `warning`) only for small accents such as a chip or an icon tile. Do not use them as large backgrounds.

### 2.1 "How was it paid?" (the `PAY` choice)

| User picks | Account used |
|---|---|
| Cash | `1000` Cash |
| Bank or wallet (ABA, Wing, KB PRASAC…) | `1010` Bank & wallet, on the chosen sub-account |
| **Pay later**, money in | `1100` Accounts receivable (creates an open item for the customer) |
| **Pay later**, money out | `2000` Accounts payable (creates an open item for the supplier) |

Show "Pay later" only for types where `allows_pay_later = true`.

---

## 3. Chart of Accounts

`1010` Bank & wallet holds one **sub-account per bank or wallet** the user adds (e.g. KB PRASAC, ABA, Wing). Sub-accounts roll up into 1010 on statements.

| Code | Account | Class | Statement section | Normal side |
|---|---|---|---|---|
| 1000 | Cash | Asset | BS: current assets | Debit |
| 1010 | Bank & wallet | Asset | BS: current assets | Debit |
| 1100 | Accounts receivable | Asset | BS: current assets | Debit |
| 1200 | Inventory | Asset | BS: current assets | Debit |
| 1300 | Prepaid expenses | Asset | BS: current assets | Debit |
| 1500 | Equipment & vehicles (cost) | Asset | BS: non-current assets | Debit |
| 1590 | Accumulated depreciation | Asset (contra) | BS: non-current assets | Credit |
| 1600 | Other long-term assets | Asset | BS: non-current assets | Debit |
| 2000 | Accounts payable | Liability | BS: current liabilities | Credit |
| 2100 | Customer deposits | Liability | BS: current liabilities | Credit |
| 2200 | Accrued expenses | Liability | BS: current liabilities | Credit |
| 2300 | Taxes payable | Liability | BS: current liabilities | Credit |
| 2400 | Short-term loans (bank / MFI) | Liability | BS: current liabilities | Credit |
| 2500 | Other short-term borrowings | Liability | BS: current liabilities | Credit |
| 2600 | Long-term loans | Liability | BS: non-current liabilities | Credit |
| 2700 | Lease obligations | Liability | BS: non-current liabilities | Credit |
| 3000 | Owner's capital | Equity | BS: owner's equity | Credit |
| 3100 | Retained earnings | Equity | BS: owner's equity | Credit |
| 3200 | Owner's drawings | Equity (contra) | BS: owner's equity | Debit |
| 4000 | Sales revenue | Revenue | IS: sales | Credit |
| 4100 | Service revenue | Revenue | IS: sales | Credit |
| 4200 | Other income | Revenue | IS: other income | Credit |
| 4900 | Sales returns & discounts | Revenue (contra) | IS: sales | Debit |
| 5000 | Cost of goods sold | Cost of sales | IS: COGS | Debit |
| 6000 | Rent | Expense | IS: operating expenses | Debit |
| 6100 | Salaries & wages | Expense | IS: operating expenses | Debit |
| 6200 | Utilities | Expense | IS: operating expenses | Debit |
| 6300 | Internet & phone | Expense | IS: operating expenses | Debit |
| 6400 | Transport & delivery | Expense | IS: operating expenses | Debit |
| 6500 | Marketing & advertising | Expense | IS: operating expenses | Debit |
| 6600 | Repairs & maintenance | Expense | IS: operating expenses | Debit |
| 6700 | Insurance | Expense | IS: operating expenses | Debit |
| 6800 | Depreciation | Expense | IS: operating expenses | Debit |
| 6900 | Bank & wallet fees | Expense | IS: operating expenses | Debit |
| 6950 | Licences & government fees | Expense | IS: operating expenses | Debit |
| 6990 | Other expenses | Expense | IS: operating expenses | Debit |
| 7000 | Interest expense | Expense | IS: interest | Debit |
| 7100 | Income tax expense | Expense | IS: income tax | Debit |

**Balance of an account** = (sum of debits − sum of credits) for debit-normal accounts, and (sum of credits − sum of debits) for credit-normal accounts.

---

## 4. Account Roles

Posting rules use roles instead of fixed codes where the account depends on the user's choice.

| Role | Resolves to |
|---|---|
| `PAY` | `1000` if cash · `1010` (sub-account) if bank or wallet · if pay later: `1100` for money in, `2000` for money out |
| `LOAN` | The account stored on the loan record: `2400`, `2500` or `2600` |
| `TO` | Destination chosen by the user: `1000` or a `1010` sub-account |
| `FROM` | Source chosen by the user: `1000` or a `1010` sub-account |

**Amount variables:** `AMOUNT` is what the user typed. `COST` is the cost of the goods sold, entered or estimated. `PRINCIPAL` and `INTEREST` are the two parts of a loan repayment.

---

## 5. Posting Rules by Transaction Type

Dr = debit, Cr = credit.

### 5.1 Money in → Sales

| Type id | Label | Pay later | Extra fields | Entry |
|---|---|---|---|---|
| `product_sale` | Product sale | Yes | customer (if pay later); cost (optional) | Dr `PAY` AMOUNT · Cr `4000` AMOUNT · Dr `5000` COST · Cr `1200` COST |
| `service_income` | Service income | Yes | customer (if pay later) | Dr `PAY` AMOUNT · Cr `4100` AMOUNT |
| `customer_deposit` | Deposit or advance from a customer | No | customer | Dr `PAY` AMOUNT · Cr `2100` AMOUNT |

**Product sale cost lines always post.** If the user leaves cost blank, the app estimates it (see §12, Q4 for the estimation method).

### 5.2 Money in → Other money in

| Type id | Label | Pay later | Extra fields | Flags | Entry |
|---|---|---|---|---|---|
| `loan_received` | Loan received | No | lender; lender type; term | creates loan record | Dr `PAY` AMOUNT · Cr `LOAN` AMOUNT |
| `owner_capital` | Money I put into the business | No | — | — | Dr `PAY` AMOUNT · Cr `3000` AMOUNT |
| `other_income` | Other income (interest, grants, gifts) | No | note (required) | review flag | Dr `PAY` AMOUNT · Cr `4200` AMOUNT |

**Choosing the `LOAN` account when a loan is received:**

| Lender type | Term | Account |
|---|---|---|
| Bank / MFI | Up to 12 months | `2400` Short-term loans |
| Family / informal | Up to 12 months | `2500` Other short-term borrowings |
| Any | Longer than 12 months | `2600` Long-term loans |

### 5.3 Money out → Monthly expenses

All of these follow the pattern **Dr expense AMOUNT · Cr `PAY` AMOUNT**.

| Type id | Label | Pay later | Extra fields | Flags | Debit account |
|---|---|---|---|---|---|
| `rent` | Rent | Yes | supplier (if pay later) | — | `6000` |
| `wages` | Salaries & wages | Yes | — | — | `6100` |
| `utilities` | Utilities (electricity, water, internet, phone) | Yes | supplier (if pay later) | — | `6200` |
| `transport` | Transport & delivery | Yes | supplier (if pay later) | — | `6400` |
| `marketing` | Marketing | Yes | supplier (if pay later) | — | `6500` |
| `repairs` | Repairs & maintenance | Yes | supplier (if pay later) | — | `6600` |
| `fees_licences` | Fees & licences (bank, wallet, government) | No | — | — | `6950` |
| `other_cost` | Other monthly cost (including insurance) | Yes | note (required) | review flag | `6990` |

### 5.4 Money out → Stock & equipment

| Type id | Label | Pay later | Extra fields | Flags | Entry |
|---|---|---|---|---|---|
| `stock_materials` | Stock & materials (goods for resale, packaging) | Yes | supplier (if pay later) | — | Dr `1200` AMOUNT · Cr `PAY` AMOUNT |
| `equipment_purchase` | Equipment or vehicle | Yes | asset name; useful life in years | creates asset record | Dr `1500` AMOUNT · Cr `PAY` AMOUNT |

### 5.5 Money out → Loans, tax & owner

| Type id | Label | Pay later | Extra fields | Flags | Entry |
|---|---|---|---|---|---|
| `loan_repayment` | Loan repayment | No | loan (from loan records); interest part (optional) | splits principal and interest | Dr `LOAN` PRINCIPAL · Dr `7000` INTEREST *(only if > 0)* · Cr `PAY` AMOUNT, where AMOUNT = PRINCIPAL + INTEREST |
| `income_tax` | Income tax | No | — | — | Dr `7100` AMOUNT · Cr `PAY` AMOUNT |
| `owner_drawings` | Money I took out for myself (including personal bills paid from the business) | No | — | — | Dr `3200` AMOUNT · Cr `PAY` AMOUNT |

Repayment guard: PRINCIPAL cannot exceed the loan's remaining balance.

### 5.6 Move money

| Type id | Label | Extra fields | Flags | Entry |
|---|---|---|---|---|
| `transfer` | Move money between my accounts | from account; to account | no profit effect; no group step | Dr `TO` AMOUNT · Cr `FROM` AMOUNT |

Guard: `FROM` ≠ `TO`. A transfer never appears in income or expense totals.

### 5.7 Deferred (not in v1)

- `sold_equipment`: selling equipment or a vehicle. Do not build it, but leave room in the type list for it.

---

## 6. Actions on Existing Entries

| Action | When | Entry posted | Guard |
|---|---|---|---|
| **Mark as paid** | Settles an open pay-later item. Partial payments are allowed. | Money in: Dr Cash/Bank · Cr `1100`. Money out: Dr `2000` · Cr Cash/Bank. | Cannot exceed the open balance. Closes the item when fully settled. |
| **Refund or return** | A customer returns goods or gets money back, or you return goods to a supplier. | Customer refund: Dr `4900` · Cr Cash/Bank (or `1100` if unpaid). If goods go back to stock, also Dr `1200` · Cr `5000`. Supplier return: Dr Cash/Bank (or `2000`) · Cr `1200`. | Linked to the original entry. Cannot exceed the original amount. |
| **Apply customer deposit** | An earlier deposit is used against a sale. | Dr `2100` · Cr `4000` (or `4100`). | Cannot exceed the deposit balance. |
| **Write off unpaid amount** | The customer will not pay. | Dr `6990` (bad debt) · Cr `1100`. | Note required. Review flag. |
| **Edit or reverse** | The user changes or cancels a posted entry. | A reversing entry swaps every debit and credit and links to the original. An edit then posts a new entry. | Posted entries are never edited or deleted. |

---

## 7. System Entries

| Entry | What it posts | When |
|---|---|---|
| **Opening balances** | The user enters year-end figures on the statement screens (the onboarding "Starting With Existing Balance" path → "1. Enter Business Assets"). One entry posts each balance; the difference goes to `3000` Owner's capital / `3100` Retained earnings. | Once per business, dated the day before the first daily entry. |
| **Depreciation** | Straight-line from the asset register: Dr `6800` · Cr `1590`. Monthly charge = cost ÷ (useful life in years × 12). | Monthly, system generated. |
| **Accruals** | Month-end prompt for bills used but not yet billed: Dr expense · Cr `2200`. | Monthly, user confirms. |
| **Prepaid release** | Part of a prepaid amount used up: Dr expense · Cr `1300`. | Monthly, system suggested. |
| **Stock count** | The user counts stock. The difference posts Dr `5000` · Cr `1200` (or the reverse if stock is higher than the books). | Month-end prompt. |
| **Loan reclassification** | The part of a long-term loan due within 12 months moves from `2600` to `2400`. | Monthly or at period end, system generated. |

The onboarding choice **"Start New Balance From Today"** posts no opening balances. Every account starts at zero.

---

## 8. Financial Statements

All lines are calculated from account balances for the selected period. Enter expenses, drawings and tax as positive numbers; the formulas handle the signs.

### 8.1 Income Statement (for the period)

| Line | Calculation |
|---|---|
| **Sales revenue** | `4000` + `4100` − `4900` |
| Cost of goods sold | `5000` |
| **Gross profit** | Sales revenue − COGS |
| Operating expenses (shown per line) | `6000`–`6990` |
| **Operating profit** | Gross profit − Operating expenses |
| Other income | `4200` |
| Interest expense | `7000` |
| **Profit before tax** | Operating profit + Other income − Interest |
| Income tax | `7100` |
| **Net profit** | Profit before tax − Income tax |

Operating expense lines on the template, mapped to accounts:

| Template line | Accounts |
|---|---|
| Salaries & wages | 6100 |
| Rent | 6000 |
| Utilities (electricity, water, internet, phone) | 6200 + 6300 |
| Marketing & advertising | 6500 |
| Transport & delivery | 6400 |
| Depreciation | 6800 |
| Other operating expenses | 6600 + 6700 + 6900 + 6950 + 6990 |

Quick ratios on the statement: Gross margin = Gross profit ÷ Sales revenue. Net profit margin = Net profit ÷ Sales revenue.

### 8.2 Balance Sheet (as at period end)

| Section | Line | Calculation |
|---|---|---|
| Current assets | Cash & bank balances | 1000 + 1010 |
| | Accounts receivable | 1100 |
| | Inventory | 1200 |
| | Prepaid & other current assets | 1300 |
| Non-current assets | Property, equipment & vehicles (net) | 1500 − 1590 |
| | Other long-term assets | 1600 |
| **TOTAL ASSETS** | | Sum of the above |
| Current liabilities | Accounts payable | 2000 |
| | Customer deposits & deferred revenue | 2100 |
| | Accrued expenses & taxes payable | 2200 + 2300 |
| | Short-term loans (bank / MFI) | 2400 |
| | Other short-term borrowings | 2500 |
| Non-current liabilities | Long-term loans | 2600 |
| | Lease obligations | 2700 |
| **TOTAL LIABILITIES** | | Sum of the above |
| Owner's equity | Owner's capital | 3000 |
| | Retained earnings brought forward | Balance of 3100 at the start of the period, plus earlier periods' net profit less earlier drawings (derived; **no closing entries in v1**) |
| | Net profit for the period | From the Income Statement |
| | Less: owner's drawings | 3200 for the period |
| **TOTAL OWNER'S EQUITY** | | Capital + RE b/f + Net profit − Drawings |

**Balance check (must be zero):** Total assets − (Total liabilities + Total owner's equity). If it is not zero, there is a bug in posting. Surface it in development builds.

Quick ratios on the statement: Current ratio = Current assets ÷ Current liabilities. Debt-to-equity = Total liabilities ÷ Total owner's equity (see §12, Q6).

### 8.3 Cash Flow Statement (indirect method)

A change means closing balance minus opening balance for the period.

| Section | Line | Calculation |
|---|---|---|
| Operating | Net profit | From the Income Statement |
| | Add back depreciation | 6800 for the period |
| | (Increase)/decrease in receivables | −Δ1100 |
| | (Increase)/decrease in inventory | −Δ1200 |
| | (Increase)/decrease in prepaid | −Δ1300 |
| | Increase/(decrease) in payables | +Δ2000 |
| | Increase/(decrease) in customer deposits | +Δ2100 |
| | Increase/(decrease) in accrued expenses & taxes | +Δ2200 + Δ2300 |
| | **Net cash from operating** | Sum |
| Investing | (Purchase)/sale of equipment & vehicles | −(Δ(1500 − 1590) + depreciation 6800) |
| | (Increase)/decrease in other long-term assets | −Δ1600 |
| | **Net cash from investing** | Sum |
| Financing | Loans | +Δ2400 + Δ2500 + Δ2600 + Δ2700 |
| | Owner's capital contributed | +Δ3000 |
| | Less owner's drawings | −3200 for the period |
| | **Net cash from financing** | Sum |
| | **Net increase/(decrease) in cash** | Operating + Investing + Financing |
| | Cash at start of period | Opening 1000 + 1010 |
| | Cash at end of period | Start + Net change |

**Check (must be zero):** Cash at end of period − closing balance of (1000 + 1010).

### 8.4 Worked sample (Sample Grocery Shop, year to 31 Dec 2025, USD)

Use this as a test fixture. The engine must reproduce these numbers.

| Item | Current | Prior |
|---|---|---|
| Sales revenue | 71,000 | 62,000 |
| COGS | 46,000 | 41,000 |
| Gross profit | 25,000 | 21,000 |
| Total operating expenses (incl. depreciation 1,600 / 1,500) | 17,500 | 16,300 |
| Operating profit | 7,500 | 4,700 |
| Other income | 300 | 0 |
| Interest expense | 800 | 700 |
| Income tax | 350 | 200 |
| **Net profit** | **6,650** | **3,800** |
| Total current assets | 19,450 | 16,300 |
| Total assets | 33,950 | 29,300 |
| Total current liabilities | 10,200 | 10,200 |
| Total liabilities | 15,200 | 16,200 |
| Owner's capital | 12,000 | 10,000 |
| Retained earnings b/f | 3,100 (= 1,700 + 3,800 − 2,400) | 1,700 |
| Drawings | 3,000 | 2,400 |
| **Total equity** | **18,750** | **13,100** |
| Net cash: operating / investing / financing | 6,850 / −3,100 / −3,000 | — |
| Cash start → end | 4,200 → 4,950 | — |
| Gross margin · Net margin | 35.2% · 9.4% | 33.9% · 6.1% |
| Current ratio · Debt-to-equity | 1.91 · 0.81 | 1.60 · 1.24 |

### 8.5 Mapping to the app UI

| UI element (style guide screens) | Calculation |
|---|---|
| **Total Balance** (hero) | Balance of 1000 + 1010 (all sub-accounts) |
| Bank list in Business Assets | 1000 and each 1010 sub-account, in KHR and USD |
| **Income** card | Sales revenue + Other income for the period |
| **Total Expense** / Expense card | COGS + Operating expenses + Interest + Income tax for the period. Excludes stock purchases (inventory), equipment (capitalised), loan principal, drawings and transfers. |
| Budget progress bar | Period expenses ÷ user-set budget target |
| Transaction list | One row per user transaction (not per journal line), with amount sign by direction: in = positive, out = negative, move = neutral |
| Calendar "Categories" donut | Expense totals grouped by template line (§8.1) |
| Financial Statements tiles | §8.1, §8.2, §8.3; Weekly / Monthly / Annual reports are the same statements over that period |

---

## 9. Financial Ratios

### 9.1 Two-stage comparison

| Stage | Period | Compare against |
|---|---|---|
| Stage 1: external benchmark | Onboarding to month 6 | Industry benchmark (table below) |
| Stage 2: own baseline | Month 7 onward | The business's own history first; industry benchmark kept as a secondary reference |

### 9.2 When each ratio starts

| Ratio | Starts | Updated |
|---|---|---|
| Current ratio | At onboarding | Monthly |
| Debt-to-equity, Debt-to-asset | At onboarding | Quarterly |
| Gross margin, Net margin, EBITDA margin, Expense ratio, Inventory days, Receivable days | After the first complete month | Monthly |
| Revenue growth | Once a comparable prior period exists | Monthly |
| Interest coverage, DSCR | After the first complete quarter | Quarterly |
| Quarterly review | After the first complete three months | Quarterly |

Before a ratio's start point, show it as "Not enough data yet" rather than zero.

### 9.3 Definitions and thresholds

Supporting figures:
- **Revenue** = Sales revenue (§8.1).
- **EBITDA** = Operating profit + Depreciation (6800).
- **EBIT** = Operating profit + Other income *(assumption, see §12 Q7)*.
- **Debt** = all loans received: 2400 + 2500 + 2600 + 2700 *(see §12 Q6)*.
- **Equity** = Total owner's equity (§8.2).
- **Average inventory / receivables** = (opening + closing) ÷ 2 for the period.
- **Credit sales** = sales posted with Pay later (to 1100).
- **Days in period** = calendar days in the month (or quarter).

| # | Ratio | Freq. | Formula | Better when | Benchmark | 🟡 Yellow (watch) | 🔴 Red (act) |
|---|---|---|---|---|---|---|---|
| 1 | Current ratio | Monthly | Current assets ÷ Current liabilities | Higher | 1.5 | 1.2 | 1.0 |
| 2 | Gross profit margin | Monthly | (Revenue − COGS) ÷ Revenue | Higher | 33% | 28% | 23% |
| 3 | Net profit margin | Monthly | Net profit ÷ Revenue | Higher | 5.6% | 3% | 0% |
| 4 | EBITDA margin | Monthly | EBITDA ÷ Revenue | Higher | 10% | 5% | 0% |
| 5 | Inventory days | Monthly | Average inventory ÷ COGS × days | Lower | 50 | 60 | 70 |
| 6 | Receivable days | Monthly | Average receivables ÷ Credit sales × days | Lower | 30 | 45 | 60 |
| 7 | Revenue growth | Monthly | (Current − Prior) ÷ Prior | Higher | +3% | −10% | −25% |
| 8 | Operating expense ratio | Monthly | Operating expenses ÷ Revenue | Lower | 25% | 30% | 35% |
| 9 | Debt-to-equity | Quarterly | Debt ÷ Equity | Lower | 1.0 | 2.0 | 3.0 |
| 10 | Interest coverage | Quarterly | EBIT ÷ Interest expense | Higher | 5.0 | 3.0 | 1.5 |
| 11 | Debt-to-asset | Quarterly | Debt ÷ Total assets | Lower | 0.4 | 0.5 | 0.7 |
| 12 | DSCR | Quarterly | EBITDA ÷ (Principal + Interest due) | Higher | 1.5 | 1.25 | 1.0 |

### 9.4 Status logic

"Reaches its line" means the boundary is included.

```ts
function ratioStatus(value: number, r: Ratio): 'green' | 'yellow' | 'red' {
  if (r.betterWhen === 'higher') {
    if (value <= r.red) return 'red';
    if (value <= r.yellow) return 'yellow';
    return 'green';
  } else {
    if (value >= r.red) return 'red';
    if (value >= r.yellow) return 'yellow';
    return 'green';
  }
}
```

Edge cases:
- Revenue = 0 → margins and expense ratio are "Not available"; do not divide by zero.
- Equity ≤ 0 → Debt-to-equity is shown as "Negative equity" with red status.
- Interest expense = 0 → Interest coverage is "No interest" with green status.
- No principal or interest due → DSCR is "No repayments due".

---

## 10. AI Financial Manager (Health Triggers)

Each trigger has a yellow and red condition, what to check, a suggested action and how often it runs. Triggers marked **Every entry** run locally right after posting, so they work offline. The rest can run in the online analysis service.

| # | Area | Watched | 🟡 Yellow | 🔴 Red | Look for | Suggested action | Checked |
|---|---|---|---|---|---|---|---|
| 1 | Sales & margin | Sales fall | Revenue growth at yellow line | Revenue growth at red line | Seasonality, a top customer buying less, days with no sales entered | Compare with the same month last year; list top 5 customers and products vs last month; promote or restock | Monthly |
| 2 | Sales & margin | Sales spike | Revenue 50% above the 3-month average | 100% above the 3-month average | Duplicate entries, one large one-off order, a deposit entered as a sale | Confirm the large entries and that none is duplicated | Every entry |
| 3 | Sales & margin | Gross margin falls | Gross margin at yellow line | Gross margin at red line | Supplier price rise, heavy discounting, returns | Compare unit cost with the last purchase; review discounts; change supplier | Monthly |
| 4 | Sales & margin | Thin or negative profit | Net margin **and** EBITDA margin at yellow line | Net margin **and** EBITDA margin at red line (loss) | Costs growing faster than sales, a one-off expense, low-margin mix | Find which cost lines or products drive the drop; cut low-return spend | Monthly |
| 5 | Costs | Overheads rising | Operating expense ratio at yellow line | At red line | Price rises, one-off repairs, billing or meter error | Open the category, compare with bills, freeze non-essential spend | Monthly |
| 6 | Stock | Stock building up | Inventory days at yellow line | At red line | Slower sales, over-ordering, buying ahead of a festival, unrecorded sales | Pause reorders on slowest items; promote aged stock; confirm the stock count | Monthly |
| 7 | Customers | Slow-paying customers | Receivable days at yellow line, **or** any balance 30 days past terms | Receivable days at red line, **or** any balance 60 days past terms | Weak follow-up, a struggling customer, generous credit | Remind largest overdue accounts first; ask for a deposit; shorten terms; pause credit | Daily |
| 8 | Suppliers | Overdue supplier bills | A supplier bill unpaid for 45 days | 60 days | Cash shortage, dispute, unrecorded payment | Pay the oldest and smallest first | Daily |
| 9 | Cash | Cash running short | Cash on hand < 1 month of usual expenses | < 2 weeks of expenses | Costs above receipts, a large purchase, drawings | Delay non-urgent purchases and drawings; chase receivables; list payments due in 14 days | Every entry |
| 10 | Cash | Profit not turning into cash | Profit positive but cash & bank fell 2 months in a row | Fell 3 months in a row | Stock build-up, unpaid customers, loan repayments, drawings, equipment | Show where the cash went (stock, customers, loans, owner) and act on the largest | Monthly |
| 11 | Liquidity | Short-term bills at risk | Current ratio at yellow line | At red line | Short-term bills growing faster than cash, stock and receivables | Collect receivables; reduce slow stock; refinance short-term debt into long-term | Monthly |
| 12 | Debt | Debt load high | Debt-to-equity **and** Debt-to-asset at yellow line | Both at red line | Borrowing out of proportion to owner's stake or assets | Avoid new borrowing; retain earnings; reduce drawings | Quarterly |
| 13 | Debt | Struggling to pay the lender | Interest coverage **and** DSCR at yellow line | Both at red line | Falling profit, borrowing to repay borrowing | Talk to the lender early; cut costs; delay equipment purchases | Quarterly, reviewed monthly |
| 14 | Debt | New loan while weak | — | A loan is received while DSCR is below its yellow line **or** cash runway is at its red line | Borrowing to repay borrowing | Show what the new instalment does to coverage and cash before the owner commits | Every entry |

**Helper definitions:**
- **Cash on hand** = 1000 + 1010.
- **Usual monthly expenses** = average monthly cash-out for operating expenses, interest and tax over the last 3 complete months *(assumption, see §12 Q8)*.
- **Cash runway** = Cash on hand ÷ usual monthly expenses, in months. Red line = 0.5 months (2 weeks); yellow = 1 month.
- **Days past terms** = today − date of the open pay-later item (no due dates yet, see §12 Q9).
- **Supplier bill age** = today − bill date of the open payable.

Every trigger result is stored with its date, level, the values used and whether the user dismissed it, so the app does not repeat the same alert.

---

## 11. Data Model Requirements

These follow from the rules above. They extend the offline-first schema (UUIDs created on device, `createdAt`, `updatedAt`, `deletedAt`, `syncStatus`).

| Table | Key fields |
|---|---|
| `accounts` | code, name, class, statementSection, normalSide, parentCode (for 1010 sub-accounts), currency, isActive |
| `transactions` | id, typeId, direction, groupId, date, amount, currency, payMethod (`cash` / `bank` / `later`), payAccountCode, counterpartyId, note, photoUri, reviewFlag, linkedTransactionId, status (`posted` / `reversed`) |
| `journal_entries` | id, transactionId (nullable for system entries), date, source (`user` / `system` / `opening` / `reversal`), reversesEntryId |
| `journal_lines` | id, entryId, lineNo, accountCode, side (`debit` / `credit`), amount (integer), currency |
| `counterparties` | id, name, kind (`customer` / `supplier` / `lender`) |
| `open_items` | id, transactionId, counterpartyId, kind (`receivable` / `payable` / `deposit`), originalAmount, openAmount, billDate, dueDate, status |
| `loans` | id, lender, lenderType (`bank_mfi` / `informal`), termMonths, accountCode, principal, balance, repaymentSchedule |
| `assets` | id, name, cost, purchaseDate, usefulLifeYears, accumulatedDepreciation, status |
| `budgets` | period, targetAmount |
| `ratio_snapshots` | period, ratioId, value, status, stage (`benchmark` / `own`) |
| `health_alerts` | id, triggerId, level, values, createdAt, dismissedAt |

**Invariants to enforce in code (and to unit test):**
1. Σ debits = Σ credits for every `journal_entry`.
2. Journal lines are never updated or deleted after posting.
3. A reversal's lines are the exact mirror of the original's lines.
4. `open_items.openAmount` is never negative.
5. A loan's balance is never negative.
6. Balance check (§8.2) = 0 and Cash Flow check (§8.3) = 0 for any period.
7. The §8.4 sample reproduces exactly.

**Posting engine outline:**

```ts
function post(tx: TransactionInput, rules: PostingRules): JournalEntry {
  const type = rules.types.find(t => t.id === tx.typeId);
  validate(tx, type);                 // required fields, pay-later allowed, guards
  const lines = type.rules
    .filter(r => conditionMet(r, tx)) // e.g. INTEREST > 0
    .map(r => ({
      side: r.side,
      accountCode: resolveAccount(r.account, tx),  // PAY, LOAN, TO, FROM or a code
      amount: resolveAmount(r.amount, tx),         // AMOUNT, COST, PRINCIPAL, INTEREST
    }));
  assertBalanced(lines);
  return saveEntry(tx, lines);        // also creates open item / loan / asset records per flags
}
```

---

## 12. Open Questions and Inconsistencies

Resolve these with the product owner before building the affected parts.

| # | Topic | Issue | Suggested default |
|---|---|---|---|
| Q1 | Service income & account 4100 | `posting_rules.json` has `service_income` and account `4100`. The Excel Types and Accounts sheets do not (but its StatementMap uses 4100). The Excel says Sales has 2 types; the JSON has 3. | Follow the JSON (v2): include both. |
| Q2 | Write-off action | In the JSON, not in the Excel Actions sheet. | Include it (JSON is v2). |
| Q3 | Unused expense accounts | `utilities` posts to 6200 although 6300 Internet & phone exists; `fees_licences` posts to 6950 although 6900 Bank & wallet fees exists; `other_cost` includes insurance although 6700 exists. | Keep the JSON rules; either split the types later or retire 6300, 6700 and 6900. |
| Q4 | COGS estimate | Product sale cost is "estimated if blank", but the method is not defined. | Use the last-3-months gross margin, or the industry benchmark (33%) until there is history. Stock count corrects it monthly. |
| Q5 | Currency | Rules and templates assume one currency, but the app records KHR and USD. | Pick one base currency per business; store the original currency and exchange rate on each transaction; statements in the base currency. |
| Q6 | Debt definition | The ratio sheet defines Debt = all loans received. The statement template's Debt-to-equity uses total liabilities. They give different numbers. | Ratios use loans only (2400–2700); label the statement's quick ratio "Liabilities-to-equity". |
| Q7 | EBIT | Not defined in the sources. | Operating profit + Other income. |
| Q8 | "Usual expenses" and cash runway | Not defined precisely. | 3-month average of cash paid for operating expenses, interest and tax. |
| Q9 | Payment terms | Trigger 7 uses "days past terms", but pay-later types have no due date or terms field. | Add a due date to pay-later entries; default 30 days. |
| Q10 | Loan schedule | DSCR needs principal and interest *due*, but the loan record only has lender, type and term. | Add a repayment schedule (instalment amount and frequency) to `loan_received`. |
| Q11 | Sales spike baseline | "Revenue 50% above the 3-month average" is checked on every entry, but the comparison window is not defined. | Compare month-to-date revenue, pro-rated to a full month, with the average of the last 3 complete months; only from month 4. |
| Q12 | Typos in source | "DCSR" in triggers 13 and 14 means DSCR. | Use DSCR. |
| Q13 | Opening balance split | "Difference goes to Owner's capital / Retained earnings" does not say how it is split. | Ask the user for owner's capital; post the remainder to retained earnings. |
| Q14 | Opening balance date | §7 says opening balances are "dated the day before the first daily entry", but onboarding happens before any entry exists. | Date them when onboarding is completed (new business) or at the end of the entered period (existing business). |

### Decisions (27 Oct 2026)

These are settled; the app and backend follow them.

- **Q1 Service income: keep.** `service_income` posts to `4100` Service revenue, and Sales revenue = `4000` + `4100` − `4900`. Many SMEs sell services; add the type and account to the Excel Types and Accounts sheets.
- **Q6 Debt: includes leases.** Debt = `2400` + `2500` + `2600` + `2700` (loans and lease obligations). A lease is a fixed obligation lenders count as debt. The statement's quick ratio is labelled "Liabilities-to-equity".
- **Q8 Usual expenses: cash paid.** Average over the last 3 complete months of cash paid for operating expenses, interest and tax. Pay-later bills count when they are paid (supplier payments against an expense bill).
- **Q9 Payment terms: none for now.** Pay-later entries have no due date. Trigger 7 uses days since the entry (yellow 30, red 60 days, or receivable days at its line); trigger 8 uses days since the bill (yellow 45, red 60 days).
- **Q13 Opening balance split: the user decides.** Onboarding shows a live balance check and offers to put the difference into Owner's capital; it cannot be finished until assets = liabilities + owner's equity.
- **Q14 Opening balance date: at onboarding** (or the end of the entered period for an existing business).
