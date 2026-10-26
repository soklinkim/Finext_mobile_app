import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';

/** Password recovery form. Sending a real recovery email needs the auth service to be connected. */
export default function ForgotPassword() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState(false);
  const emailError = !email.trim() ? t('error.required') : !/^\S+@\S+\.\S+$/.test(email.trim()) ? t('error.invalidEmail') : undefined;

  return (
    <ScreenShell title={t('auth.resetPassword')} backFallbackHref="/login" bell={false} hero={<View style={{ height: 8 }} />}>
      <View style={{ gap: 20 }}>
        <Text variant="body" tone="neutral-600">{t('auth.resetInstructions')}</Text>
        <TextField
          variant="form"
          label={t('auth.email')}
          value={email}
          onChangeText={(value) => { setEmail(value); setNotice(false); }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          error={submitted ? emailError : undefined}
        />
        {notice ? <Text variant="caption" tone="neutral-600">{t('auth.recoveryUnavailable')}</Text> : null}
        <View style={{ paddingHorizontal: 40, paddingTop: 8 }}>
          <Button label={t('auth.sendResetLink')} onPress={() => { setSubmitted(true); if (!emailError) setNotice(true); }} />
        </View>
        <Text variant="caption" weight={600} tone="primary-900" style={{ textAlign: 'center' }} onPress={() => router.replace('/login')}>
          {t('auth.backToLogin')}
        </Text>
      </View>
    </ScreenShell>
  );
}
