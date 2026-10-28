import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, toProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { BusinessDocumentsSection } from '@/components/BusinessDocumentsSection';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
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

  const line = isDark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: isDark ? colors.dark.surface : colors.white } as const;

  /** A section: a blue heading with its icon (and an optional one-line hint) above a plain white card. */
  const section = (heading: string | null, icon: IconName, children: React.ReactNode, hint?: string, bare = false) => (
    <View style={{ gap: 10 }}>
      {heading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.dark.field : colors.primary[50] }}>
            <Icon name={icon} size={18} color={isDark ? colors.dark.primary : colors.primary[500]} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{heading}</Text>
            {hint ? <Text variant="caption" weight={400} tone="neutral-500">{hint}</Text> : null}
          </View>
        </View>
      )}
      {bare ? children : <View style={{ ...card, paddingHorizontal: 16, paddingVertical: 2 }}>{children}</View>}
    </View>
  );

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void, first?: boolean) => (
    <View className="flex-row items-center justify-between" style={{ minHeight: 56, borderTopWidth: first ? 0 : 1, borderTopColor: line }}>
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
        <View style={{ gap: 24 }}>
          {profileSection !== 'owner' && section(
            profileSection === 'all' ? t('auth.businessDetails') : null,
            'home',
            <BusinessProfileForm
              values={values}
              onChange={(p) => setValues((v) => ({ ...(v ?? EMPTY_PROFILE), ...p }))}
              errors={{ businessName: error }}
              showStartDate={false}
              showContact={false}
              showOwner={false}
              appearance="row"
            />,
          )}
          {profileSection !== 'owner' && section(t('docs.title'), 'file', <BusinessDocumentsSection />, t('docs.subtitle'), true)}
          {profileSection !== 'business' && section(
            profileSection === 'all' ? t('auth.personalDetails') : null,
            'user',
            <>
              <TextField
                variant="form"
                label={t('auth.fullName')}
                value={values.ownerName}
                onChangeText={(ownerName) => setValues((current) => ({ ...(current ?? EMPTY_PROFILE), ownerName }))}
                error={ownerSubmitted ? ownerErrors.name : undefined}
                appearance="row"
              />
              <View style={{ height: 1, backgroundColor: line }} />
              <TextField
                variant="form"
                label={t('auth.email')}
                value={ownerEmail}
                onChangeText={setOwnerEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                error={ownerSubmitted ? ownerErrors.email : undefined}
                appearance="row"
              />
              <View style={{ height: 1, backgroundColor: line }} />
              <TextField
                variant="form"
                label={t('auth.mobile')}
                value={ownerPhone}
                onChangeText={setOwnerPhone}
                keyboardType="phone-pad"
                error={ownerSubmitted ? ownerErrors.phone : undefined}
                appearance="row"
              />
            </>,
          )}
          {profileSection !== 'owner' && section(
            t('profile.preferences'),
            'settings',
            <View style={{ ...card, paddingHorizontal: 16 }}>
              {toggle(t('profile.push'), push, setPush, true)}
              {toggle(t('profile.dark'), dark, (value) => {
                setDark(value);
                void updateSettings({ darkTheme: value });
              })}
            </View>,
            undefined,
            true,
          )}
          <View>
            <Button
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
