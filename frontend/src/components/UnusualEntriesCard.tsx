import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusMark } from './HealthCharts';
import { Icon } from './Icon';
import { Text } from './Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate } from '@/lib/format';
import { getUnusualEntries, type UnusualEntry } from '@/services/analysis';
import { formatMoney } from '@/services/bookkeeping';
import { dismissUnusual, getDismissedUnusual } from '@/services/preferences';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const SHOWN = 3;
const keyOf = (item: UnusualEntry) => `${item.id}:${item.code}`;

/** The reason in plain words, with the business's own amounts. */
function reason(t: ReturnType<typeof useI18n>['t'], item: UnusualEntry): string {
  const usual = item.params.usual !== undefined ? formatMoney(Math.round(item.params.usual), item.currency) : '';
  switch (item.code) {
    case 'duplicate':
      return t('unusual.duplicate', { date: item.params.otherAt ? formatInputDate(item.params.otherAt) : '' });
    case 'spike':
      return t('unusual.spike', { times: item.params.times ?? '', amount: usual });
    case 'extra_zero':
      return t('unusual.extraZero', { times: item.params.times ?? '', amount: usual });
    case 'maybe_expense':
      return t('unusual.maybeExpense', { type: t(`type.${item.params.usualType}` as TKey) });
    default:
      return t('unusual.futureDate');
  }
}

/**
 * "Check these entries": recent entries that look like mistakes (a duplicate, an extra zero, rent recorded as
 * income…). Tap one to open and fix it, or mark it as right. Clean books keep the risk answers trustworthy.
 */
export function UnusualEntriesCard() {
  const { t } = useI18n();
  const router = useRouter();
  const dark = useAppTheme();
  const query = useAnalysisQuery(getUnusualEntries);
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let active = true;
    void getDismissedUnusual().then((keys) => { if (active) setDismissed(keys); });
    return () => { active = false; };
  }, []);

  const items = (query.data ?? []).filter((item) => dismissed && !dismissed.has(keyOf(item)));
  if (!dismissed || items.length === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  const line = dark ? colors.dark.border : colors.neutral[200];

  const markRight = (item: UnusualEntry) => {
    setDismissed((current) => new Set([...(current ?? []), keyOf(item)]));
    void dismissUnusual(keyOf(item));
  };

  return (
    <View style={{ marginTop: 20, borderRadius: radius.card, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 8 }}>
        <StatusMark kind="watch" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight={700} tone="primary-900">{t('unusual.title', { count: items.length })}</Text>
          <Text variant="micro" tone="neutral-600">{t('unusual.subtitle')}</Text>
        </View>
      </View>
      {shown.map((item) => (
        <View key={keyOf(item)} style={{ borderTopWidth: 1, borderTopColor: line, paddingVertical: 12, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${reason(t, item)}`}
            onPress={() => router.push({ pathname: '/entry/[id]', params: { id: item.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text variant="body-sm" weight={600} tone="primary-900" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text>
                <Text variant="body-sm" weight={700} tone={item.direction === 'out' ? 'expense' : 'primary-900'}>
                  {formatMoney(item.direction === 'out' ? -item.amount : item.amount, item.currency)}
                </Text>
              </View>
              <Text variant="micro" tone="neutral-600">{formatInputDate(item.occurredAt)} · {reason(t, item)}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.neutral[500]} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => markRight(item)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
            <Text variant="micro" weight={600} style={{ color: colors.primary[500] }}>{t('unusual.looksRight')}</Text>
          </Pressable>
        </View>
      ))}
      {items.length > SHOWN && (
        <Pressable accessibilityRole="button" onPress={() => setAll((value) => !value)} style={{ borderTopWidth: 1, borderTopColor: line, paddingVertical: 10 }}>
          <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{all ? t('loan.showLess') : t('loan.showMore', { count: items.length - SHOWN })}</Text>
        </Pressable>
      )}
    </View>
  );
}
