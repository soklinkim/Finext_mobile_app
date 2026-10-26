import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';
import { signIn } from '@/services/auth';
import { getSettings } from '@/services/bookkeeping';

/** Log in with Supabase Auth and restore the saved session. */
export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(undefined);
    if (!user.trim() || !password) {
      setError(t('error.required'));
      return;
    }
    setSaving(true);
    try {
      await signIn(user, password);
      const s = await getSettings();
      router.replace(s.onboardingStatus === 'completed' ? '/home' : '/onboarding/language');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to log in. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell
      bell={false}
      backFallbackHref="/launch"
      hero={
        <View className="items-center" style={{ paddingTop: 48, paddingBottom: 56 }}>
          <Text variant="display" tone="primary-900">
            {t('auth.welcome')}
          </Text>
        </View>
      }
      padding={36}
    >
      <View style={{ gap: 24 }}>
        <TextField variant="form" label={t('auth.email')} value={user} onChangeText={setUser} placeholder="example@example.com" autoCapitalize="none" keyboardType="email-address" error={error && !user.trim() ? error : undefined} />
        <TextField
          variant="form"
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          placeholder="••••••••"
          error={error && !password ? error : undefined}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={t('auth.togglePassword')} onPress={() => setShow((v) => !v)} hitSlop={10}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
            </Pressable>
          }
        />
        {error && user.trim() && password ? <Text variant="caption" tone="danger">{error}</Text> : null}
        <View style={{ gap: 12, paddingHorizontal: 40, paddingTop: 8 }}>
          <Button label={t('auth.login')} loading={saving} onPress={() => { void submit(); }} />
          <Text variant="caption" weight={600} tone="primary-900" style={{ textAlign: 'center' }} onPress={() => router.push('/forgot-password')} accessibilityRole="link">
            {t('auth.forgot')}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}
