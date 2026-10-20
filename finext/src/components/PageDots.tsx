import { View } from 'react-native';
import { colors } from '@/theme';

/** §6.12 — 12 px dots, 16 px gap. Active = filled primary-200, inactive = 2 px primary-900 ring. */
export function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <View className="flex-row items-center justify-center" style={{ gap: 16 }} accessibilityLabel={`${active + 1} / ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: i === active ? colors.primary[200] : 'transparent',
            borderWidth: i === active ? 0 : 2,
            borderColor: colors.primary[900],
          }}
        />
      ))}
    </View>
  );
}
