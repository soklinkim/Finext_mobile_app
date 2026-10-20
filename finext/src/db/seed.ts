import { db, newRowMeta, schema } from './client';

const DAY = 24 * 60 * 60 * 1000;

/** Epoch ms for "N days ago at HH:mm" so the demo data always falls in the current week/month. */
function daysAgoAt(now: number, days: number, hh: number, mm: number): number {
  const d = new Date(now - days * DAY);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/**
 * Mock data matching the Figma screens:
 *   Total Balance $7,783.00 · Total Expense -$1,187.40 · budget target $20,000
 *   Employee Salary $4,000 · Food Supplies -$100 · Rent -$674.40 · Transport -$4.13
 *   Income $4,120.00 (salary + $120 other income)
 * Seed dates are relative to "now". Money amounts are integer minor units (USD cents).
 */
export function seedDemoData(now: number): void {
  const row = () => newRowMeta(now);

  db.insert(schema.settings).values({ ...row(), id: 'app' }).run();

  // --- banks: cash drawer, banks, wallet
  const cash = { ...row(), name: 'Cash', kind: 'cash' as const, logoKey: null };
  const kb = { ...row(), name: 'KB PRASAC', kind: 'bank' as const, logoKey: 'kb-prasac' };
  const aba = { ...row(), name: 'ABA', kind: 'bank' as const, logoKey: 'aba' };
  const wing = { ...row(), name: 'Wing', kind: 'wallet' as const, logoKey: 'wing' };
  db.insert(schema.banks).values([cash, kb, aba, wing]).run();

  // --- opening balances (4,850.40 USD equivalent at 4,000 KHR/USD → balance 7,783.00 after the seed transactions)
  const asset = (bankId: string, name: string, amount: number, currency: 'KHR' | 'USD') => ({
    ...row(),
    kind: 'cash_bank' as const,
    name,
    bankId,
    amount,
    currency,
    asOf: daysAgoAt(now, 40, 9, 0),
  });
  db.insert(schema.businessAssets)
    .values([
      asset(cash.id, 'Cash', 85040, 'USD'),
      asset(kb.id, 'KB PRASAC', 200000, 'USD'),
      asset(kb.id, 'KB PRASAC', 5_000_000, 'KHR'),
      asset(aba.id, 'ABA', 75000, 'USD'),
    ])
    .run();

  // --- categories
  const cat = (name: string, icon: string, kind: 'expense' | 'income' | 'savings') => ({
    ...row(),
    name,
    icon,
    kind,
    builtIn: true,
  });
  const c = {
    food: cat('Food', 'food', 'expense'),
    transport: cat('Transport', 'transport', 'expense'),
    medicine: cat('Medicine', 'medicine', 'expense'),
    groceries: cat('Groceries', 'groceries', 'expense'),
    rent: cat('Rent', 'rent', 'expense'),
    gifts: cat('Gifts', 'gifts', 'expense'),
    savings: cat('Savings', 'savings', 'expense'),
    entertainment: cat('Entertainment', 'entertainment', 'expense'),
    salary: cat('Salary', 'salary', 'income'),
    others: cat('Others', 'salary', 'income'),
    travel: cat('Travel', 'travel', 'savings'),
    house: cat('New House', 'house', 'savings'),
    car: cat('Car', 'car', 'savings'),
    wedding: cat('Wedding', 'wedding', 'savings'),
  };
  db.insert(schema.categories).values(Object.values(c)).run();

  // --- transactions
  const tx = (
    title: string,
    typeId: string,
    direction: 'in' | 'out',
    groupId: string,
    cents: number,
    payMethod: 'cash' | 'bank',
    bankId: string,
    categoryId: string | null,
    days: number,
    hh: number,
    mm: number,
  ) => ({
    ...row(),
    title,
    typeId,
    direction,
    groupId,
    amount: cents,
    currency: 'USD' as const,
    exchangeRate: 4000,
    payMethod,
    bankId,
    toBankId: null,
    categoryId,
    counterparty: null,
    note: null,
    occurredAt: daysAgoAt(now, days, hh, mm),
    reviewFlag: false,
    meta: null,
  });
  db.insert(schema.transactions)
    .values([
      tx('Employee Salary', 'service_income', 'in', 'sales', 400000, 'bank', kb.id, c.salary.id, 1, 18, 27),
      tx('Food Supplies', 'other_cost', 'out', 'monthly', 10000, 'cash', cash.id, c.groceries.id, 6, 17, 0),
      tx('Dinner', 'other_cost', 'out', 'monthly', 7040, 'cash', cash.id, c.food.id, 8, 19, 10),
      tx('Others', 'other_income', 'in', 'otherin', 12000, 'bank', aba.id, c.others.id, 10, 17, 0),
      tx('Rent', 'rent', 'out', 'monthly', 67440, 'bank', kb.id, c.rent.id, 14, 8, 30),
      tx('Electricity', 'utilities', 'out', 'monthly', 12000, 'bank', kb.id, null, 16, 10, 15),
      tx('Transport', 'transport', 'out', 'monthly', 413, 'cash', cash.id, c.transport.id, 20, 9, 30),
      tx('Facebook Ads', 'marketing', 'out', 'monthly', 21847, 'bank', aba.id, null, 22, 14, 5),
    ])
    .run();

  db.insert(schema.budgets)
    .values({ ...row(), name: 'Expense budget', period: 'all', targetAmount: 2_000_000, currency: 'USD' })
    .run();
}

/** Dev helper: wipe every table and restore the demo data. */
export function resetDemoData(): void {
  const t = schema;
  db.delete(t.transactions).run();
  db.delete(t.businessAssets).run();
  db.delete(t.budgets).run();
  db.delete(t.categories).run();
  db.delete(t.banks).run();
  db.delete(t.settings).run();
  seedDemoData(Date.now());
}
