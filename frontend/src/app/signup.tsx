import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { Chip } from '@/components/Chip';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n, type TKey } from '@/i18n';
import { signUp } from '@/services/auth';
import { updateSettings } from '@/services/bookkeeping';

type SignupStep = 0 | 1 | 2;
type SummaryRow = { label: string; value: string };

function SummarySection({ title, rows, onEdit, editLabel }: { title: string; rows: SummaryRow[]; onEdit: () => void; editLabel: string }) {
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: 16, backgroundColor: '#eff6ff' }}>
      <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
        <Text variant="title" tone="primary-900">{title}</Text>
        <Text variant="caption" weight={600} tone="primary-900" onPress={onEdit} accessibilityRole="button">{editLabel}</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={{ gap: 2 }}>
          <Text variant="caption" tone="neutral-600">{row.label}</Text>
          <Text variant="body" tone="primary-900">{row.value || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

/** Multi-step signup: personal details, business details, then a review before continuing. */
export default function Signup() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<SignupStep>(0);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [business, setBusiness] = useState<BusinessProfileValues>(EMPTY_PROFILE);
  const [agree, setAgree] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string>();
  const [authNotice, setAuthNotice] = useState<string>();
  const [confirmationPending, setConfirmationPending] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const personalErrors = {
    name: !form.name.trim() ? t('error.required') : undefined,
    email: !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? t('error.invalidEmail') : undefined,
    phone: form.phone.replace(/\D/g, '').length < 8 ? t('error.invalidPhone') : undefined,
    password: form.password.length < 8 ? t('error.passwordShort') : undefined,
    confirm: form.confirm !== form.password ? t('error.passwordMismatch') : undefined,
    terms: !agree ? t('error.termsRequired') : undefined,
  };
  const businessErrors = {
    businessName: !business.businessName.trim() ? t('error.required') : undefined,
    businessIndustry: !business.businessIndustry ? t('error.required') : undefined,
    registrationNumber: business.registrationStatus === 'registered' && !business.registrationNumber.trim() ? t('error.required') : undefined,
  };
  const personalValid = Object.values(personalErrors).every((error) => !error);
  const businessValid = Object.values(businessErrors).every((error) => !error);
  const optional = (value: string) => value.trim() || '—';
  const passwordsMatch = form.password.length > 0 && form.confirm.length > 0 && form.password === form.confirm;

  const nextFromPersonal = () => {
    setSubmitted(true);
    if (!personalValid) return;
    setSubmitted(false);
    setStep(1);
  };

  const nextFromBusiness = () => {
    setSubmitted(true);
    if (!businessValid) return;
    setSubmitted(false);
    setStep(2);
  };

  const confirm = async () => {
    if (confirmationPending) {
      router.replace('/login');
      return;
    }
    setAuthError(undefined);
    setAuthNotice(undefined);
    setSaving(true);
    try {
      const auth = await signUp(form.email, form.password, {
        full_name: form.name.trim(),
        phone: form.phone.trim(),
      });
      if (!auth.session) {
        await updateSettings({
          ...fromProfileValues(business),
          ownerName: form.name.trim(),
          ownerEmail: form.email.trim(),
          ownerPhone: form.phone.trim(),
        });
        setConfirmationPending(true);
        setAuthNotice('Your account was created. Check your email to confirm it, then log in.');
        return;
      }
      await updateSettings({
        ...fromProfileValues(business),
        ownerName: form.name.trim(),
        ownerEmail: form.email.trim(),
        ownerPhone: form.phone.trim(),
      });
      router.replace('/onboarding/language');
        } catch (e) {
      console.error('signup confirm failed', e);
      const message = e instanceof Error ? e.message : 'Unable to create your account. Please try again.';
      if (/security purposes|after \d+ seconds|rate limit/i.test(message)) {
        try {
          await updateSettings({
            ...fromProfileValues(business),
            ownerName: form.name.trim(),
            ownerEmail: form.email.trim(),
            ownerPhone: form.phone.trim(),
          });
          setConfirmationPending(true);
          setAuthNotice('A confirmation email was recently requested. Check your inbox and spam folder; wait before requesting another.');
          return;
        } catch (saveError) {
          setAuthError(saveError instanceof Error ? saveError.message : 'Could not save your profile on this device.');
          return;
        }
      }
      setAuthError(message);
    } finally {
      setSaving(false);
    }
  };

  const titleKey: TKey = step === 0 ? 'auth.personalDetails' : step === 1 ? 'auth.businessDetails' : 'auth.reviewDetails';
  const businessRows: SummaryRow[] = [
    { label: t('profile.businessName'), value: optional(business.businessName) },
    { label: t('profile.industry'), value: business.businessIndustry ? t(`industry.${business.businessIndustry}` as TKey) : '—' },
    { label: t('profile.registration'), value: business.registrationStatus === 'registered' ? t('profile.registered') : business.registrationStatus === 'unregistered' ? t('profile.unregistered') : '—' },
    ...(business.registrationStatus === 'registered' ? [{ label: t('profile.registrationNumber'), value: optional(business.registrationNumber) }] : []),
    { label: t('profile.location'), value: optional(business.location) },
    { label: t('profile.products'), value: optional(business.mainProducts) },
  ];

  return (
    <ScreenShell title={t('auth.createAccount')} back={step === 0} backFallbackHref="/launch" bell={false} hero={<View style={{ height: 8 }} />}>
      <View style={{ gap: 20 }}>
        <Text variant="caption" tone="neutral-600">{t('auth.stepProgress', { current: step + 1, total: 3 })}</Text>
        <Text variant="title" tone="primary-900">{t(titleKey)}</Text>
        {step === 0 && (
          <>
            <TextField variant="form" label={t('auth.fullName')} value={form.name} onChangeText={set('name')} error={submitted ? personalErrors.name : undefined} />
            <TextField variant="form" label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={submitted ? personalErrors.email : undefined} />
            <TextField variant="form" label={t('auth.mobile')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={submitted ? personalErrors.phone : undefined} />
            <TextField variant="form" label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry error={submitted ? personalErrors.password : undefined} />
            <TextField
              variant="form"
              label={t('auth.confirmPassword')}
              value={form.confirm}
              onChangeText={set('confirm')}
              secureTextEntry
              error={submitted || form.confirm.length > 0 ? personalErrors.confirm : undefined}
            />
            {passwordsMatch ? <Text variant="caption" tone="primary-900">{t('auth.passwordsMatch')}</Text> : null}
            <View style={{ gap: 4 }}>
              <Chip label={t('auth.terms')} selected={agree} onPress={() => setAgree((value) => !value)} />
              {submitted && personalErrors.terms ? <Text variant="caption" tone="danger">{personalErrors.terms}</Text> : null}
            </View>
            <View style={{ paddingHorizontal: 40, paddingTop: 8 }}>
              <Button label={t('common.next')} onPress={nextFromPersonal} />
            </View>
            <Text variant="caption" tone="primary-900" style={{ textAlign: 'center' }} onPress={() => router.push('/login')}>
              {t('auth.haveAccount')}
            </Text>
          </>
        )}

        {step === 1 && (
          <>
            <BusinessProfileForm
              values={business}
              onChange={(patch) => setBusiness((current) => ({ ...current, ...patch }))}
              showStartDate={false}
              showContact={false}
              showOwner={false}
              errors={submitted ? businessErrors : {}}
            />
            <View className="flex-row items-center justify-between" style={{ gap: 16, paddingTop: 8 }}>
              <Button variant="soft" label={t('common.back')} onPress={() => { setSubmitted(false); setStep(0); }} />
              <Button label={t('common.next')} onPress={nextFromBusiness} />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="body-sm" tone="neutral-600">{t('auth.reviewHint')}</Text>
            {authError ? <Text variant="caption" tone="danger">{authError}</Text> : null}
            {authNotice ? <Text variant="caption" tone="neutral-600">{authNotice}</Text> : null}
            <SummarySection
              title={t('auth.personalDetails')}
              editLabel={t('auth.editDetails')}
              onEdit={() => setStep(0)}
              rows={[
                { label: t('auth.fullName'), value: optional(form.name) },
                { label: t('auth.email'), value: optional(form.email) },
                { label: t('auth.mobile'), value: optional(form.phone) },
              ]}
            />
            <SummarySection
              title={t('auth.businessDetails')}
              editLabel={t('auth.editDetails')}
              onEdit={() => setStep(1)}
              rows={businessRows}
            />
            <View className="flex-row items-center justify-between" style={{ gap: 12, paddingTop: 8 }}>
              {!confirmationPending ? <Button variant="soft" label={t('common.back')} onPress={() => setStep(1)} /> : null}
              <Button
                label={confirmationPending ? t('auth.backToLogin') : t('auth.confirmAndContinue')}
                loading={saving}
                onPress={() => { void confirm(); }}
              />
            </View>
          </>
        )}
      </View>
    </ScreenShell>
  );
}
