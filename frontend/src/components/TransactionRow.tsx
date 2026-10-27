import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
  const icon = tx.categoryIcon ?? (tx.direction === 'in' ? 'salary' : tx.direction === 'move' ? 'swap' : 'groceries');
  const amountText = tx.direction === 'move' ? formatMoney(tx.amount, tx.currency) : formatMoney(tx.signed, tx.currency);
  const category = tx.categoryName ?? t(`type.${tx.typeId}` as never);
  // Status chip: reversed entries, and how much of a pay-later entry is still owed.
  const badge = tx.status === 'reversed'
    ? { label: t('entry.badgeReversed'), color: colors.neutral[600] }
    : tx.openBalance === null
      ? null
      : tx.openBalance === 0
        ? tx.writtenOff
          ? { label: t('entry.badgeWrittenOff'), color: colors.neutral[600] }
          : { label: t('entry.badgePaid'), color: colors.success }
        : tx.openBalance < tx.amount
          ? { label: t('entry.badgeOwed', { amount: formatMoney(tx.openBalance, tx.currency) }), color: colors.alert }
          : { label: t('entry.badgeUnpaid'), color: colors.alert };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tx.title}, ${category}, ${formatTxDate(tx.occurredAt, locale)}, ${amountText}${badge ? `, ${badge.label}` : ''}`}
      onPress={onPress ?? (() => router.push({ pathname: '/entry/[id]', params: { id: tx.id } }))}
      className="flex-row items-center"
      style={{ minHeight: 76, gap: 10 }}
    >
      <View className={`items-center justify-center rounded-md ${TILE_BG[index % 3]}`} style={{ width: 50, height: 50 }}>
        <Icon name={icon} size={25} color={colors.white} strokeWidth={1.5} />
      </View>
      <View className="flex-1 justify-center" style={{ minWidth: 0, gap: 2 }}>
        <Text variant="body-sm" weight={600} numberOfLines={1}>
          {tx.title}
        </Text>
        <Text variant="micro" tone="neutral-600" numberOfLines={1}>
          {category}
        </Text>
        <Text variant="micro" weight={500} tone="neutral-600" numberOfLines={1}>
          {formatTxDate(tx.occurredAt, locale)}
        </Text>
      </View>
      <View style={{ minWidth: 76 }} className="items-end">
        <Text
          variant="body"
          tone={tx.status === 'reversed' ? 'neutral-500' : tx.direction === 'out' ? 'expense' : 'primary-900'}
          style={tx.status === 'reversed' ? { textDecorationLine: 'line-through' } : undefined}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {amountText}
        </Text>
        {badge && (
          <View style={{ marginTop: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: `${badge.color}22` }}>
            <Text variant="micro" weight={600} style={{ color: badge.color, fontSize: 10 }} numberOfLines={1}>{badge.label}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
