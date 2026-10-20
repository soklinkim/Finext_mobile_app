import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import { colors } from '@/theme';
import { formatMoney, type BudgetStatus, type Currency } from '@/services/bookkeeping';

interface Props {
  percent: number;
  target: number; // minor units
  currency: Currency;
  status: BudgetStatus;
  /** status sentence key; defaults to the expenses sentence */
  statusKey?: TKey;
  /** rendered between the bar and the status line (Account Balance puts the Income / Expense cards here) */
  between?: React.ReactNode;
}

/** §6.3 — 28 px pill, black fill with white % label, italic target on the right, status line below. */
export function BudgetProgress({ percent, target, currency, status, statusKey, between }: Props) {
  const { t } = useI18n();
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.min(Math.max(percent, 0), 100), { duration: 600, easing: Easing.out(Easing.ease) });
  }, [percent, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const tone = status === 'danger' ? 'danger' : status === 'warning' ? 'warning' : 'neutral-900';
  const key: TKey = statusKey ?? (status === 'danger' ? 'budget.over' : status === 'warning' ? 'budget.warning' : 'budget.ok');
  const iconColor = status === 'danger' ? colors.danger : status === 'warning' ? colors.warning : colors.neutral[900];

  return (
    <View className="px-6" style={{ gap: 12 }}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100) }}
        className="overflow-hidden rounded-pill bg-white"
        style={{ height: 28, justifyContent: 'center' }}
      >
        <Animated.View className="absolute left-0 top-0 bottom-0 rounded-pill bg-progress-fill" style={[{ minWidth: 56 }, fillStyle]} />
        <View className="flex-row items-center justify-between px-4">
          <Text variant="caption" tone="white">
            {percent}%
          </Text>
          <Text variant="caption" italic>
            {formatMoney(target, currency)}
          </Text>
        </View>
      </View>
      {between}
      <View className="flex-row items-center" style={{ gap: 8, paddingLeft: 8 }}>
        <Icon name="checkSquare" size={16} color={iconColor} />
        <Text variant="body-sm" weight={500} tone={tone}>
          {t(key, { percent })}
        </Text>
      </View>
    </View>
  );
}
