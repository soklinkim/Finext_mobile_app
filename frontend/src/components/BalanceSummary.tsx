import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { formatMoney, type Currency } from '@/services/bookkeeping';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  balance: number;
  expense: number; // positive minor units; shown with a leading "-"
  currency: Currency;
}

/** §6.2 — two columns split by a 1 px white divider: Total Balance (white) | Total Expense (accent-expense). */
export function BalanceSummary({ balance, expense, currency }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <View className="flex-row items-center px-6" style={{ gap: 20, width: '100%' }}>
      <View className="flex-1 items-center" style={{ gap: 2 }}>
        <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
          <Icon name="income" size={12} color={dark ? colors.dark.primary : colors.neutral[900]} />
          <Text variant="caption" style={{ textAlign: 'center' }}>{t('summary.totalBalance')}</Text>
        </View>
        <Text variant="amount-xl" tone="white" style={{ textAlign: 'center' }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(balance, currency)}
        </Text>
      </View>
      <View className="bg-white" style={{ width: 1, height: 40, backgroundColor: dark ? colors.dark.border : undefined }} />
      <View className="flex-1 items-center" style={{ gap: 2 }}>
        <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
          <Icon name="expense" size={12} color={dark ? colors.dark.primary : colors.neutral[900]} />
          <Text variant="caption" style={{ textAlign: 'center' }}>{t('summary.totalExpense')}</Text>
        </View>
        <Text variant="amount-xl" tone="expense" style={{ textAlign: 'center' }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(-expense, currency)}
        </Text>
      </View>
    </View>
  );
}
