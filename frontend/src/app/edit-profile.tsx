import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, toProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { BusinessDocumentsSection } from '@/components/BusinessDocumentsSection';
import { Button } from '@/components/Button';
import { ScreenShell } from '@/components/ScreenShell';
import { LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { getSettings, updateSettings } from '@/services/bookkeeping';

/** Edit Business Profile (§6.30) — same fields as onboarding, plus the Push Notifications and Dark Theme toggles. */
export default function EditProfile() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const isDark = useAppTheme();
  const profileSection = params.section === 'business' || params.section === 'owner' ? params.section : 'all';
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const [values, setValues] = useState<BusinessProfileValues | null>(null);
  const [push, setPush] = useState(true);
  const [dark, setDark] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerSubmitted, setOwnerSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const title = profileSection === 'business'
    ? t('settings.businessProfile')
    : profileSection === 'owner'
      ? t('settings.ownerProfile')
      : t('profile.edit');

  // load once; later changes to the settings row must not overwrite what the user is typing
  useEffect(() => {
    if (settings && !values) {
      setValues(toProfileValues(settings) ?? EMPTY_PROFILE);
      setOwnerEmail(settings.ownerEmail ?? '');
      setOwnerPhone(settings.ownerPhone ?? '');
      setPush(settings.pushNotifications);
      setDark(settings.darkTheme);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownerErrors = {
    name: !values?.ownerName.trim() ? t('error.required') : undefined,
    email: !/^\S+@\S+\.\S+$/.test(ownerEmail.trim()) ? t('error.invalidEmail') : undefined,
    phone: ownerPhone.replace(/\D/g, '').length < 8 ? t('error.invalidPhone') : undefined,
  };

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View className="flex-row items-center justify-between" style={{ minHeight: 48 }}>
      <Text variant="body" weight={500} tone="primary-900">
        {label}
      </Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.primary[900], false: colors.neutral[300] }} thumbColor={colors.white} />
    </View>
  );

  return (
    <ScreenShell title={title} nav="profile" padding={24}>
      {!values ? (
        <LoadingState />
      ) : (
        <View style={{ gap: 20 }}>
          {profileSection !== 'owner' && (
            <View style={{ gap: 20, padding: 16, borderRadius: radius.lg, backgroundColor: isDark ? colors.dark.surface : colors.primary[50] }}>
              {profileSection === 'all' && <Text variant="title" weight={700} tone="primary-900">{t('auth.businessDetails')}</Text>}
              <BusinessProfileForm
                values={values}
                onChange={(p) => setValues((v) => ({ ...(v ?? EMPTY_PROFILE), ...p }))}
                errors={{ businessName: error }}
                showStartDate={false}
                showContact={false}
                showOwner={false}
                fieldBackgroundColor={colors.white}
              />
            </View>
          )}
          {profileSection !== 'owner' && <BusinessDocumentsSection />}
          {profileSection !== 'business' && (
            <View style={{ gap: 20, padding: 16, borderRadius: radius.lg, backgroundColor: isDark ? colors.dark.surface : colors.primary[50] }}>
              {profileSection === 'all' && <Text variant="title" weight={700} tone="primary-900">{t('auth.personalDetails')}</Text>}
              <TextField
                variant="form"
                label={t('auth.fullName')}
                value={values.ownerName}
                onChangeText={(ownerName) => setValues((current) => ({ ...(current ?? EMPTY_PROFILE), ownerName }))}
                error={ownerSubmitted ? ownerErrors.name : undefined}
                fieldBackgroundColor={colors.white}
              />
              <TextField
                variant="form"
                label={t('auth.email')}
                value={ownerEmail}
                onChangeText={setOwnerEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                error={ownerSubmitted ? ownerErrors.email : undefined}
                fieldBackgroundColor={colors.white}
              />
              <TextField
                variant="form"
                label={t('auth.mobile')}
                value={ownerPhone}
                onChangeText={setOwnerPhone}
                keyboardType="phone-pad"
                error={ownerSubmitted ? ownerErrors.phone : undefined}
                fieldBackgroundColor={colors.white}
              />
            </View>
          )}
          {profileSection !== 'owner' && (
            <>
              {toggle(t('profile.push'), push, setPush)}
              {toggle(t('profile.dark'), dark, (value) => {
                setDark(value);
                void updateSettings({ darkTheme: value });
              })}
            </>
          )}
          <View className="items-center">
            <Button
              variant="tint"
              label={t('profile.update')}
              onPress={async () => {
                if (profileSection === 'owner') {
                  setOwnerSubmitted(true);
                  if (ownerErrors.name || ownerErrors.email || ownerErrors.phone) return;
                  await updateSettings({
                    ownerName: values.ownerName.trim(),
                    ownerEmail: ownerEmail.trim(),
                    ownerPhone: ownerPhone.trim(),
                  });
                } else {
                  if (!values.businessName.trim()) return setError(t('error.required'));
                  if (profileSection === 'all') {
                    setOwnerSubmitted(true);
                    if (ownerErrors.name || ownerErrors.email || ownerErrors.phone) return;
                  }
                  const { ownerName, ...businessPatch } = fromProfileValues(values);
                  await updateSettings({
                    ...businessPatch,
                    ...(profileSection === 'all' ? {
                      ownerName: values.ownerName.trim() || ownerName,
                      ownerEmail: ownerEmail.trim(),
                      ownerPhone: ownerPhone.trim(),
                    } : {}),
                    ...(profileSection === 'all' || profileSection === 'business' ? { pushNotifications: push, darkTheme: dark } : {}),
                  });
                }
                router.back();
              }}
            />
          </View>
        </View>
      )}
    </ScreenShell>
  );
}
