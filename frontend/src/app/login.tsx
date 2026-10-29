import { useState } from 'react';
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
import { LenderAccountError, signIn } from '@/services/auth';
import { getSettings } from '@/services/bookkeeping';
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
  const [saving, setSaving] = useState(false);
  // A bank staff login: explained, with the way to the portal, instead of a plain error.
  const [lender, setLender] = useState(false);
  const openPortal = () => { void Linking.openURL(LENDER_PORTAL_URL); };
  const iconColor = dark ? colors.dark.primary : colors.primary[500];

  const submit = async () => {
    setError(undefined);
    setLender(false);
    if (!user.trim() || !password) {
      setError(t('error.required'));
      return;
    }
    setSaving(true);
    try {
      await signIn(user, password);
      // Fetch the account first: on a new device the profile here is still blank, and deciding from it would send an
      // owner who finished onboarding elsewhere through onboarding again. Offline, decide from this device.
      try {
        await (await import('@/services/sync')).syncService.sync();
      } catch {
        // offline or the server is down: the background sync catches up later
      }
      const s = await getSettings();
      router.replace(s.onboardingStatus === 'completed' ? '/home' : '/onboarding/language');
    } catch (e) {
      if (e instanceof LenderAccountError) {
        setLender(true);
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
        <TextField variant="form" label={t('auth.email')} value={user} onChangeText={setUser} placeholder="example@example.com"
          autoCapitalize="none" keyboardType="email-address" autoComplete="email"
          left={<Icon name="mail" size={18} color={iconColor} />}
          error={error && !user.trim() ? error : undefined} />
        <View style={{ gap: 8 }}>
          <TextField
            variant="form"
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            placeholder="••••••••"
            autoComplete="password"
            onSubmitEditing={() => { void submit(); }}
            left={<Icon name="lock" size={18} color={iconColor} />}
            error={error && !password ? error : undefined}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={t('auth.togglePassword')} onPress={() => setShow((v) => !v)} hitSlop={10}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
              </Pressable>
            }
          />
          <Text variant="caption" weight={600} tone="primary-500" style={{ alignSelf: 'flex-end' }} onPress={() => router.push('/forgot-password')} accessibilityRole="link">
            {t('auth.forgot')}
          </Text>
        </View>
        {error && user.trim() && password ? <Text variant="caption" tone="danger">{error}</Text> : null}
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
