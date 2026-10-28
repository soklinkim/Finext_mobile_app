import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Statement } from '@/services/analysis';
import { formatMoney } from '@/services/bookkeeping';

export const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Print styles for statements (shared with the loan application pack): a formal heading block, then one panel per
 * period side by side (current, prior), small-caps section labels, zero rows greyed, ruled subtotals and a
 * double-ruled final total.
 */
export const STATEMENT_CSS = `
    @page { margin: 16mm 14mm; }
    body { font-family: 'Poppins', -apple-system, 'Segoe UI', Roboto, 'Noto Sans Khmer', Arial, sans-serif; color: #111; font-size: 8.5pt; }
    .stmt-heading { font-weight: 700; text-transform: uppercase; line-height: 1.45; letter-spacing: 0.2px; }
    .stmt-heading .business { font-size: 11pt; }
    .stmt-heading .title { font-size: 14pt; }
    .stmt-heading .period { font-size: 10.5pt; font-weight: 600; }
    .stmt-rule { border: 0; border-top: 1px solid #d4d4d4; margin: 14px 0 20px; }
    .stmt-cols { display: flex; gap: 14mm; align-items: flex-start; }
    .stmt-col { flex: 1; min-width: 0; }
    .stmt-col.single { flex: 0 1 105mm; }
    .stmt-col table { width: 100%; border-collapse: collapse; }
    .stmt-col th { text-align: left; font-size: 8.5pt; font-weight: 700; padding: 0 0 6px; border-bottom: 1.5px solid #111; }
    .stmt-col td { padding: 5px 0; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
    .stmt-col td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding-left: 8px; }
    .stmt-col tr.section td { font-size: 6.8pt; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; padding-top: 14px; border-bottom: 0; }
    .stmt-col tr.zero td { color: #a3a3a3; }
    .stmt-col tr.subtotal td { font-weight: 700; border-top: 1px solid #111; }
    .stmt-col tr.total td { font-weight: 700; border-top: 1.5px solid #111; border-bottom: 3px double #111; padding: 7px 0; }
    .stmt-check { font-size: 7.5pt; color: #666; margin-top: 14px; }`;

/** Formal amount: "USD 1,234.00", negatives in brackets "(USD 1,234.00)". Also used by the on-screen paper view. */
export function paperMoney(minor: number, currency: Statement['currency']): string {
  const digits = formatMoney(Math.abs(minor), currency).replace(/[^\d.,]/g, '');
  const amount = `${currency} ${digits}`;
  return minor < 0 ? `(${amount})` : amount;
}

/** One statement: formal heading, a panel per period, and the balance / cash flow check (no page wrapper). */
export function statementSection(statement: Statement, business: string): string {
  const heading = statement.heading ?? [business, statement.title, statement.periodLabel];
  const periods = statement.columnHeaders.filter((h): h is string => Boolean(h));
  const panel = (index: number) => {
    const label = `${index === 0 ? 'Current' : 'Prior'} · ${periods[index]}`;
    const rows = statement.sections
      .map((section) => {
        const title = section.heading ? `<tr class="section"><td colspan="2">${esc(section.heading)}</td></tr>` : '';
        const lines = section.lines
          .map((line) => {
            const value = index === 0 ? line.current : line.prior;
            const style = line.style ?? 'line';
            const zero = style === 'line' && !value;
            return `<tr class="${style}${zero ? ' zero' : ''}"><td>${esc(line.label)}</td><td class="num">${value === undefined ? '—' : esc(paperMoney(value, statement.currency))}</td></tr>`;
          })
          .join('');
        return title + lines;
      })
      .join('');
    return `<div class="stmt-col${periods.length === 1 ? ' single' : ''}"><table><thead><tr><th colspan="2">${esc(label)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  const check = statement.check
    ? `<p class="stmt-check">${esc(statement.check.label)}: ${statement.check.difference === 0 ? 'difference 0' : esc(paperMoney(statement.check.difference, statement.currency))}</p>`
    : '';
  const [first, second, third] = heading;
  return `<div class="stmt-heading">
      <div class="business">${esc(first)}</div>
      ${second ? `<div class="title">${esc(second)}</div>` : ''}
      ${third ? `<div class="period">${esc(third)}</div>` : ''}
    </div>
    <hr class="stmt-rule">
    <div class="stmt-cols">${periods.map((_, index) => panel(index)).join('')}</div>
    ${check}`;
}

/** A printable page for one statement. */
export function statementHtml(statement: Statement, business: string): string {
  const heading = statement.heading ?? [business, statement.title];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading[1])}</title><style>${STATEMENT_CSS}
  </style></head><body>
    ${statementSection(statement, business)}
  </body></html>`;
}

/** Browser: print the page from a hidden frame (expo-print on web would print the whole app). */
function printOnWeb(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/**
 * Download a page as PDF: on a phone, make a PDF and open the share sheet (save to Files, send in a chat…);
 * in a browser, open the print dialog, where "Save as PDF" is one of the printers.
 */
export async function exportPdf(html: string, title: string): Promise<void> {
  if (Platform.OS === 'web') return printOnWeb(html);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  } else {
    await Print.printAsync({ uri });
  }
}

export function exportStatementPdf(statement: Statement, business: string): Promise<void> {
  return exportPdf(statementHtml(statement, business), statement.title);
}
