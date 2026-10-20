import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { formatMoney, type Currency } from '@/services/bookkeeping';

interface Props {
  balance: number;
  expense: number; // positive minor units; shown with a leading "-"
  currency: Currency;
}

/** §6.2 — two columns split by a 1 px white divider: Total Balance (white) | Total Expense (accent-expense). */
export function BalanceSummary({ balance, expense, currency }: Props) {
  const { t } = useI18n();
  return (
    <View className="flex-row items-center justify-center px-6" style={{ gap: 24 }}>
      <View className="flex-1 items-start" style={{ paddingLeft: 12 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Icon name="income" size={12} color={colors.neutral[900]} />
          <Text variant="caption">{t('summary.totalBalance')}</Text>
        </View>
        <Text variant="amount-xl" tone="white" adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(balance, currency)}
        </Text>
      </View>
      <View className="bg-white" style={{ width: 1, height: 40 }} />
      <View className="flex-1 items-start">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Icon name="expense" size={12} color={colors.neutral[900]} />
          <Text variant="caption">{t('summary.totalExpense')}</Text>
        </View>
        <Text variant="amount-xl" tone="expense" adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(-expense, currency)}
        </Text>
      </View>
    </View>
  );
}
