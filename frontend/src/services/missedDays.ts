/**
 * Missed days: past days with no entries since the business started recording. The owner answers each one:
 * - enters the real numbers (Add entry, dated that day), or
 * - "nothing happened" (closed, no sales): recorded as zero, nothing is added, or
 * - "use my average": one estimated sales entry and one estimated costs entry from the average of recorded days
 *   just before it. Estimated entries are marked (`meta.estimated`, a "~" title) so they are never taken for real
 *   figures, and the owner can replace them later.
 * The answers are kept in the synced profile (settings.missedDays), so another phone does not ask again.
 */
import { addTransaction, convertMinor, getSettings, listBanks, listEntriesSince, REVERSAL_TYPE, reverseEntry, updateSettings, type Currency, type Transaction } from '@/services/bookkeeping';

const DAY = 24 * 60 * 60 * 1000;
/** How far back missed days are flagged. */
export const MISSED_LOOKBACK_DAYS = 60;
/** The average uses recorded days in this many days before the missed one. */
export const AVERAGE_WINDOW_DAYS = 28;
/** Marks an estimated entry's title. */
export const ESTIMATE_MARK = '~';

const INCOME_TYPES = new Set(['product_sale', 'service_income']);
/**
 * Day-to-day costs only. Rent, wages, bills and fees are paid monthly, so a missed day does not add them again.
 * Stock purchases are not a cost when bought (they become inventory); an estimated sale already gets its cost of
 * goods from the usual margin, so counting stock here would count that cost twice.
 */
const COST_TYPES = new Set(['transport', 'marketing', 'repairs', 'other_cost']);

/** Entries that still count: not reversals, and not reversed by a later entry. */
function counted(entries: Transaction[]): Transaction[] {
  const reversed = new Set<string>();
  for (const t of entries) {
    if (t.typeId !== REVERSAL_TYPE || !t.meta) continue;
    try {
      const id = (JSON.parse(t.meta) as { reversesId?: string }).reversesId;
      if (id) reversed.add(id);
    } catch {
      // not a readable reversal: ignore
    }
  }
  return entries.filter((t) => t.typeId !== REVERSAL_TYPE && !reversed.has(t.id));
}

export type DayAnswer = 'zero' | 'estimated';

export interface DayEstimate {
  /** minor units of `currency` */
  income: number;
  cost: number;
  currency: Currency;
  /** recorded days the average is based on */
  basedOnDays: number;
}

export interface MissedDay {
  /** YYYY-MM-DD, local time */
  day: string;
  /** local midnight */
  date: number;
  /** null when there are no recorded days to average */
  estimate: DayEstimate | null;
}

/** YYYY-MM-DD for a time, in the phone's local time. */
export function dayKey(time: number | Date): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of a YYYY-MM-DD day. */
export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const isEstimated = (t: Pick<Transaction, 'meta'>) => {
  try {
    return Boolean(t.meta && (JSON.parse(t.meta) as { estimated?: boolean }).estimated);
  } catch {
    return false;
  }
};

export function readAnswers(raw: string | null | undefined): Record<string, DayAnswer> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, DayAnswer] => e[1] === 'zero' || e[1] === 'estimated'));
  } catch {
    return {};
  }
}

/** Average daily sales and running costs over the recorded (not estimated) days before `before`. */
function averageBefore(entries: Transaction[], before: number, currency: Currency, rate: number): DayEstimate | null {
  const from = before - AVERAGE_WINDOW_DAYS * DAY;
  const days = new Map<string, { income: number; cost: number }>();
  for (const t of entries) {
    if (t.occurredAt < from || t.occurredAt >= before || isEstimated(t)) continue;
    // Only days with sales or day-to-day costs recorded: a day with just a transfer or a loan says nothing about them.
    const income = INCOME_TYPES.has(t.typeId);
    if (!income && !COST_TYPES.has(t.typeId)) continue;
    const key = dayKey(t.occurredAt);
    const totals = days.get(key) ?? { income: 0, cost: 0 };
    const amount = convertMinor(t.amount, t.currency as Currency, currency, t.exchangeRate ?? rate);
    if (income) totals.income += amount;
    else totals.cost += amount;
    days.set(key, totals);
  }
  if (!days.size) return null;
  const sum = [...days.values()].reduce((a, d) => ({ income: a.income + d.income, cost: a.cost + d.cost }), { income: 0, cost: 0 });
  const income = Math.round(sum.income / days.size);
  const cost = Math.round(sum.cost / days.size);
  return income > 0 || cost > 0 ? { income, cost, currency, basedOnDays: days.size } : null;
}

/**
 * Past days, newest first, with no entries and no answer yet: from the first recorded day (at most
 * MISSED_LOOKBACK_DAYS ago) up to yesterday. Nothing is flagged before the business's first entry.
 */
