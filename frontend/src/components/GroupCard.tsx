import { View } from 'react-native';
import { Text } from './Text';
import { ChipRow } from './Chip';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.18 — primary-50 card with title, optional subtitle and a chip row. */
export function GroupCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const dark = useAppTheme();
  return (
    <View className="bg-primary-50 rounded-md" style={{ paddingHorizontal: 12, paddingTop: 9, paddingBottom: 11, gap: 6, backgroundColor: dark ? colors.dark.surface : undefined }}>
      <View>
        <Text variant="body-sm" weight={600} tone="primary-900">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="micro" weight={300} tone="neutral-600">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChipRow>{children}</ChipRow>
    </View>
  );
}
