import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Statement } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';

export const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Print styles for statements (shared with the loan application pack). */
export const STATEMENT_CSS = `
    @page { margin: 18mm 16mm; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans Khmer', Arial, sans-serif; color: #111; font-size: 11pt; }
    .heading { font-weight: 700; line-height: 1.5; margin-bottom: 18px; }
    .heading div:first-child { font-size: 13pt; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 600; font-size: 9pt; color: #555; padding: 4px 6px; border-bottom: 1px solid #999; }
    td { padding: 5px 6px; border-bottom: 1px solid #e3e3e3; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 22%; }
    .prior { color: #555; }
    tr.section td { font-weight: 700; padding-top: 14px; border-bottom: none; }
    tr.subtotal td { font-weight: 600; }
    tr.total td { font-weight: 700; border-top: 1.5px solid #111; border-bottom: 3px double #111; }
    .check { font-size: 9pt; color: #555; margin-top: 12px; }
    .currency { font-size: 9pt; color: #555; margin: -12px 0 12px; }`;

/** One statement: formal heading, the table, and the balance / cash flow check (no page wrapper). */
export function statementSection(statement: Statement, business: string): string {
  const heading = statement.heading ?? [business.toUpperCase(), statement.title.toUpperCase(), statement.periodLabel.toUpperCase()];
  const twoCols = Boolean(statement.columnHeaders[1]);
  const money = (n: number, showPlus?: boolean) => esc(formatMoneyWhole(n, statement.currency, { showPlus }));
  const rows = statement.sections
    .map((section) => {
      const title = section.heading ? `<tr class="section"><td colspan="${twoCols ? 3 : 2}">${esc(section.heading)}</td></tr>` : '';
      const lines = section.lines
        .map((line) => {
          const prior = twoCols ? `<td class="num prior">${line.prior !== undefined ? money(line.prior, line.showPlus) : ''}</td>` : '';
          return `<tr class="${line.style ?? 'line'}"><td>${esc(line.label)}</td><td class="num">${money(line.current, line.showPlus)}</td>${prior}</tr>`;
        })
        .join('');
      return title + lines;
    })
    .join('');
  const headers = statement.columnHeaders.map((h) => `<th class="num">${esc(h ?? '')}</th>`).join('');
  const check = statement.check
    ? `<p class="check">${esc(statement.check.label)}: ${statement.check.difference === 0 ? 'difference 0' : money(statement.check.difference)}</p>`
    : '';
  return `<div class="heading">${heading.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
    <p class="currency">Amounts in ${esc(statement.currency)}</p>
    <table><thead><tr><th></th>${headers}</tr></thead><tbody>${rows}</tbody></table>
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
