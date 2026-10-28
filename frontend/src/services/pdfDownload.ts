import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Phone: make the PDF file and open the share sheet (Save to Files, Drive, Telegram…). The browser version is pdfDownload.web.ts. */
export async function downloadPdf(html: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  } else {
    await Print.printAsync({ uri });
  }
}
