import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Text } from '@/components/Text';
import { colors } from '@/theme';
import { useI18n } from '@/i18n';

/** Welcome To Finext. The Figma uses a soft 3D coins illustration on a 250 px primary-50 circle; a coins icon stands in until the asset is supplied. */
export default function Welcome() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <OnboardingShell title={t('onb.welcome')} step={0}>
      <View className="items-center" style={{ gap: 24, paddingTop: 8 }}>
        <View className="items-center justify-center bg-primary-50" style={{ width: 250, height: 250, borderRadius: 125 }}>
          <Icon name="savings" size={110} color={colors.primary[500]} strokeWidth={1.25} />
        </View>
        <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', paddingHorizontal: 16 }}>
          {t('launch.tagline')}
        </Text>
        <Button variant="text" label={t('common.next')} onPress={() => router.push('/onboarding/language')} />
      </View>
    </OnboardingShell>
  );
}
