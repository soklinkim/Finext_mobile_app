import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MissedDayCard } from '@/components/MissedDayCard';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { listMissedDays } from '@/services/missedDays';
import { markAllNoticesRead, markNoticeRead, useReminders } from '@/services/reminders';
import { Icon, type IconName } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState, useErrorText } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { formatStamp } from '@/lib/format';
import { colors } from '@/theme';
import { dismissNotification, getNotifications, type AppNotification } from '@/services/analysis';
import { useAppTheme } from '@/theme/AppTheme';

const ICON: Record<AppNotification['type'], IconName> = { reminder: 'bell', update: 'star', transaction: 'dollar', advice: 'expense' };
const GROUP_KEY: Record<AppNotification['group'], TKey> = { today: 'notif.today', yesterday: 'notif.yesterday', weekend: 'notif.weekend' };

/** Notifications — grouped Today / Yesterday / This Weekend. Server-generated, cached for offline reading. */
export default function Notifications() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const q = useAnalysisQuery(getNotifications);
  const errorText = useErrorText();
  const [dismissError, setDismissError] = useState<string | null>(null);
  const router = useRouter();
  // Days with no entries: worked out on the phone, so they show offline too.
  const { data: missed } = useLocalQuery(() => listMissedDays(), []);
  const { notices, unread } = useReminders();
  const shownMissed = (missed ?? []).slice(0, 3);
  const groups = (['today', 'yesterday', 'weekend'] as const).map((g) => ({ g, items: (q.data ?? []).filter((n) => n.group === g) })).filter((x) => x.items.length > 0);

  return (
    <ScreenShell title={t('screen.notifications')} nav={null} padding={36}>
      {q.source === 'cache' && <OfflineBanner fetchedAt={q.fetchedAt} />}
      {q.loading && !q.data ? <LoadingState /> : null}
      {q.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
      {q.error ? <ErrorState onRetry={q.reload} error={q.error} /> : null}
      {dismissError ? <Text variant="caption" tone="danger" accessibilityLiveRegion="polite" style={{ marginBottom: 12 }}>{dismissError}</Text> : null}
      {notices.length > 0 && (
        <View style={{ gap: 8, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" weight={400} tone="primary-900">{t('reminder.section')}{unread > 0 ? ` (${unread})` : ''}</Text>
            {unread > 0 && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void markAllNoticesRead()}>
                <Text variant="caption" weight={600} tone="primary-500">{t('reminder.markAll')}</Text>
              </Pressable>
            )}
          </View>
          {notices.slice(0, 10).map((n) => (
            <Pressable key={n.id} accessibilityRole="button" onPress={() => { void markNoticeRead(n.id); router.push('/add-entry'); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: dark ? colors.dark.surface : n.read ? colors.white : colors.primary[50], borderWidth: 1, borderColor: dark ? colors.dark.border : colors.primary[200] }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[200] }}>
                <Icon name="bell" size={20} color={dark ? colors.dark.primary : colors.primary[900]} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body-sm" weight={n.read ? 400 : 700} tone="primary-900">{t('reminder.item')}</Text>
                <Text variant="caption" tone="neutral-600">{formatStamp(n.at, locale).replace(/^(\d\d:\d\d) - /, '$1 - ')}</Text>
              </View>
              {!n.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger }} />}
            </Pressable>
          ))}
        </View>
      )}
      {shownMissed.length > 0 && (
        <View style={{ gap: 10, marginBottom: 20 }}>
          <Text variant="caption" weight={400} tone="primary-900">{t('missed.section')}</Text>
          {shownMissed.map((m) => (
            <MissedDayCard key={m.day} missed={m} onOpenCalendar={() => router.push({ pathname: '/calendar', params: { day: m.day } })} />
          ))}
          {(missed?.length ?? 0) > shownMissed.length && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: '/calendar', params: { day: missed![shownMissed.length].day } })} style={{ alignSelf: 'center', paddingVertical: 6 }}>
              <Text variant="caption" weight={600} tone="primary-500">{t('missed.more', { count: (missed?.length ?? 0) - shownMissed.length })}</Text>
            </Pressable>
          )}
        </View>
      )}
      {!q.loading && groups.length === 0 && !shownMissed.length && !notices.length && <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', paddingVertical: 40 }}>{t('notifications.empty')}</Text>}
      {groups.map(({ g, items }) => (
        <View key={g}>
          <Text variant="caption" weight={400} tone="primary-900" style={{ marginBottom: 8 }}>
            {t(GROUP_KEY[g])}
          </Text>
          {items.map((n) => (
            <View key={n.id} className="border-b border-primary-200" style={{ paddingVertical: 12, gap: 4, ...(dark ? { borderColor: colors.dark.border } : {}) }} accessible accessibilityLabel={`${n.title}. ${n.body}`}>
              <View className="flex-row" style={{ gap: 12 }}>
                <View className="items-center justify-center bg-primary-200 rounded-field" style={{ width: 38, height: 38, ...(dark ? { backgroundColor: colors.dark.field } : {}) }}>
                  <Icon name={ICON[n.type]} size={22} color={dark ? colors.dark.primary : colors.primary[900]} strokeWidth={1.5} />
                </View>
                <View className="flex-1">
                  <Text variant="body-lg" weight={500}>
                    {n.title}
                  </Text>
                  <Text variant="caption" weight={400} tone="primary-900">
                    {n.body}
                  </Text>
                  {n.detail ? (
                    <Text variant="caption" weight={600} tone="primary-500">
                      {n.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Pressable accessibilityRole="button" onPress={() => { setDismissError(null); void dismissNotification(n.id).then(q.reload).catch((e: unknown) => setDismissError(errorText(e))); }} hitSlop={8}>
                  <Text variant="caption" weight={500} tone="primary-500">{t('notifications.dismiss')}</Text>
                </Pressable>
                <Text variant="caption" weight={400} tone="primary-500">
                  {formatStamp(n.at, locale).replace(/^(\d\d:\d\d) - /, '$1 - ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScreenShell>
  );
}
