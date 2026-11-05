import { Pressable, View } from 'react-native';
import { Text, type Tone } from './Text';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.27 — KPI tile; the first can be the primary-900 highlight tile. */
export function KpiTile({ label, value, caption, highlight, valueTone, onPress }: { label: string; value: string; caption?: string; highlight?: boolean; valueTone?: Tone; onPress?: () => void }) {
  const dark = useAppTheme();
  const tile = (
    <View className={`flex-1 rounded-lg ${highlight ? 'bg-primary-900' : 'bg-primary-50'}`} style={{ paddingHorizontal: 12, paddingVertical: 10, ...(dark ? { backgroundColor: (highlight ? colors.primary[900] : colors.dark.surface) } : {}) }}>
      <Text variant="micro" tone={highlight ? 'primary-200' : 'primary-900'} style={{ fontSize: 10.5 }}>
        {label}
      </Text>
      <Text variant="body-lg" weight={700} tone={highlight ? 'white' : valueTone ?? 'primary-900'} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      {caption ? (
        <Text variant="micro" weight={300} tone={highlight ? 'primary-200' : 'neutral-600'} style={{ fontSize: 10 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
  // A tile with a formula behind it: tapping it shows how the number is worked out.
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} accessibilityHint="Shows how this is calculated" onPress={onPress} style={{ flex: 1, minWidth: 0 }}>
      {tile}
    </Pressable>
  ) : tile;
}
