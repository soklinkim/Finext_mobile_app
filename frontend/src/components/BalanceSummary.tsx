import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { formatMoney, type Currency } from '@/services/bookkeeping';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  balance: number;
  expense: number; // positive minor units; shown with a leading "-"
  currency: Currency;
  /** Opens the detail (Account Balance); the card then shows a chevron. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** One card on the hero band: Total Balance as the headline figure, Total Expense as a quieter line under it. */
export function BalanceSummary({ balance, expense, currency, onPress, accessibilityLabel }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const muted = dark ? colors.dark.muted : colors.neutral[600];
  const body = (
    <>
      <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
        <Text variant="caption" tone="neutral-600">{t('summary.totalBalance')}</Text>
        {onPress && <Icon name="chevronRight" size={18} color={muted} />}
      </View>
      <Text variant="amount-xl" tone="primary-900" adjustsFontSizeToFit numberOfLines={1}>
        {formatMoney(balance, currency)}
      </Text>
      <View style={{ height: 1, backgroundColor: dark ? colors.dark.border : colors.neutral[200], marginVertical: 4 }} />
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View className="items-center justify-center" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Icon name="expense" size={14} color={dark ? colors.dark.primary : colors.accent.expense} />
        </View>
        <Text variant="body-sm" tone="neutral-600" style={{ flex: 1 }}>{t('summary.totalExpense')}</Text>
        <Text variant="body" weight={700} tone="expense" numberOfLines={1}>
          {formatMoney(-expense, currency)}
        </Text>
      </View>
    </>
  );
  const style = { marginHorizontal: 24, padding: 16, gap: 4, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white };
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
