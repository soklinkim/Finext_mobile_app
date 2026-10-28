/** Saved file name: the title without characters Windows and phones refuse in file names. */
const fileName = (title: string) => `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'FINEXT'}.pdf`;

/** Limit the page's styles to the PDF's own box, so they do not restyle the app while the file is made. */
function scoped(css: string): string {
  return css
    .replace(/@page\s*\{[^}]*\}/g, '')
    .replace(/([^{}]+)\{/g, (_, selectors: string) =>
      `${selectors.split(',').map((s) => (s.trim() === 'body' ? '.pdf-root' : `.pdf-root ${s.trim()}`)).join(', ')} {`);
}

/** Browser: turn the page into a PDF file and save it straight to Downloads, with no print dialog. */
export async function downloadPdf(html: string, title: string): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js');
  const page = new DOMParser().parseFromString(html, 'text/html');
  const css = Array.from(page.querySelectorAll('style'), (style) => style.textContent ?? '').join('\n');
  const root = document.createElement('div');
  root.className = 'pdf-root';
  root.style.width = '182mm'; // A4 less the 14 mm side margins
  root.innerHTML = `<style>${scoped(css)}</style>${page.body.innerHTML}`;
  // Not typed inline: html2pdf.js supports `pagebreak` but its type file leaves it out.
  const options = {
    margin: [16, 14, 16, 14] as [number, number, number, number],
    filename: fileName(title),
    image: { type: 'jpeg' as const, quality: 0.96 },
    html2canvas: { scale: 2, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css'], avoid: ['tr', '.tile', '.stmt-heading'] },
  };
  await html2pdf().set(options).from(root).save();
}
