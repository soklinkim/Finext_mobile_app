import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DateInput } from '@/components/DateInput';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';

/**
 * Create Account — UI only (no backend yet). Validates locally, then continues to onboarding.
 * TODO (backend developer): POST the account, then store the session securely.
 */
export default function Signup() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [dob, setDob] = useState<number | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const errors = {
    name: !form.name.trim() ? t('error.required') : undefined,
    email: !/^\S+@\S+\.\S+$/.test(form.email) ? t('error.invalidEmail') : undefined,
    phone: form.phone.replace(/\D/g, '').length < 8 ? t('error.invalidPhone') : undefined,
    password: form.password.length < 8 ? t('error.passwordShort') : undefined,
    confirm: form.confirm !== form.password ? t('error.passwordMismatch') : undefined,
    terms: !agree ? t('error.termsRequired') : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  return (
    <ScreenShell title={t('auth.createAccount')} hero={<View style={{ height: 8 }} />}>
      <View style={{ gap: 16 }}>
        <TextField variant="form" label={t('auth.fullName')} value={form.name} onChangeText={set('name')} error={submitted ? errors.name : undefined} />
        <TextField variant="form" label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={submitted ? errors.email : undefined} />
        <TextField variant="form" label={t('auth.mobile')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={submitted ? errors.phone : undefined} />
        <DateInput label={t('auth.dob')} value={dob} onChange={setDob} />
        <TextField variant="form" label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry error={submitted ? errors.password : undefined} />
        <TextField variant="form" label={t('auth.confirmPassword')} value={form.confirm} onChangeText={set('confirm')} secureTextEntry error={submitted ? errors.confirm : undefined} />
        <View style={{ gap: 4 }}>
          <Chip label={t('auth.terms')} selected={agree} onPress={() => setAgree((v) => !v)} />
          {submitted && errors.terms ? (
            <Text variant="caption" tone="danger">
              {errors.terms}
            </Text>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 40, gap: 12, paddingTop: 8 }}>
          <Button
            label={t('auth.signup')}
            onPress={() => {
              setSubmitted(true);
              if (valid) router.replace('/onboarding/welcome');
            }}
          />
          <Text variant="caption" tone="primary-900" style={{ textAlign: 'center' }} onPress={() => router.replace('/login')}>
            {t('auth.haveAccount')}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}
