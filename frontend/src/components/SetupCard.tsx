import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import type { Settings } from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/**
 * What is still missing from the account's setup, shown on Home. A returning login always lands on Home (it is not
 * sent back through setup), so this is where an owner who skipped a step finds it: the business details (needed for
 * statements, loan readiness and a bank's view) and the opening balances (needed for a correct balance sheet).
 */
export function SetupCard({ settings }: { settings: Settings }) {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const steps: { key: string; icon: IconName; title: TKey; body: TKey; href: Href }[] = [];
  if (!settings.businessName?.trim() || !settings.businessIndustry) {
    steps.push({ key: 'business', icon: 'house', title: 'setup.businessTitle', body: 'setup.businessBody', href: { pathname: '/edit-profile', params: { section: 'business' } } });
  }
  if (settings.onboardingStatus !== 'completed') {
    steps.push({ key: 'balances', icon: 'account', title: 'setup.balancesTitle', body: 'setup.balancesBody',
      href: settings.startOption ? '/onboarding/assets' : '/onboarding/start' });
  }
  if (!steps.length) return null;
  const accent = dark ? colors.dark.primary : colors.primary[500];

  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.primary[200],
      backgroundColor: dark ? colors.dark.surface : colors.primary[50] }}>
      <Text variant="body" weight={700} tone="primary-900">{t('setup.title', { count: steps.length })}</Text>
      {steps.map((step) => (
        <Pressable key={step.key} accessibilityRole="button" onPress={() => router.push(step.href)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: dark ? colors.dark.field : colors.white }}>
          <Icon name={step.icon} size={20} color={accent} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="body-sm" weight={600} tone="primary-900">{t(step.title)}</Text>
            <Text variant="caption" tone="neutral-600">{t(step.body)}</Text>
          </View>
          <Icon name="chevronRight" size={14} color={colors.neutral[500]} />
        </Pressable>
      ))}
    </View>
  );
}
