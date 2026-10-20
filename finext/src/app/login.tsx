import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';
import { getSettings } from '@/services/bookkeeping';

/**
 * Log In — UI only. There is no backend yet, so any non-empty credentials continue.
 * TODO (backend developer): replace `submit` with a real auth call and store the session securely.
 */
export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (!user.trim() || !password) {
      setError(t('error.required'));
      return;
    }
    const s = await getSettings();
    router.replace(s.onboardingStatus === 'completed' ? '/home' : '/onboarding/welcome');
  };

  return (
    <ScreenShell
      noHeader
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
        <TextField variant="form" label={t('auth.userOrEmail')} value={user} onChangeText={setUser} placeholder="example@example.com" autoCapitalize="none" keyboardType="email-address" error={error && !user.trim() ? error : undefined} />
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
        <View style={{ gap: 12, paddingHorizontal: 40, paddingTop: 8 }}>
          <Button label={t('auth.login')} onPress={submit} />
          <Text variant="caption" weight={600} tone="primary-900" style={{ textAlign: 'center' }} onPress={() => Alert.alert(t('auth.forgot'), t('auth.backendNote'))}>
            {t('auth.forgot')}
          </Text>
          <Button variant="soft" label={t('auth.signup')} onPress={() => router.replace('/signup')} />
          <Text variant="caption" weight={600} tone="primary-900" style={{ textAlign: 'center' }} onPress={() => Alert.alert(t('auth.fingerprint'), t('auth.backendNote'))}>
            {t('auth.fingerprint')}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}
