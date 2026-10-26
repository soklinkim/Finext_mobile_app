import { View } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.27 — KPI tile; the first can be the primary-900 highlight tile. */
export function KpiTile({ label, value, caption, highlight }: { label: string; value: string; caption?: string; highlight?: boolean }) {
  const dark = useAppTheme();
  return (
    <View className={`flex-1 rounded-lg ${highlight ? 'bg-primary-900' : 'bg-primary-50'}`} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: dark ? (highlight ? colors.primary[900] : colors.dark.surface) : undefined }}>
      <Text variant="micro" tone={highlight ? 'primary-200' : 'primary-900'} style={{ fontSize: 10.5 }}>
        {label}
      </Text>
      <Text variant="body-lg" weight={700} tone={highlight ? 'white' : 'primary-900'} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      {caption ? (
        <Text variant="micro" weight={300} tone={highlight ? 'primary-200' : 'neutral-600'} style={{ fontSize: 10 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
