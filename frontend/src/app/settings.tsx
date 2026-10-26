import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { clearAnalysisCache } from '@/services/analysis';
import { countPendingSync, getSettings, updateSettings } from '@/services/bookkeeping';
import { setSimulatedOffline } from '@/services/network';
import { useAppTheme } from '@/theme/AppTheme';

/** Setting — language, display currency, exchange rate, plus offline-testing tools. */
export default function SettingsScreen() {
  const router = useRouter();
  const dark = useAppTheme();
  const { t } = useI18n();
  const net = useNetworkStatus();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: pending } = useLocalQuery(countPendingSync, []);
  const [rate, setRate] = useState('');

  useEffect(() => {
    if (settings) setRate(String(settings.rateKhrPerUsd));
  }, [settings?.rateKhrPerUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = (title: string) => (
    <Text variant="body-lg" weight={600} tone="primary-900" style={{ marginTop: 8 }}>
      {title}
    </Text>
  );

  const profileLink = (label: string, sectionKey: 'business' | 'owner') => (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/edit-profile?section=${sectionKey}` as never)}
      className="flex-row items-center justify-between rounded-lg bg-primary-50"
      style={{ minHeight: 56, paddingHorizontal: 16, backgroundColor: dark ? colors.dark.surface : undefined }}
    >
      <Text variant="body" weight={500} tone="primary-900">{label}</Text>
      <Icon name="chevronRight" size={18} color={colors.primary[900]} />
    </Pressable>
  );

  return (
    <ScreenShell title={t('profile.menu.settings')} nav="profile" padding={24}>
      <View style={{ gap: 16 }}>
        {section(t('settings.profiles'))}
        {profileLink(t('settings.businessProfile'), 'business')}
        {profileLink(t('settings.ownerProfile'), 'owner')}

        {section(t('settings.language'))}
        <ChipRow>
          <Chip label="ខ្មែរ" selected={settings?.language === 'km'} onPress={() => updateSettings({ language: 'km' })} />
          <Chip label="English (UK)" selected={settings?.language === 'en-GB'} onPress={() => updateSettings({ language: 'en-GB' })} />
        </ChipRow>

        {section(t('settings.displayCurrency'))}
        <ChipRow>
          <Chip label="USD" selected={settings?.displayCurrency === 'USD'} onPress={() => updateSettings({ displayCurrency: 'USD' })} />
          <Chip label="KHR" selected={settings?.displayCurrency === 'KHR'} onPress={() => updateSettings({ displayCurrency: 'KHR' })} />
        </ChipRow>

        {section(t('settings.rate'))}
        <TextField
          variant="form"
          value={rate}
          onChangeText={(v) => setRate(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          onEndEditing={() => Number(rate) > 0 && updateSettings({ rateKhrPerUsd: Number(rate) })}
          right={<Text variant="body" weight={500}>KHR = $1</Text>}
        />

        {section(t('settings.offlineTools'))}
        <View className="flex-row items-center justify-between" style={{ minHeight: 48 }}>
          <View className="flex-1" style={{ paddingRight: 12 }}>
            <Text variant="body" weight={500} tone="primary-900">
              {t('settings.simulateOffline')}
            </Text>
            <Text variant="caption" weight={400} tone="neutral-600">
              {net.isOnline ? t('settings.statusOnline') : t('settings.statusOffline')}
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
        <Text variant="caption" weight={400} tone="neutral-600">
          {t('settings.pendingSync', { count: pending ?? 0 })}
        </Text>
        <Button variant="soft" label={t('settings.clearCache')} onPress={() => clearAnalysisCache().then(() => Alert.alert(t('settings.clearCache'), t('settings.cacheCleared')))} />
      </View>
    </ScreenShell>
  );
}
