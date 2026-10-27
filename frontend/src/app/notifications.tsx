import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
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
  const groups = (['today', 'yesterday', 'weekend'] as const).map((g) => ({ g, items: (q.data ?? []).filter((n) => n.group === g) })).filter((x) => x.items.length > 0);

  return (
    <ScreenShell title={t('screen.notifications')} nav={null} padding={36}>
      {q.source === 'cache' && <OfflineBanner fetchedAt={q.fetchedAt} />}
      {q.loading && !q.data ? <LoadingState /> : null}
      {q.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
      {q.error ? <ErrorState onRetry={q.reload} /> : null}
      {!q.loading && groups.length === 0 && <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', paddingVertical: 40 }}>{t('notifications.empty')}</Text>}
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
                <Pressable accessibilityRole="button" onPress={() => void dismissNotification(n.id).then(q.reload).catch(() => undefined)} hitSlop={8}>
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
