import type { Locale } from '@/theme';

export const MONTHS: Record<Locale, string[]> = {
  'en-GB': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  km: ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'],
};

export const MONTHS_SHORT: Record<Locale, string[]> = {
  'en-GB': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  km: MONTHS.km,
};

/** Monday-first weekday labels (style guide §6.13). */
export const WEEKDAYS: Record<Locale, string[]> = {
  'en-GB': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  km: ['ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហ', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'],
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:mm - Month D` e.g. `18:27 - April 30` (§10). */
export function formatTxDate(ms: number, locale: Locale): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} - ${MONTHS[locale][d.getMonth()]} ${d.getDate()}`;
}

/** `HH:mm - Mon D` notification stamp, e.g. `17:00 - April 24`. */
export const formatStamp = formatTxDate;

/** Input format `DD/MM/YY`. */
export function formatInputDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/** Parse `DD/MM/YY` (or `DD/MM/YYYY`); returns null when invalid. */
export function parseInputDate(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 12, 0, 0, 0);
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return d.getTime();
}

/** `20 Oct, 14:32` — used by the "Offline · last updated …" banner. */
export function formatUpdated(ms: number, locale: Locale): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_SHORT[locale][d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface MonthGroup<T> {
  key: string;
  year: number;
  month: number;
  items: T[];
}

/** Group newest-first rows by calendar month ("April", "March"). */
export function groupByMonth<T extends { occurredAt: number }>(rows: T[]): MonthGroup<T>[] {
  const out: MonthGroup<T>[] = [];
  for (const row of rows) {
    const d = new Date(row.occurredAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, year: d.getFullYear(), month: d.getMonth(), items: [] };
      out.push(g);
    }
    g.items.push(row);
  }
  return out;
}

/** Axis labels: 1k, 5k, 10k, 15k. `value` in whole currency units. */
export function formatAxis(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k`.replace('.0k', 'k') : String(value);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
