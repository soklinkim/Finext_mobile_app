import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthHeader } from '@/components/AuthHeader';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';
import { LENDER_PORTAL_URL } from '@/services/apiBase';
import { LedgerConflictNotice } from '@/components/LedgerConflictNotice';
import { getLastEmail, LenderAccountError, LocalLedgerOwnedError, SignInError, signIn } from '@/services/auth';
import { enterAfterLogin } from '@/services/accountGate';
import { isOnline } from '@/services/network';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Log in with Supabase Auth and restore the saved session. */
export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Email and password did not match: both boxes say what to check, until either is edited.
  const [mismatch, setMismatch] = useState(false);
  const [saving, setSaving] = useState(false);
  // A bank staff login: explained, with the way to the portal, instead of a plain error.
  const [lender, setLender] = useState(false);
  // This device still holds another account's offline data.
  const [deviceOwned, setDeviceOwned] = useState(false);
  const openPortal = () => { void Linking.openURL(LENDER_PORTAL_URL); };
  const iconColor = dark ? colors.dark.primary : colors.primary[500];

  // The email last used on this device, so a near-miss like name@ vs name123@ does not happen.
  useEffect(() => {
    let active = true;
    void getLastEmail().then((email) => { if (active && email) setUser((typed) => typed || email); });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    setError(undefined);
    setMismatch(false);
    setLender(false);
    setDeviceOwned(false);
    if (!user.trim() || !password) {
      setError(t('error.required'));
      return;
    }
    setSaving(true);
    try {
      await signIn(user, password);
      // Always Home: this device's current data, or the account's last synced data downloaded first on a new device.
      router.replace(await enterAfterLogin());
    } catch (e) {
      if (e instanceof LenderAccountError) {
        setLender(true);
        return;
      }
      if (e instanceof LocalLedgerOwnedError) {
        setDeviceOwned(true);
        return;
      }
      if (e instanceof SignInError) {
        setMismatch(e.code === 'invalid_credentials');
        setError(t(e.code === 'invalid_credentials' ? 'auth.err.invalid' : e.code === 'email_not_confirmed' ? 'auth.err.notConfirmed' : 'auth.err.rateLimited'));
        return;
      }
      // Offline, Supabase only says "Failed to fetch": say what is wrong instead.
      setError(!(await isOnline()) ? t('security.needsConnection') : e instanceof Error ? e.message : 'Unable to log in. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell
      bell={false}
      backFallbackHref="/launch"
      hero={<AuthHeader large title={t('auth.welcomeBack')} subtitle={t('auth.loginSubtitle')} />}
      padding={24}
    >
      <View style={{ gap: 20 }}>
        <TextField variant="form" label={t('auth.email')} value={user} onChangeText={(v) => { setUser(v); setMismatch(false); }} placeholder="example@example.com"
          autoCapitalize="none" keyboardType="email-address" autoComplete="email"
          left={<Icon name="mail" size={18} color={iconColor} />}
          error={mismatch ? t('auth.checkEmail') : error && !user.trim() ? error : undefined} />
        <View style={{ gap: 8 }}>
          <TextField
            variant="form"
            label={t('auth.password')}
            value={password}
            onChangeText={(v) => { setPassword(v); setMismatch(false); }}
            secureTextEntry={!show}
            placeholder={t('auth.enterPassword')}
            autoComplete="password"
            onSubmitEditing={() => { void submit(); }}
            left={<Icon name="lock" size={18} color={iconColor} />}
            error={mismatch ? t('auth.checkPassword') : error && !password ? error : undefined}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={t('auth.togglePassword')} onPress={() => setShow((v) => !v)} hitSlop={10}>
                <Icon name={show ? 'eye' : 'eyeOff'} size={20} />
              </Pressable>
            }
          />
          <Text variant="caption" weight={600} tone="primary-500" style={{ alignSelf: 'flex-end' }} onPress={() => router.push('/forgot-password')} accessibilityRole="link">
            {t('auth.forgot')}
          </Text>
        </View>
        {error && user.trim() && password ? <Text variant="caption" tone="danger">{error}</Text> : null}
        {deviceOwned && <LedgerConflictNotice onErased={() => { setDeviceOwned(false); void submit(); }} />}
        {lender && (
          <View accessibilityLiveRegion="polite" className="bg-primary-50" style={{ borderRadius: 16, padding: 16, gap: 12 }}>
            <Text variant="body" weight={600} tone="primary-900">{t('auth.lenderTitle')}</Text>
            <Text variant="caption" tone="neutral-600">{t('auth.lenderBody')}</Text>
            <Button variant="primary" size="sm" label={t('auth.lenderOpen')} trailingIcon="chevronRight" onPress={openPortal} />
          </View>
        )}
        <View style={{ paddingTop: 8 }}>
          <Button label={t('auth.login')} loading={saving} onPress={() => { void submit(); }} />
        </View>
        <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center' }}>
          {t('auth.newHere')}{' '}
          <Text variant="body-sm" weight={700} tone="primary-500" onPress={() => router.push('/signup')} accessibilityRole="link">{t('auth.createLink')}</Text>
        </Text>

        {/* Privacy, quietly at the foot of the form */}
        <Text variant="micro" tone="neutral-500" style={{ textAlign: 'center', marginTop: 16, paddingHorizontal: 12 }}>
          {t('auth.privacyNote')}{' '}
          <Text variant="micro" weight={600} tone="primary-500" onPress={() => router.push({ pathname: '/policy/[id]', params: { id: 'privacy', from: 'auth' } })} accessibilityRole="link">{t('auth.privacyLink')}</Text>
        </Text>
      </View>
    </ScreenShell>
  );
}
