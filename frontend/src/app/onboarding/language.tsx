import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ChoiceButton } from '@/components/ChoiceButton';
import { CambodiaFlag, UkFlag } from '@/components/Flags';
import { OnboardingShell } from '@/components/OnboardingShell';
import { useI18n } from '@/i18n';
import { updateSettings } from '@/services/bookkeeping';

/** Select Language — single-select radio group; saving applies the language immediately. */
export default function Language() {
  const router = useRouter();
  const { t, locale } = useI18n();
  return (
    <OnboardingShell title={t('onb.selectLanguage')} step={0} steps={2}>
      <View style={{ gap: 24, paddingTop: 16 }}>
        <ChoiceButton label="Khmer - ខ្មែរ" selected={locale === 'km'} onPress={() => updateSettings({ language: 'km' })} flagFallback={<CambodiaFlag />} />
        <ChoiceButton label="English - UK" selected={locale === 'en-GB'} onPress={() => updateSettings({ language: 'en-GB' })} flagFallback={<UkFlag />} />
        <View className="items-center" style={{ marginTop: 32 }}>
          <Button variant="primary" className="w-full" label={t('common.next')} trailingIcon="chevronRight" onPress={() => router.push('/onboarding/start')} />
        </View>
      </View>
    </OnboardingShell>
  );
}
