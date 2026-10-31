import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ChoiceButton } from '@/components/ChoiceButton';
import { CambodiaFlag, UkFlag } from '@/components/Flags';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getSettings, updateSettings } from '@/services/bookkeeping';
import { setPlainLanguage } from '@/services/preferences';

/** One setup screen: language, finance wording (standard / simple) and the single currency. Each choice applies at once. */
export default function Setup() {
  const router = useRouter();
  const { t, locale, plain } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const currency = settings?.displayCurrency ?? 'USD';

  const heading = (key: Parameters<typeof t>[0]) => (
    <Text variant="body-lg" weight={700} tone="primary-900" accessibilityRole="header">{t(key)}</Text>
  );
  const choice = (label: string, hint: string, selected: boolean, onPress: () => void) => (
    <View style={{ flex: 1, gap: 6 }}>
      <ChoiceButton compact label={label} selected={selected} onPress={onPress} />
      {hint ? <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );

  return (
    <OnboardingShell title={t('onb.setupTitle')} step={0} steps={2}>
      <View style={{ gap: 24, paddingTop: 8 }}>
        <View style={{ gap: 12 }}>
          {heading('onb.languageHeading')}
          <ChoiceButton label="Khmer - ខ្មែរ" selected={locale === 'km'} onPress={() => updateSettings({ language: 'km' })} flagFallback={<CambodiaFlag />} />
          <ChoiceButton label="English - UK" selected={locale === 'en-GB'} onPress={() => updateSettings({ language: 'en-GB' })} flagFallback={<UkFlag />} />
        </View>

        <View style={{ gap: 12 }}>
          {heading('onb.termsHeading')}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {choice(t('onb.termsStandard'), t('onb.termsStandardHint'), !plain, () => void setPlainLanguage(false))}
            {choice(t('onb.termsSimple'), t('onb.termsSimpleHint'), plain, () => void setPlainLanguage(true))}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          {heading('onb.currencyHeading')}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {choice('USD ($)', '', currency === 'USD', () => updateSettings({ displayCurrency: 'USD' }))}
            {choice('KHR (៛)', '', currency === 'KHR', () => updateSettings({ displayCurrency: 'KHR' }))}
          </View>
          <Text variant="caption" tone="neutral-600">{t('onb.currencyHint')}</Text>
        </View>

        <View className="items-center" style={{ marginTop: 8 }}>
          <Button variant="primary" className="w-full" label={t('common.next')} trailingIcon="chevronRight" onPress={() => router.push('/onboarding/start')} />
        </View>
      </View>
    </OnboardingShell>
  );
}
