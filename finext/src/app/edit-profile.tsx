import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, toProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { Button } from '@/components/Button';
import { ScreenShell } from '@/components/ScreenShell';
import { LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { getSettings, updateSettings } from '@/services/bookkeeping';

/** Edit Business Profile (§6.30) — same fields as onboarding, plus the Push Notifications and Dark Theme toggles. */
export default function EditProfile() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const [values, setValues] = useState<BusinessProfileValues | null>(null);
  const [push, setPush] = useState(true);
  const [dark, setDark] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // load once; later changes to the settings row must not overwrite what the user is typing
  useEffect(() => {
    if (settings && !values) {
      setValues(toProfileValues(settings) ?? EMPTY_PROFILE);
      setPush(settings.pushNotifications);
      setDark(settings.darkTheme);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View className="flex-row items-center justify-between" style={{ minHeight: 48 }}>
      <Text variant="body" weight={500} tone="primary-900">
        {label}
      </Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.primary[900], false: colors.neutral[300] }} thumbColor={colors.white} />
    </View>
  );

  return (
    <ScreenShell title={t('profile.edit')} nav="profile" padding={24}>
      {!values ? (
        <LoadingState />
      ) : (
        <View style={{ gap: 20 }}>
          <BusinessProfileForm values={values} onChange={(p) => setValues((v) => ({ ...(v ?? EMPTY_PROFILE), ...p }))} errors={{ businessName: error }} />
          {toggle(t('profile.push'), push, setPush)}
          {toggle(t('profile.dark'), dark, setDark)}
          <View className="items-center">
            <Button
              variant="tint"
              label={t('profile.update')}
              onPress={async () => {
                if (!values.businessName.trim()) return setError(t('error.required'));
                await updateSettings({ ...fromProfileValues(values), pushNotifications: push, darkTheme: dark });
                router.back();
              }}
            />
          </View>
        </View>
      )}
    </ScreenShell>
  );
}
