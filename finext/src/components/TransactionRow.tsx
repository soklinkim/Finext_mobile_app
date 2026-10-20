import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { formatTxDate } from '@/lib/format';
import { formatMoney, type TransactionView } from '@/services/bookkeeping';

// Icon tile backgrounds cycle through the three tile tokens (§6.5).
const TILE_BG = ['bg-accent-tile', 'bg-primary-500', 'bg-accent-tile-strong'] as const;

/** §6.5 — [icon tile] title + date │ category │ amount */
export function TransactionRow({ tx, index = 0, onPress }: { tx: TransactionView; index?: number; onPress?: () => void }) {
  const { t, locale } = useI18n();
  const icon = tx.categoryIcon ?? (tx.direction === 'in' ? 'salary' : tx.direction === 'move' ? 'swap' : 'groceries');
  const amountText = tx.direction === 'move' ? formatMoney(tx.amount, tx.currency) : formatMoney(tx.signed, tx.currency);
  const category = tx.categoryName ?? t(`type.${tx.typeId}` as never);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tx.title}, ${category}, ${amountText}`}
      onPress={onPress}
      className="flex-row items-center"
      style={{ minHeight: 70, gap: 12 }}
    >
      <View className={`items-center justify-center rounded-md ${TILE_BG[index % 3]}`} style={{ width: 56, height: 56 }}>
        <Icon name={icon} size={28} color={colors.white} strokeWidth={1.5} />
      </View>
      <View className="flex-1">
        <Text variant="body" numberOfLines={1}>
          {tx.title}
        </Text>
        <Text variant="caption" weight={600} tone="expense" numberOfLines={1}>
          {formatTxDate(tx.occurredAt, locale)}
        </Text>
      </View>
      <View className="bg-primary-200" style={{ width: 1, height: 36 }} />
      <View className="items-center justify-center" style={{ width: 70 }}>
        <Text variant="body-sm" numberOfLines={2} style={{ textAlign: 'center' }}>
          {category}
        </Text>
      </View>
      <View className="bg-primary-200" style={{ width: 1, height: 36 }} />
      <View style={{ minWidth: 76 }} className="items-end">
        <Text variant="body" tone={tx.direction === 'out' ? 'expense' : 'primary-900'} adjustsFontSizeToFit numberOfLines={1}>
          {amountText}
        </Text>
      </View>
    </Pressable>
  );
}
