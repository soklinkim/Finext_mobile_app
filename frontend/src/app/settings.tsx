import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { clearAnalysisCache } from '@/services/analysis';
import { canChangeCurrency, countPendingSync, getSettings, updateSettings } from '@/services/bookkeeping';
import { isOnline } from '@/services/network';

/** Setting — language, display currency, cloud sync and the analysis cache. Simulate offline is on Profile. */
export default function SettingsScreen() {
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: pending } = useLocalQuery(countPendingSync, []);
  const { data: currencyOpen } = useLocalQuery(canChangeCurrency, []);
  const dark = useAppTheme();
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
  const line =dark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16, paddingVertical: 2 } as const;
  const divider = (first?: boolean) => ({ borderTopWidth: first ? 0 : 1, borderTopColor: line });

  /** A section: a blue heading with its icon above a plain white card (as on Edit Profile). */
  const section = (heading: string, icon: IconName, children: React.ReactNode) => (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Icon name={icon} size={18} color={dark ? colors.dark.primary : colors.primary[500]} />
        </View>
        <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{heading}</Text>
      </View>
      <View style={card}>{children}</View>
    </View>
  );

  /** One choice in a list: the selected one carries a blue tick. */
  const option = (label: string, selected: boolean, onPress: () => void, first?: boolean) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center justify-between"
      style={{ minHeight: 52, ...divider(first) }}
    >
      <Text variant="body" weight={selected ? 600 : 400} tone={selected ? 'primary-900' : 'neutral-900'}>{label}</Text>
      {selected ? <Icon name="check" size={18} color={dark ? colors.dark.primary : colors.primary[500]} strokeWidth={2.5} /> : null}
    </Pressable>
  );

  // Business and owner details, and the policies, are on the Profile page; Settings is only how the app behaves.
  return (
    <ScreenShell title={t('profile.menu.settings')} nav="profile" padding={24}>
      <View style={{ gap: 24 }}>
        {section(t('settings.language'), 'book', <>
          {option('ខ្មែរ', settings?.language === 'km', () => updateSettings({ language: 'km' }), true)}
          {option('English (UK)', settings?.language === 'en-GB', () => updateSettings({ language: 'en-GB' }))}
        </>)}

        {/* One currency for the whole business, no exchange rate. It can be switched only while nothing is recorded yet. */}
        {section(t('settings.currency'), 'dollar', currencyOpen ? <>
          {option('USD ($)', settings?.displayCurrency === 'USD', () => updateSettings({ displayCurrency: 'USD' }), true)}
          {option('KHR (៛)', settings?.displayCurrency === 'KHR', () => updateSettings({ displayCurrency: 'KHR' }))}
          <View style={{ paddingVertical: 10, ...divider() }}>
            <Text variant="caption" tone="neutral-600">{t('settings.currencyOpen')}</Text>
          </View>
        </> : <>
          <View style={{ minHeight: 52, justifyContent: 'center', gap: 2 }}>
            <Text variant="body" weight={600} tone="primary-900">{settings?.displayCurrency === 'KHR' ? 'KHR (៛)' : 'USD ($)'}</Text>
            <Text variant="caption" tone="neutral-600">{t('settings.currencyLocked')}</Text>
          </View>
        </>)}

        {/* Everything is saved on this device first; this copies it to the owner's account so any browser or phone can continue. */}
        {section(t('settings.cloud'), 'upload', <>
          <View style={{ paddingVertical: 12, gap: 4 }}>
            <Text variant="body" weight={500} tone="primary-900">{t('settings.cloudBody')}</Text>
            <Text variant="caption" weight={400} tone="neutral-600">
              {syncError ?? (pending ? t('settings.pendingSync', { count: pending }) : t('settings.cloudUpToDate'))}
            </Text>
          </View>
          <View style={{ paddingBottom: 12 }}>
            <Button label={t('settings.cloudSyncNow')} loading={syncing} loadingLabel={t('settings.cloudSyncing')} onPress={() => void syncNow()} />
          </View>
          <View style={{ paddingBottom: 12, gap: 4, ...divider() }}>
            <Text variant="caption" weight={400} tone="neutral-600" style={{ paddingTop: 10 }}>{t('settings.cloudRedownloadBody')}</Text>
            <Button variant="soft" label={t('settings.cloudRedownload')} disabled={syncing} onPress={() => void syncNow(true)} />
          </View>
        </>)}

        {section(t('settings.offlineTools'), 'wifiOff', <>
          {/* Simulate offline is on the Profile page, next to Plain language. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => clearAnalysisCache().then(() => Alert.alert(t('settings.clearCache'), t('settings.cacheCleared')))}
            className="flex-row items-center justify-between"
            style={{ minHeight: 52 }}
          >
            <Text variant="body" weight={500} tone="primary-900">{t('settings.clearCache')}</Text>
            <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
          </Pressable>
        </>)}
      </View>
    </ScreenShell>
  );
}
