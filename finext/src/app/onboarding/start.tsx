import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ChoiceButton } from '@/components/ChoiceButton';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getSettings, updateSettings } from '@/services/bookkeeping';

/** How would you like to start? — "Next" stays disabled until a choice is made. */
export default function Start() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const choice = settings?.startOption ?? null;

  const title = (
    <Text variant="display" tone="primary-900" style={{ textAlign: 'center' }}>
      {t('onb.startTitle1')} <Text variant="display" tone="primary-50">{t('onb.startTitleBrand')}</Text>
      {t('onb.startTitle2')}
    </Text>
  );

  return (
    <OnboardingShell title={title} step={2}>
      <View style={{ gap: 24, paddingTop: 16 }}>
        <ChoiceButton
          label={t('onb.startNew')}
          selected={choice === 'new'}
          onPress={() => updateSettings({ startOption: 'new', onboardingStatus: 'in_progress' })}
          onInfoPress={() => Alert.alert(t('onb.startNew'), t('onb.startNewInfo'))}
        />
        <ChoiceButton
          label={t('onb.startExisting')}
          selected={choice === 'existing'}
          onPress={() => updateSettings({ startOption: 'existing', onboardingStatus: 'in_progress' })}
          onInfoPress={() => Alert.alert(t('onb.startExisting'), t('onb.startExistingInfo'))}
        />
        <View className="items-center" style={{ marginTop: 32 }}>
          <Button variant="text" label={t('common.next')} disabled={!choice} onPress={() => router.push('/onboarding/profile')} />
        </View>
      </View>
    </OnboardingShell>
  );
}
