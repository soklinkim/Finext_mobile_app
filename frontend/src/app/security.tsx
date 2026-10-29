import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n, type TKey } from '@/i18n';
import { changePassword, getAccount, signOutEverywhere, WrongPasswordError } from '@/services/auth';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const DATA_POINTS: TKey[] = ['security.data1', 'security.data2', 'security.data3', 'security.data4'];
const TIPS: TKey[] = ['security.tip1', 'security.tip2', 'security.tip3'];

/** Profile > Security: who is signed in, change password, sign out everywhere, and how the data is kept. */
export default function SecurityScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const net = useNetworkStatus();
  const { data: account } = useLocalQuery(getAccount, []);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const line = dark ? colors.dark.border : colors.neutral[200];
  const iconColor = dark ? colors.dark.primary : colors.primary[500];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, padding: 16 } as const;

  /** A section: a blue heading with its icon above a plain card (as on Settings). */
  const section = (heading: string, icon: IconName, children: React.ReactNode) => (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Icon name={icon} size={18} color={iconColor} />
        </View>
        <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{heading}</Text>
      </View>
      <View style={card}>{children}</View>
    </View>
  );

  const bullets = (keys: TKey[]) => keys.map((key) => (
    <View key={key} style={{ flexDirection: 'row', gap: 10 }}>
      <Icon name="check" size={16} color={iconColor} strokeWidth={2.25} />
      <Text variant="body-sm" tone="neutral-900" style={{ flex: 1 }}>{t(key)}</Text>
    </View>
  ));

  const errors = {
    current: !form.current ? t('error.required') : undefined,
    next: form.next.length < 8 ? t('error.passwordShort') : form.next === form.current ? t('security.sameAsCurrent') : undefined,
    confirm: form.confirm !== form.next ? t('error.passwordMismatch') : undefined,
  };
  const set = (key: keyof typeof form) => (value: string) => { setForm((f) => ({ ...f, [key]: value })); setResult(null); };

  const save = async () => {
    setSubmitted(true);
    setResult(null);
    if (errors.current || errors.next || errors.confirm) return;
    if (net.isOffline) { setResult({ ok: false, text: t('security.needsConnection') }); return; }
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setSubmitted(false);
      setResult({ ok: true, text: t('security.passwordChanged') });
    } catch (error) {
      setResult({ ok: false, text: error instanceof WrongPasswordError ? t('security.wrongCurrent') : error instanceof Error ? error.message : t('security.changeFailed') });
    } finally {
      setSaving(false);
    }
  };

  const finishSignOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await signOutEverywhere();
      router.replace('/launch');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('security.needsConnection');
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert(t('security.everywhereTitle'), message);
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOutEverywhere = () => {
    if (net.isOffline) {
      if (Platform.OS === 'web') window.alert(t('security.needsConnection'));
      else Alert.alert(t('security.everywhereTitle'), t('security.needsConnection'));
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('security.everywhereTitle')}\n\n${t('security.everywhereConfirm')}`)) void finishSignOutEverywhere();
      return;
    }
    Alert.alert(t('security.everywhereTitle'), t('security.everywhereConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('security.everywhereYes'), style: 'destructive', onPress: () => { void finishSignOutEverywhere(); } },
    ]);
  };

  const lastSignIn = account?.lastSignInAt
    ? new Date(account.lastSignInAt).toLocaleString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const eye = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('auth.togglePassword')} onPress={() => setShow((v) => !v)} hitSlop={10}>
      <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
    </Pressable>
  );

  return (
    <ScreenShell title={t('profile.menu.security')} nav="profile" padding={24}>
      <View style={{ gap: 28 }}>
        {section(t('security.account'), 'user', (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="neutral-600">{t('auth.email')}</Text>
              <Text variant="body" weight={600} tone="primary-900">{account?.email || '—'}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="neutral-600">{t('security.lastSignIn')}</Text>
              <Text variant="body" tone="primary-900">{lastSignIn}</Text>
            </View>
          </View>
        ))}

        {section(t('security.changePassword'), 'lock', (
          <View style={{ gap: 16 }}>
            <TextField variant="form" label={t('security.currentPassword')} value={form.current} onChangeText={set('current')} placeholder="••••••••"
              secureTextEntry={!show} autoComplete="current-password" right={eye} error={submitted ? errors.current : undefined} />
            <TextField variant="form" label={t('security.newPassword')} value={form.next} onChangeText={set('next')} placeholder="••••••••"
              secureTextEntry={!show} autoComplete="new-password" error={submitted ? errors.next : undefined} />
            <TextField variant="form" label={t('auth.confirmPassword')} value={form.confirm} onChangeText={set('confirm')} placeholder="••••••••"
              secureTextEntry={!show} autoComplete="new-password" error={submitted || form.confirm ? errors.confirm : undefined}
              onSubmitEditing={() => { void save(); }} />
            <Text variant="micro" tone="neutral-600">{t('security.passwordRule')}</Text>
            {result ? (
              <Text variant="caption" accessibilityLiveRegion="polite" style={{ color: result.ok ? colors.success : colors.danger }}>{result.text}</Text>
            ) : null}
            <Button label={t('security.savePassword')} size="sm" loading={saving} onPress={() => { void save(); }} />
          </View>
        ))}

        {section(t('security.devices'), 'logout', (
          <View style={{ gap: 14 }}>
            <Text variant="body-sm" tone="neutral-900">{t('security.devicesBody')}</Text>
            <Button variant="soft" size="sm" label={t('security.everywhereTitle')} icon="logout" loading={signingOut} onPress={confirmSignOutEverywhere} />
          </View>
        ))}

        {section(t('security.dataTitle'), 'shield', <View style={{ gap: 12 }}>{bullets(DATA_POINTS)}</View>)}

        {section(t('security.tipsTitle'), 'info', <View style={{ gap: 12 }}>{bullets(TIPS)}</View>)}

        <Text variant="caption" weight={600} tone="primary-500" accessibilityRole="link" style={{ textAlign: 'center' }}
          onPress={() => router.push({ pathname: '/policy/[id]', params: { id: 'privacy' } })}>
          {t('security.readPrivacy')}
        </Text>
      </View>
    </ScreenShell>
  );
}
