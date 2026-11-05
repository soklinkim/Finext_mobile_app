import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useLastSynced } from '@/hooks/useLastSynced';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { countPendingSync } from '@/services/bookkeeping';
import { isOnline } from '@/services/network';

/** Cloud sync — everything is saved on this device first; this copies it to the owner's account so any browser or phone can continue. */
export function CloudSyncSection() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const net = useNetworkStatus();
  const lastSynced = useLastSynced();
  const { data: pending } = useLocalQuery(countPendingSync, []);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string>();

  /** Upload what is waiting and download the account's latest, so another browser or phone sees the same data. */
  const syncNow = async (fromScratch = false) => {
    setSyncing(true);
    setSyncError(undefined);
    try {
      const sync = await import('@/services/sync');
      const { push } = await (fromScratch ? sync.redownloadAccount() : sync.syncService.sync());
      // Name the first reason the server gave, so an entry (or onboarding) that cannot sync can be fixed.
      if (push.rejected.length) setSyncError(`${t('settings.cloudRejected', { count: push.rejected.length })} (${push.rejected[0].table}: ${push.rejected[0].reason})`);
      else Alert.alert(t('settings.cloud'), t('settings.cloudDone'));
    } catch (e) {
      // Offline gets its own plain sentence; otherwise show what the server said, so a failure can be traced.
      setSyncError((await isOnline()) ? (e instanceof Error && e.message ? e.message : t('state.serverUnreachable')) : t('security.needsConnection'));
    } finally {
      setSyncing(false);
    }
  };

  // "Today, 4:12 PM" or "5 Nov, 4:12 PM".
  const when = (ms: number) => {
    const d = new Date(ms);
    const time = d.toLocaleTimeString(locale === 'km' ? 'km-KH' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t('sync.today', { time }) : `${d.toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
  };
  // Offline: the last time this device synced (and what is still waiting). Online: what is waiting, else that all is synced and when.
  const waiting = pending ? t('settings.pendingSync', { count: pending }) : null;
  const offlineLine = lastSynced ? t('sync.offlineLast', { when: when(lastSynced) }) : t('sync.offlineNever');
  const statusLine = syncError
    ?? (net.isOffline ? [offlineLine, waiting].filter(Boolean).join(' ')
      : waiting ?? (lastSynced ? t('sync.upToDateLast', { when: when(lastSynced) }) : t('settings.cloudUpToDate')));
  const line = dark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16, paddingVertical: 2 } as const;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Icon name="upload" size={18} color={dark ? colors.dark.primary : colors.primary[500]} />
        </View>
        <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{t('settings.cloud')}</Text>
      </View>
      <View style={card}>
        <View style={{ paddingVertical: 12, gap: 4 }}>
          <Text variant="body" weight={500} tone="primary-900">{t('settings.cloudBody')}</Text>
          <Text variant="caption" weight={400} tone="neutral-600">
            {statusLine}
          </Text>
        </View>
        <View style={{ paddingBottom: 12 }}>
          <Button label={t('settings.cloudSyncNow')} loading={syncing} loadingLabel={t('settings.cloudSyncing')} onPress={() => void syncNow()} />
        </View>
        <View style={{ paddingBottom: 12, gap: 4, borderTopWidth: 1, borderTopColor: line }}>
          <Text variant="caption" weight={400} tone="neutral-600" style={{ paddingTop: 10 }}>{t('settings.cloudRedownloadBody')}</Text>
          <Button variant="soft" label={t('settings.cloudRedownload')} disabled={syncing} onPress={() => void syncNow(true)} />
        </View>
      </View>
    </View>
  );
}
