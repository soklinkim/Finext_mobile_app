import { View } from 'react-native';
import { Text } from './Text';
import { colors, tint } from '@/theme';

type Tone = 'success' | 'alert' | 'neutral';

/** §6.24 — one plain sentence left, the effect right. Background = semantic colour at 15% (primary-50 for no profit effect). */
export function ImpactStrip({ sentence, effect, tone }: { sentence: string; effect: string; tone: Tone }) {
  const bg = tone === 'success' ? tint(colors.success, 0.15) : tone === 'alert' ? tint(colors.alert, 0.15) : colors.primary[50];
  return (
    <View
      accessible
      accessibilityLabel={`${sentence}. ${effect}`}
      className="flex-row items-center justify-between rounded-field"
      style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 8, gap: 12, marginBottom: 8 }}
    >
      <View className="flex-1">
        <Text variant="caption" tone="primary-900" style={{ fontSize: 11.5, lineHeight: 16 }}>
          {sentence}
        </Text>
      </View>
      <Text variant="body" weight={700} tone="primary-900">
        {effect}
      </Text>
    </View>
  );
}
