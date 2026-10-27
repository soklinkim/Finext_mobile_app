import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.25 — white card with a primary-200 border explaining why an option is or is not available. */
export function InfoCard({ children }: { children: string }) {
  const dark = useAppTheme();
  return (
    <View className="flex-row items-center bg-white border border-primary-200 rounded-lg" style={{ padding: 10, gap: 8, ...(dark ? { backgroundColor: colors.dark.surface } : {}), ...(dark ? { borderColor: colors.dark.border } : {}) }}>
      <Icon name="info" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
      <View className="flex-1">
        <Text variant="caption" tone="primary-900" weight={400}>
          {children}
        </Text>
      </View>
    </View>
  );
}
