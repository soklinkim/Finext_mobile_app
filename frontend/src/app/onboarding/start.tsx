import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ChoiceButton } from '@/components/ChoiceButton';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getSettings, updateSettings } from '@/services/bookkeeping';
import { colors, radius, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** How would you like to start? — "Next" stays disabled until a choice is made. */
export default function Start() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data: settings } = useLocalQuery(getSettings, []);
  const choice = settings?.startOption ?? null;
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);

  const title = (
    <Text variant="display" tone="primary-900" style={{ textAlign: 'center' }}>
      {t('onb.startTitle1')} <Text variant="display" tone="primary-50">{t('onb.startTitleBrand')}</Text>
      {t('onb.startTitle2')}
    </Text>
  );

  return (
    <OnboardingShell title={title} step={1} steps={2}>
      <View style={{ gap: 24, paddingTop: 16 }}>
        <ChoiceButton
          label={t('onb.startNew')}
          selected={choice === 'new'}
          onPress={() => updateSettings({ startOption: 'new', onboardingStatus: 'in_progress' })}
          onInfoPress={() => setInfo({ title: t('onb.startNew'), body: t('onb.startNewInfo') })}
        />
        <ChoiceButton
          label={t('onb.startExisting')}
          selected={choice === 'existing'}
          onPress={() => updateSettings({ startOption: 'existing', onboardingStatus: 'in_progress' })}
          onInfoPress={() => setInfo({ title: t('onb.startExisting'), body: t('onb.startExistingInfo') })}
        />
        <View className="items-center" style={{ marginTop: 32 }}>
          <Button variant="primary" className="w-full" label={t('common.next')} trailingIcon="chevronRight" disabled={!choice} onPress={() => router.push('/onboarding/assets')} />
        </View>
      </View>
      <Modal visible={info !== null} transparent animationType="fade" onRequestClose={() => setInfo(null)} statusBarTranslucent>
        <Pressable
          accessibilityLabel={t('common.close')}
          onPress={() => setInfo(null)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tint(colors.shadow, 0.4) }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ width: '100%', maxWidth: 360, padding: 24, gap: 16, borderRadius: radius.lg, backgroundColor: dark ? colors.dark.background : colors.white }}
          >
            <Text variant="title" weight={700} tone="primary-900">{info?.title}</Text>
            <Text variant="body" tone="neutral-900">{info?.body}</Text>
            <Button variant="soft" label={t('common.close')} onPress={() => setInfo(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </OnboardingShell>
  );
}
