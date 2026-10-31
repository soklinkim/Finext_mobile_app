import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthHeader } from '@/components/AuthHeader';
import { Button } from '@/components/Button';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n, type TKey } from '@/i18n';
import { isOnline } from '@/services/network';
import { LedgerConflictNotice } from '@/components/LedgerConflictNotice';
import { LocalLedgerOwnedError, signUp } from '@/services/auth';
import { updateSettings } from '@/services/bookkeeping';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type SignupStep = 0 | 1;
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

const STEPS: TKey[] = ['auth.stepBusiness', 'auth.stepReview'];

/** Where the owner is in sign-up: two labelled segments, done and current ones filled. */
function StepBar({ step }: { step: SignupStep }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('auth.stepProgress', { current: step + 1, total: 2 })} className="flex-row" style={{ gap: 8 }}>
      {STEPS.map((label, index) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 6, borderRadius: 99, backgroundColor: index <= step ? colors.primary[500] : dark ? colors.dark.field : colors.neutral[200] }} />
          <Text variant="caption" weight={index === step ? 700 : 500} tone={index <= step ? 'primary-900' : 'neutral-500'}>
            {index + 1}. {t(label)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Sign-up in two steps: the owner and business details together, then a review before continuing. */
export default function Signup() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const iconColor = dark ? colors.dark.primary : colors.primary[500];
  const [step, setStep] = useState<SignupStep>(0);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [business, setBusiness] = useState<BusinessProfileValues>(EMPTY_PROFILE);
  const [agree, setAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string>();
  const [emailTaken, setEmailTaken] = useState(false);
  // This device still holds another account's offline data: the account is not created until the owner chooses.
  const [deviceOwned, setDeviceOwned] = useState(false);
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
  // Open eye = the password is showing; crossed eye = hidden. One switch shows or hides both password fields.
  const eye = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('auth.togglePassword')} accessibilityState={{ checked: showPassword }} onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
      <Icon name={showPassword ? 'eye' : 'eyeOff'} size={20} />
    </Pressable>
  );
  const passwordsMatch = form.password.length > 0 && form.confirm.length > 0 && form.password === form.confirm;

  const next = () => {
    setSubmitted(true);
    if (!personalValid || !businessValid) return;
    setSubmitted(false);
    setStep(1);
  };

  const confirm = async () => {
    if (confirmationPending) {
      router.replace('/login');
      return;
    }
    setAuthError(undefined);
    setEmailTaken(false);
    setDeviceOwned(false);
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
          contact: form.phone.trim(),
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
          contact: form.phone.trim(),
      });
      router.replace('/onboarding/language');
        } catch (e) {
      // An expected case with its own notice below: not an error worth a red console message.
      if (e instanceof LocalLedgerOwnedError) {
        setDeviceOwned(true);
        return;
      }
      console.error('signup confirm failed', e);
      // Offline, Supabase only says "Failed to fetch": say what is wrong instead.
      const message = !(await isOnline()) ? t('security.needsConnection') : e instanceof Error ? e.message : 'Unable to create your account. Please try again.';
      if (/security purposes|after \d+ seconds|rate limit/i.test(message)) {
        try {
          await updateSettings({
            ...fromProfileValues(business),
            ownerName: form.name.trim(),
            ownerEmail: form.email.trim(),
            ownerPhone: form.phone.trim(),
          contact: form.phone.trim(),
          });
          setConfirmationPending(true);
          setAuthNotice('A confirmation email was recently requested. Check your inbox and spam folder; wait before requesting another.');
          return;
        } catch (saveError) {
          setAuthError(saveError instanceof Error ? saveError.message : 'Could not save your profile on this device.');
          return;
        }
      }
      // Supabase says "User already registered" when this EMAIL already has a Finext account. It has nothing to do with
      // whether the business is registered with the government (that answer is not sent when signing up).
      if (/already (been )?registered|already exists/i.test(message)) {
        setEmailTaken(true);
        setAuthError(t('auth.emailTaken'));
      } else {
        setAuthError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const titleKey: TKey = step === 0 ? 'auth.businessDetails' : 'auth.reviewDetails';
  const detailRows: SummaryRow[] = [
    { label: t('auth.ownerName'), value: optional(form.name) },
    { label: t('auth.email'), value: optional(form.email) },
    { label: t('auth.businessContact'), value: optional(form.phone) },
    { label: t('profile.businessName'), value: optional(business.businessName) },
    { label: t('profile.industry'), value: business.businessIndustry ? t(`industry.${business.businessIndustry}` as TKey) : '—' },
    { label: t('profile.registration'), value: business.registrationStatus === 'registered' ? t('profile.registered') : business.registrationStatus === 'unregistered' ? t('profile.unregistered') : '—' },
    ...(business.registrationStatus === 'registered' ? [{ label: t('profile.registrationNumber'), value: optional(business.registrationNumber) }] : []),
    { label: t('profile.location'), value: optional(business.location) },
    { label: t('profile.products'), value: optional(business.mainProducts) },
  ];

  return (
    <ScreenShell back={step === 0} backFallbackHref="/launch" bell={false} padding={24}
      hero={<AuthHeader large={step === 0} title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')} />}>
      <View style={{ gap: 20 }}>
        <StepBar step={step} />
        <Text variant="title" weight={700} tone="primary-900">{t(titleKey)}</Text>
        {step === 0 && (
          <>
            <TextField variant="form" label={t('auth.ownerName')} required value={form.name} onChangeText={set('name')} placeholder={t('auth.namePlaceholder')} autoComplete="name"
              left={<Icon name="user" size={18} color={iconColor} />} error={submitted ? personalErrors.name : undefined} />
            <TextField variant="form" label={t('auth.email')} required value={form.email} onChangeText={set('email')} placeholder="example@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email"
              left={<Icon name="mail" size={18} color={iconColor} />} error={submitted ? personalErrors.email : undefined} />
            <TextField variant="form" label={t('auth.businessContact')} required value={form.phone} onChangeText={set('phone')} placeholder="012 345 678" keyboardType="phone-pad" autoComplete="tel"
              left={<Icon name="phone" size={18} color={iconColor} />} error={submitted ? personalErrors.phone : undefined} />
            <BusinessProfileForm
              values={business}
              onChange={(patch) => setBusiness((current) => ({ ...current, ...patch }))}
              showStartDate={false}
              showContact={false}
              showOwner={false}
              errors={submitted ? businessErrors : {}}
            />
            <TextField variant="form" label={t('auth.password')} required value={form.password} onChangeText={set('password')} placeholder={t('auth.enterPassword')} secureTextEntry={!showPassword} autoComplete="new-password"
              left={<Icon name="lock" size={18} color={iconColor} />} right={eye} error={submitted ? personalErrors.password : undefined} />
            <TextField
              variant="form"
              label={t('auth.confirmPassword')}
              required
              value={form.confirm}
              onChangeText={set('confirm')}
              placeholder={t('auth.enterPasswordAgain')}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              left={<Icon name="lock" size={18} color={iconColor} />}
              right={(
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {passwordsMatch ? <Icon name="check" size={18} color={colors.success} /> : null}
                  {eye}
                </View>
              )}
              error={submitted || form.confirm.length > 0 ? personalErrors.confirm : undefined}
            />
            {passwordsMatch ? <Text variant="caption" style={{ color: colors.success }}>{t('auth.passwordsMatch')}</Text> : null}
            {/* Terms: a real checkbox, with the policies one tap away */}
            <View style={{ gap: 4 }}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree((value) => !value)}
                className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <Icon name={agree ? 'checkSquare' : 'square'} size={22} color={agree ? colors.primary[500] : colors.neutral[500]} />
                <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>
                  {t('auth.terms')}{' '}
                  <Text variant="body-sm" weight={600} tone="primary-500" onPress={() => router.push({ pathname: '/policies', params: { from: 'auth' } })} accessibilityRole="link">{t('auth.readPolicies')}</Text>
                </Text>
              </Pressable>
              {submitted && personalErrors.terms ? <Text variant="caption" tone="danger">{personalErrors.terms}</Text> : null}
            </View>
            <Button label={t('common.next')} trailingIcon="chevronRight" onPress={next} />
            <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center' }}>
              {t('auth.haveAccountPrompt')}{' '}
              <Text variant="body-sm" weight={700} tone="primary-500" onPress={() => router.push('/login')} accessibilityRole="link">{t('auth.loginLink')}</Text>
            </Text>
          </>
        )}

        {step === 1 && (
          <>
            <Text variant="body-sm" tone="neutral-600">{t('auth.reviewHint')}</Text>
            {authError ? <Text variant="caption" tone="danger">{authError}</Text> : null}
            {emailTaken ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Text variant="caption" weight={600} tone="primary-500" accessibilityRole="link" onPress={() => router.replace('/login')}>{t('auth.goToLogin')}</Text>
                <Text variant="caption" weight={600} tone="primary-500" accessibilityRole="link" onPress={() => setStep(0)}>{t('auth.changeEmail')}</Text>
              </View>
            ) : null}
            {deviceOwned ? <LedgerConflictNotice onErased={() => { setDeviceOwned(false); void confirm(); }} /> : null}
            {authNotice ? <Text variant="caption" tone="neutral-600">{authNotice}</Text> : null}
            <SummarySection
              title={t('auth.businessDetails')}
              editLabel={t('auth.editDetails')}
              onEdit={() => setStep(0)}
              rows={detailRows}
            />
            <View className="flex-row items-center justify-between" style={{ gap: 12, paddingTop: 8 }}>
              {!confirmationPending ? <Button variant="soft" label={t('common.back')} onPress={() => setStep(0)} /> : null}
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
