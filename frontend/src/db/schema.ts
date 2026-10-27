import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Columns every table carries so the backend developer can sync generically:
 *  - id: UUID v4 generated ON DEVICE (never autoincrement)
 *  - createdAt / updatedAt: epoch milliseconds
 *  - deletedAt: soft delete (null = live). Rows are never physically removed.
 *  - syncStatus: 'pending' until the sync service has pushed the row, then 'synced'
 */
const base = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  syncStatus: text('sync_status', { enum: ['pending', 'synced'] }).notNull().default('pending'),
};

export type Currency = 'KHR' | 'USD';

/** Cash drawer, bank accounts and mobile wallets (Business Assets > Cash & bank balances). */
export const banks = sqliteTable('banks', {
  ...base,
  name: text('name').notNull(),
  kind: text('kind', { enum: ['cash', 'bank', 'wallet'] }).notNull(),
  logoKey: text('logo_key'),
});

export const categories = sqliteTable('categories', {
  ...base,
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  kind: text('kind', { enum: ['expense', 'income', 'savings'] }).notNull().default('expense'),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  // Savings goals only: the amount to save (minor units) and its currency.
  targetAmount: integer('target_amount'),
  targetCurrency: text('target_currency', { enum: ['KHR', 'USD'] }),
});

/**
 * One row per user transaction (not per journal line).
 * amount is an integer in minor units: USD = cents, KHR = riel. Never a float.
 * Users type positive numbers; `direction` decides the sign.
 */
export const transactions = sqliteTable('transactions', {
  ...base,
  title: text('title').notNull(),
  typeId: text('type_id').notNull(), // see services/bookkeeping/entryTypes.ts
  direction: text('direction', { enum: ['in', 'out', 'move'] }).notNull(),
  groupId: text('group_id'),
  amount: integer('amount').notNull(),
  currency: text('currency', { enum: ['KHR', 'USD'] }).notNull(),
  exchangeRate: integer('exchange_rate').notNull(), // KHR per 1 USD at entry time
  payMethod: text('pay_method', { enum: ['cash', 'bank', 'later'] }).notNull(),
  bankId: text('bank_id').references(() => banks.id), // account paid from / received into / move source
  toBankId: text('to_bank_id').references(() => banks.id), // move destination
  categoryId: text('category_id').references(() => categories.id),
  counterparty: text('counterparty'), // customer / supplier / lender name
  note: text('note'),
  occurredAt: integer('occurred_at').notNull(),
  reviewFlag: integer('review_flag', { mode: 'boolean' }).notNull().default(false),
  meta: text('meta'), // JSON for type-specific fields (lender type, term, asset name, useful life, ...)
});

/** Opening balances / business assets entered in onboarding ("1. Enter Business Assets"). */
export const businessAssets = sqliteTable('business_assets', {
  ...base,
  kind: text('kind', {
    enum: ['cash_bank', 'receivable', 'inventory', 'prepaid', 'equipment', 'other_long_term'],
  }).notNull(),
  name: text('name').notNull(),
  bankId: text('bank_id').references(() => banks.id), // set when kind = 'cash_bank'
  amount: integer('amount').notNull(), // minor units
  currency: text('currency', { enum: ['KHR', 'USD'] }).notNull(),
  asOf: integer('as_of').notNull(),
});

export const budgets = sqliteTable('budgets', {
  ...base,
  name: text('name').notNull(),
  period: text('period', { enum: ['all', 'monthly'] }).notNull().default('all'),
  targetAmount: integer('target_amount').notNull(), // minor units
  currency: text('currency', { enum: ['KHR', 'USD'] }).notNull(),
});

/** Opening liabilities/equity and existing-period income statement figures from onboarding. */
export const onboardingFinancialEntries = sqliteTable('onboarding_financial_entries', {
  ...base,
  section: text('section', { enum: ['balance_sheet', 'income_statement'] }).notNull(),
  entryKey: text('entry_key').notNull(),
  amount: integer('amount').notNull(), // minor units
  currency: text('currency', { enum: ['KHR', 'USD'] }).notNull(),
  asOf: integer('as_of'),
  periodStart: integer('period_start'),
  periodEnd: integer('period_end'),
});

/** Single row (id = 'app'): language, onboarding status, business profile, preferences. */
export const settings = sqliteTable('settings', {
  ...base,
  language: text('language', { enum: ['en-GB', 'km'] }).notNull().default('en-GB'),
  onboardingStatus: text('onboarding_status', { enum: ['not_started', 'in_progress', 'completed'] })
    .notNull()
    .default('not_started'),
  startOption: text('start_option', { enum: ['new', 'existing'] }),
  displayCurrency: text('display_currency', { enum: ['KHR', 'USD'] }).notNull().default('USD'),
  rateKhrPerUsd: integer('rate_khr_per_usd').notNull().default(4000),
  businessName: text('business_name'),
  businessIndustry: text('business_industry'),
  registrationStatus: text('registration_status', { enum: ['registered', 'unregistered'] }),
  registrationNumber: text('registration_number'),
  startOperationDate: text('start_operation_date'),
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  ownerPhone: text('owner_phone'),
  location: text('location'),
  contact: text('contact'),
  mainProducts: text('main_products'),
  pushNotifications: integer('push_notifications', { mode: 'boolean' }).notNull().default(true),
  darkTheme: integer('dark_theme', { mode: 'boolean' }).notNull().default(false),
});

export type Bank = typeof banks.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type BusinessAsset = typeof businessAssets.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Settings = typeof settings.$inferSelect;

export const SYNCED_TABLES = ['banks', 'categories', 'transactions', 'business_assets', 'budgets', 'settings', 'onboarding_financial_entries'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