export async function listMissedDays(now = Date.now()): Promise<MissedDay[]> {
  const settings = await getSettings();
  const answers = readAnswers(settings.missedDays);
  const today = startOfDay(now);
  const lookback = today - MISSED_LOOKBACK_DAYS * DAY;
  // Reversed entries (and the reversals) do not count: a day whose only entries were reversed is still missed.
  const entries = counted(await listEntriesSince(lookback - AVERAGE_WINDOW_DAYS * DAY));
  const recorded = entries.filter((t) => !isEstimated(t));
  if (!recorded.length) return [];
  // From the day the owner started recording in FINEXT (the first entry *added*), not the oldest entry's date: rows
  // imported from a past bank statement are dated months back, and the days between them were not "forgotten".
  const first = startOfDay(Math.min(...recorded.map((t) => t.createdAt)));
  const active = new Set(entries.map((t) => dayKey(t.occurredAt)));
  const currency = settings.displayCurrency as Currency;
  const missed: MissedDay[] = [];
  for (let date = today - DAY; date >= Math.max(first, lookback); date = startOfDay(date - DAY / 2)) {
    const day = dayKey(date);
    // "estimated" is only an answer while its estimates stand; once they are removed the day is asked about again.
    if (active.has(day) || answers[day] === 'zero') continue;
    missed.push({ day, date, estimate: averageBefore(entries, date, currency, settings.rateKhrPerUsd) });
  }
  return missed;
}

/** The answer given for each day, keyed YYYY-MM-DD (for the calendar). */
export async function getDayAnswers(): Promise<Record<string, DayAnswer>> {
  return readAnswers((await getSettings()).missedDays);
}

async function saveAnswer(day: string, answer: DayAnswer | null): Promise<void> {
  const answers = readAnswers((await getSettings()).missedDays);
  if (answer) answers[day] = answer;
  else delete answers[day];
  // Keep the profile small: answers older than the lookback are no longer needed.
  const oldest = dayKey(Date.now() - (MISSED_LOOKBACK_DAYS + 1) * DAY);
  const kept = Object.fromEntries(Object.entries(answers).filter(([d]) => d >= oldest));
  await updateSettings({ missedDays: JSON.stringify(kept) });
}

/** "Nothing happened that day": counted as zero, nothing is added to the books. */
export function markDayZero(day: string): Promise<void> {
  return saveAnswer(day, 'zero');
}

/** Ask about this day again (e.g. after "zero" by mistake). */
export function clearDayAnswer(day: string): Promise<void> {
  return saveAnswer(day, null);
}

export interface EstimateText {
  salesTitle: string;
  costsTitle: string;
  /** the note on both entries, explaining how they were estimated */
  note: string;
}

/**
 * Fill a missed day with the average of recorded days before it: an estimated sale and an estimated running cost,
 * paid in Cash, each marked as an estimate. Returns false when there is nothing to average or no Cash account.
 */
export async function fillDayWithAverage(missed: MissedDay, text: EstimateText): Promise<boolean> {
  const estimate = missed.estimate;
  const cash = (await listBanks()).find((b) => b.kind === 'cash');
  if (!estimate || !cash) return false;
  const occurredAt = missed.date + 12 * 60 * 60 * 1000;
  const meta = { estimated: true, basedOnDays: estimate.basedOnDays };
  const common = { currency: estimate.currency, payMethod: 'cash' as const, bankId: cash.id, note: text.note, occurredAt, meta };
  if (estimate.income > 0) {
    const sale = await addTransaction({ ...common, typeId: 'product_sale', amount: estimate.income, title: `${ESTIMATE_MARK} ${text.salesTitle}` });
    if (!sale.ok) return false;
  }
  if (estimate.cost > 0) {
    const cost = await addTransaction({ ...common, typeId: 'other_cost', amount: estimate.cost, title: `${ESTIMATE_MARK} ${text.costsTitle}` });
    if (!cost.ok) return false;
  }
  await saveAnswer(missed.day, 'estimated');
  return true;
}

/** Whether an entry was estimated from an average rather than recorded. */
export const isEstimatedEntry = isEstimated;

/** Days of a month (0-based) that still hold estimated entries, for the calendar's amber dot. */
export async function listEstimatedDays(year: number, month: number): Promise<number[]> {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  const entries = counted(await listEntriesSince(start)).filter((t) => t.occurredAt < end && isEstimated(t));
  return [...new Set(entries.map((t) => new Date(t.occurredAt).getDate()))];
}

/**
 * A day's estimates, and whether real entries were added to it since (by hand or from a bank statement).
 * Both together would count the day twice, so the owner is offered to remove the estimates.
 */
export async function getDayEstimates(day: string): Promise<{ estimates: Transaction[]; hasReal: boolean }> {
  const start = dayStart(day);
  const entries = counted(await listEntriesSince(start)).filter((t) => t.occurredAt < start + DAY);
  return { estimates: entries.filter(isEstimated), hasReal: entries.some((t) => !isEstimated(t)) };
}

/** Remove a day's estimates (each is reversed, as the books never edit an entry). Returns false if one could not be. */
export async function removeEstimates(day: string, reversalTitle: string): Promise<boolean> {
  const { estimates } = await getDayEstimates(day);
  let ok = true;
  for (const entry of estimates) {
    const result = await reverseEntry(entry.id, `${reversalTitle}: ${entry.title}`);
    ok = ok && result.ok;
  }
  return ok;
}
