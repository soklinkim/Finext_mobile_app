import { db, newRowMeta, schema } from './client';

/** Add an empty settings row plus standard account and category choices for a new install. */
/**
 * Starting rows are marked never edited (updatedAt 0). Any copy of the account's own data is newer and wins, so a new
 * device (a second phone, a reinstall, a cleared browser) cannot sync its blank profile over the real one; and its
 * starting accounts and categories are dropped if the account already has its own (see dropUnusedStartingRows in
 * services/sync). Editing a starting row gives it a real time, and from then on it syncs like any other row.
 */
export const STARTING_ROW_UPDATED_AT = 0;

export function seedInitialData(now: number): void {
  const row = () => ({ ...newRowMeta(now), updatedAt: STARTING_ROW_UPDATED_AT });
  db.insert(schema.settings).values({ ...row(), id: 'app' }).run();

  const banks = [
    { ...row(), name: 'Cash', kind: 'cash' as const, logoKey: null },
    { ...row(), name: 'KB PRASAC', kind: 'bank' as const, logoKey: 'kb-prasac' },
    { ...row(), name: 'ABA', kind: 'bank' as const, logoKey: 'aba' },
    { ...row(), name: 'Wing', kind: 'wallet' as const, logoKey: 'wing' },
  ];
  db.insert(schema.banks).values(banks).run();

  const category = (name: string, icon: string, kind: 'expense' | 'income' | 'savings') => ({
    ...row(),
    name,
    icon,
    kind,
    builtIn: true,
  });
  db.insert(schema.categories).values([
    category('Food', 'food', 'expense'),
    category('Transport', 'transport', 'expense'),
    category('Medicine', 'medicine', 'expense'),
    category('Groceries', 'groceries', 'expense'),
    category('Rent', 'rent', 'expense'),
    category('Gifts', 'gifts', 'expense'),
    category('Savings', 'savings', 'expense'),
    category('Entertainment', 'entertainment', 'expense'),
    category('Salary', 'salary', 'income'),
    category('Others', 'salary', 'income'),
    category('Travel', 'travel', 'savings'),
    category('New House', 'house', 'savings'),
    category('Car', 'car', 'savings'),
    category('Wedding', 'wedding', 'savings'),
  ]).run();
}
