import { db, newRowMeta, schema } from './client';

/** Add an empty settings row plus standard account and category choices for a new install. */
export function seedInitialData(now: number): void {
  const row = () => newRowMeta(now);
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
