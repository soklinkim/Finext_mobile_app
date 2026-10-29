import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Versioned schema migrations, tracked with PRAGMA user_version.
 * Keep in sync with schema.ts. Append new entries; never edit a shipped one.
 */
const COMMON = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending'`;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE banks (${COMMON},
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    logo_key TEXT
  );
  CREATE TABLE categories (${COMMON},
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'expense',
    built_in INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transactions (${COMMON},
    title TEXT NOT NULL,
    type_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    group_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate INTEGER NOT NULL,
    pay_method TEXT NOT NULL,
    bank_id TEXT REFERENCES banks(id),
    to_bank_id TEXT REFERENCES banks(id),
    category_id TEXT REFERENCES categories(id),
    counterparty TEXT,
    note TEXT,
    occurred_at INTEGER NOT NULL,
    review_flag INTEGER NOT NULL DEFAULT 0,
    meta TEXT
  );
  CREATE INDEX idx_transactions_occurred ON transactions(occurred_at);
  CREATE INDEX idx_transactions_sync ON transactions(sync_status);
  CREATE TABLE business_assets (${COMMON},
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    bank_id TEXT REFERENCES banks(id),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    as_of INTEGER NOT NULL
  );
  CREATE TABLE budgets (${COMMON},
    name TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT 'all',
    target_amount INTEGER NOT NULL,
    currency TEXT NOT NULL
  );
  CREATE TABLE settings (${COMMON},
    language TEXT NOT NULL DEFAULT 'en-GB',
    onboarding_status TEXT NOT NULL DEFAULT 'not_started',
    start_option TEXT,
    display_currency TEXT NOT NULL DEFAULT 'USD',
    rate_khr_per_usd INTEGER NOT NULL DEFAULT 4000,
    business_name TEXT,
    business_industry TEXT,
    registration_status TEXT,
    registration_number TEXT,
    start_operation_date TEXT,
    owner_name TEXT,
    location TEXT,
    contact TEXT,
    main_products TEXT,
    push_notifications INTEGER NOT NULL DEFAULT 1,
    dark_theme INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  CREATE TABLE onboarding_financial_entries (${COMMON},
    section TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    as_of INTEGER,
    period_start INTEGER,
    period_end INTEGER
  );
  CREATE INDEX idx_onboarding_financial_entries_section ON onboarding_financial_entries(section);
  `,
  `
  ALTER TABLE settings ADD COLUMN owner_email TEXT;
  ALTER TABLE settings ADD COLUMN owner_phone TEXT;
  `,
  `
  UPDATE transactions
    SET deleted_at = updated_at + 1, updated_at = updated_at + 1, sync_status = 'pending'
    WHERE created_at = (SELECT created_at FROM settings WHERE id = 'app')
      AND title IN ('Employee Salary', 'Food Supplies', 'Dinner', 'Others', 'Rent', 'Electricity', 'Transport', 'Facebook Ads');
  UPDATE business_assets
    SET deleted_at = updated_at + 1, updated_at = updated_at + 1, sync_status = 'pending'
    WHERE created_at = (SELECT created_at FROM settings WHERE id = 'app')
      AND kind = 'cash_bank'
      AND name IN ('Cash', 'KB PRASAC', 'ABA');
  UPDATE budgets
    SET deleted_at = updated_at + 1, updated_at = updated_at + 1, sync_status = 'pending'
    WHERE created_at = (SELECT created_at FROM settings WHERE id = 'app')
      AND name = 'Expense budget'
      AND target_amount = 2000000;
  UPDATE banks
    SET deleted_at = updated_at + 1, updated_at = updated_at + 1, sync_status = 'pending'
    WHERE created_at = (SELECT created_at FROM settings WHERE id = 'app')
      AND name IN ('KB PRASAC', 'ABA', 'Wing')
      AND NOT EXISTS (SELECT 1 FROM business_assets WHERE bank_id = banks.id AND deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM transactions WHERE (bank_id = banks.id OR to_bank_id = banks.id) AND deleted_at IS NULL);
  `,
  `
  ALTER TABLE categories ADD COLUMN target_amount INTEGER;
  ALTER TABLE categories ADD COLUMN target_currency TEXT;
  `,
];

export function runMigrations(sqlite: SQLiteDatabase): void {
  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    // The version is recorded in the same transaction as the migration: if the app stops between the two (a reload
    // during first launch), a migration that ran but was not recorded would run again and fail ("table banks already
    // exists"), and the app could not start.
    sqlite.withTransactionSync(() => {
      sqlite.execSync(MIGRATIONS[version]);
      sqlite.execSync(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
}
