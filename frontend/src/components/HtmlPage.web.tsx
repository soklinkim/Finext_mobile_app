import { useState } from 'react';
import { View } from 'react-native';

/**
 * Browser: the page in a frame laid out at paper width, shrunk to fit the width and stretched to fill the whole height.
 * The height is given in percent of an absolutely positioned box that touches all four edges of the preview area, not
 * from a measured pixel value, so the page can never end up shorter than the screen (a stale measurement left the
 * statement as a small box with empty space under it on phones).
 */
export function HtmlPage({ html, pageWidth }: { html: string; pageWidth: number }) {
  const [width, setWidth] = useState(0);
  const scale = width ? Math.min(1, width / pageWidth) : 1;
  return (
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <iframe
            title="preview"
            srcDoc={html}
            style={{
              display: 'block',
              border: 0,
              width: pageWidth,
              height: `${100 / scale}%`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              marginLeft: Math.max(0, (width - pageWidth * scale) / 2),
            }}
          />
        </div>
      )}
    </View>
  );
}
