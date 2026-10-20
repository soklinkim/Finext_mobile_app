import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from '@/theme';

/** §6.25 — white card with a primary-200 border explaining why an option is or is not available. */
export function InfoCard({ children }: { children: string }) {
  return (
    <View className="flex-row items-center bg-white border border-primary-200 rounded-lg" style={{ padding: 10, gap: 8 }}>
      <Icon name="info" size={16} color={colors.primary[500]} />
      <View className="flex-1">
        <Text variant="caption" tone="primary-900" weight={400}>
          {children}
        </Text>
      </View>
    </View>
  );
}
