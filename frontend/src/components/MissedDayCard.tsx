import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/services/bookkeeping';
import { fillDayWithAverage, markDayZero, ESTIMATE_MARK, type MissedDay } from '@/services/missedDays';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** "15 Oct" style date for a missed day, in the owner's language. */
export function missedDayLabel(date: number, locale: string): string {
  return new Date(date).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * A day with no entries, and the owner's three choices: enter the real numbers, fill it with their average
 * (marked as an estimate), or say nothing happened (zero). `onOpenCalendar` adds a link to the day in the calendar.
 */
export function MissedDayCard({ missed, onOpenCalendar }: { missed: MissedDay; onOpenCalendar?: () => void }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estimate = missed.estimate;
  const accent = dark ? colors.dark.primary : colors.primary[500];
  const line = dark ? colors.dark.border : colors.neutral[200];

  const run = async (action: () => Promise<boolean | void>) => {
    setBusy(true);
    setError(null);
    try {
      if ((await action()) === false) setError(t('missed.failed'));
    } catch {
      setError(t('missed.failed'));
    } finally {
      setBusy(false);
    }
  };

  const option = (icon: IconName, title: string, sub: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
        borderColor: line, opacity: disabled ? 0.5 : 1, backgroundColor: dark ? colors.dark.field : colors.white }}>
      <Icon name={icon} size={18} color={accent} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body-sm" weight={600} tone="primary-900">{title}</Text>
        <Text variant="caption" tone="neutral-600">{sub}</Text>
      </View>
      <Icon name="chevronRight" size={14} color={colors.neutral[500]} />
    </Pressable>
  );

  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: dark ? colors.dark.border : '#F5C2CC',
      backgroundColor: dark ? colors.dark.surface : '#FFF6F8' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.danger }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight={700} tone="primary-900">{t('missed.title', { date: missedDayLabel(missed.date, locale) })}</Text>
          <Text variant="caption" tone="neutral-600">{t('missed.body')}</Text>
        </View>
        {onOpenCalendar && (
          <Pressable accessibilityRole="button" onPress={onOpenCalendar} hitSlop={8}>
            <Text variant="caption" weight={600} style={{ color: accent }}>{t('missed.openCalendar')}</Text>
          </Pressable>
        )}
      </View>
      {option('plus', t('missed.enter'), t('missed.enterSub'),
        () => router.push({ pathname: '/add-entry', params: { date: String(missed.date + 12 * 60 * 60 * 1000) } }))}
      {option('chart', t('missed.average'),
        estimate
          ? t('missed.averageSub', { in: formatMoney(estimate.income, estimate.currency), out: formatMoney(estimate.cost, estimate.currency), days: estimate.basedOnDays, mark: ESTIMATE_MARK })
          : t('missed.noAverage'),
        () => void run(() => fillDayWithAverage(missed, {
          salesTitle: t('missed.estSales'),
          costsTitle: t('missed.estCosts'),
          note: t('missed.estNote', { days: estimate?.basedOnDays ?? 0 }),
        })),
        !estimate)}
      {option('check', t('missed.zero'), t('missed.zeroSub'), () => void run(() => markDayZero(missed.day)))}
      {error && <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}
