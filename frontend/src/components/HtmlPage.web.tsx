import { useState } from 'react';
import { View } from 'react-native';

/** Browser: the page in a frame laid out at paper width, shrunk to fit the space it has. */
export function HtmlPage({ html, pageWidth }: { html: string; pageWidth: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = size.width ? Math.min(1, size.width / pageWidth) : 1;
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {size.width > 0 && (
        <iframe
          title="preview"
          srcDoc={html}
          style={{ border: 0, width: pageWidth, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: 'top left', marginLeft: (size.width - pageWidth * scale) / 2 }}
        />
      )}
    </View>
  );
}
