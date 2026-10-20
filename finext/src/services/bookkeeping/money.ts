/**
 * Money helpers. Amounts are ALWAYS integers in minor units:
 *   USD → cents, KHR → riel (no decimals). Floats only appear at display time.
 */
export type Currency = 'KHR' | 'USD';

const KHR_SYMBOL = '៛';

function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format per style guide §10: USD `$4,000.00`, KHR `5,000,000 ៛`, negatives `-$100.00`.
 * `showPlus` adds a leading + for positive values (cash-flow adjustments).
 */
export function formatMoney(minor: number, currency: Currency, opts: { showPlus?: boolean; absolute?: boolean } = {}): string {
  const negative = minor < 0 && !opts.absolute;
  const abs = Math.abs(minor);
  const sign = negative ? '-' : opts.showPlus && minor > 0 ? '+' : '';
  if (currency === 'KHR') return `${sign}${withCommas(abs)} ${KHR_SYMBOL}`;
  const dollars = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}$${withCommas(dollars)}.${cents}`;
}

/** Whole-dollar form used in impact strips and statements, e.g. `$6,650`. */
export function formatMoneyWhole(minor: number, currency: Currency, opts: { showPlus?: boolean } = {}): string {
  if (currency === 'KHR') return formatMoney(minor, currency, opts);
  const negative = minor < 0;
  const abs = Math.round(Math.abs(minor) / 100);
  const sign = negative ? '-' : opts.showPlus && minor > 0 ? '+' : '';
  return `${sign}$${withCommas(abs)}`;
}

/** Convert minor units between currencies using KHR-per-USD. Result is an integer in the target's minor units. */
export function convertMinor(minor: number, from: Currency, to: Currency, rateKhrPerUsd: number): number {
  if (from === to) return minor;
  if (from === 'KHR') return Math.round((minor * 100) / rateKhrPerUsd); // riel → cents
  return Math.round((minor / 100) * rateKhrPerUsd); // cents → riel
}

/** Parse what the user typed ("1,200.50" for USD, "2,400,000" for KHR) into minor units. NaN-safe: returns 0. */
export function parseAmountInput(text: string, currency: Currency): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  if (currency === 'KHR') return Math.round(Number(cleaned.split('.')[0]) || 0);
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number((frac + '00').slice(0, 2));
  return (Number(whole) || 0) * 100 + cents;
}

/** Inverse of parseAmountInput, for putting a stored value back into a text field. */
export function amountToInput(minor: number, currency: Currency): string {
  if (minor === 0) return '';
  if (currency === 'KHR') return withCommas(minor);
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents ? `${withCommas(whole)}.${String(cents).padStart(2, '0')}` : withCommas(whole);
}

/** Keep digits (and one dot for USD), add comma thousands as the user types. */
export function formatAmountTyping(raw: string, currency: Currency): string {
  let cleaned = raw.replace(/[^0-9.]/g, '');
  if (currency === 'KHR') cleaned = cleaned.replace(/\./g, '');
  const [whole, ...fracParts] = cleaned.split('.');
  const frac = fracParts.join('').slice(0, 2);
  const withCommas = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return currency === 'USD' && cleaned.includes('.') ? `${withCommas}.${frac}` : withCommas;
}
