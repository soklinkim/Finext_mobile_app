import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { clearAnalysisCache } from '@/services/analysis';
import { countPendingSync, getSettings, updateSettings } from '@/services/bookkeeping';
import { setSimulatedOffline } from '@/services/network';

/** Setting — language, display currency, exchange rate, plus offline-testing tools. */
export default function SettingsScreen() {
  const { t } = useI18n();
  const net = useNetworkStatus();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: pending } = useLocalQuery(countPendingSync, []);
  const dark = useAppTheme();
  const [rate, setRate] = useState('');

  useEffect(() => {
    if (settings) setRate(String(settings.rateKhrPerUsd));
  }, [settings?.rateKhrPerUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  const line = dark ? colors.dark.border : colors.neutral[200];
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

        {section(t('settings.displayCurrency'), 'dollar', <>
          {option('USD ($)', settings?.displayCurrency === 'USD', () => updateSettings({ displayCurrency: 'USD' }), true)}
          {option('KHR (៛)', settings?.displayCurrency === 'KHR', () => updateSettings({ displayCurrency: 'KHR' }))}
          <View style={divider()}>
            <TextField
              appearance="row"
              label={t('settings.rate')}
              value={rate}
              onChangeText={(v) => setRate(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              onEndEditing={() => Number(rate) > 0 && updateSettings({ rateKhrPerUsd: Number(rate) })}
              right={<Text variant="body" weight={500} tone="neutral-600">KHR = $1</Text>}
            />
          </View>
        </>)}

        {section(t('settings.offlineTools'), 'wifiOff', <>
          <View className="flex-row items-center justify-between" style={{ minHeight: 60 }}>
            <View className="flex-1" style={{ paddingRight: 12, gap: 2 }}>
              <Text variant="body" weight={500} tone="primary-900">{t('settings.simulateOffline')}</Text>
              <Text variant="caption" weight={400} tone="neutral-600">
                {net.isOnline ? t('settings.statusOnline') : t('settings.statusOffline')} · {t('settings.pendingSync', { count: pending ?? 0 })}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.simulateOffline')}
              value={net.simulated}
              onValueChange={setSimulatedOffline}
              trackColor={{ true: colors.primary[900], false: colors.neutral[300] }}
              thumbColor={colors.white}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => clearAnalysisCache().then(() => Alert.alert(t('settings.clearCache'), t('settings.cacheCleared')))}
            className="flex-row items-center justify-between"
            style={{ minHeight: 52, ...divider() }}
          >
            <Text variant="body" weight={500} tone="primary-900">{t('settings.clearCache')}</Text>
            <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
          </Pressable>
        </>)}
      </View>
    </ScreenShell>
  );
}
