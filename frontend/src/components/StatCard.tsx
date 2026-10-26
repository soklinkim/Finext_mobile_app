import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  kind: 'income' | 'expense';
  label: string;
  amount: string;
  /** 'card' = white 170 × 100 card on the hero (Dashboard); 'plain' = no background, on the sheet (Analysis) */
  variant?: 'card' | 'plain';
}

/** §6.4 — outlined arrow-square icon, label, amount. Income = primary-900, expense = accent-expense. */
export function StatCard({ kind, label, amount, variant = 'card' }: Props) {
  const isIncome = kind === 'income';
  const dark = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${amount}`}
      className={`items-center justify-center ${variant === 'card' ? 'bg-white' : ''}`}
      style={[{ gap: 4, backgroundColor: dark && variant === 'card' ? colors.dark.surface : undefined }, variant === 'card' ? { flex: 1, minHeight: 100, borderRadius: radius.card, paddingVertical: 12 } : { flex: 1 }]}
    >
      <Icon name={isIncome ? 'income' : 'expense'} size={28} color={isIncome ? (dark ? colors.dark.primary : colors.primary[200]) : colors.primary[900]} strokeWidth={1.5} />
      <Text variant="body-lg" tone="primary-900">
        {label}
      </Text>
      <Text variant="amount-lg" tone={isIncome ? 'primary-900' : 'expense'} adjustsFontSizeToFit numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}
