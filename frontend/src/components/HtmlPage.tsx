import { WebView } from 'react-native-webview';

/** Shows a whole HTML page (the PDF preview); its viewport tag sets the width. The browser version is HtmlPage.web.tsx. */
export function HtmlPage({ html }: { html: string; pageWidth: number }) {
  return <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} scalesPageToFit />;
}
