import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { POLICIES, type PolicyId } from '@/content/policies';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** One policy (Profile > Policies), as a plain readable page. Back returns to the Policies list. */
export default function PolicyScreen() {
  // Opened from Log In or Sign Up (?from=auth): no tab bar, and Back returns there rather than to Profile > Policies.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromAuth = from === 'auth';
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const policy = POLICIES[id as PolicyId];

  return (
    <ScreenShell title={policy?.title ?? t('settings.policies')} backFallbackHref={fromAuth ? undefined : '/policies'} nav={fromAuth ? undefined : 'profile'} bell={!fromAuth} padding={24}>
      {!policy ? (
        <EmptyState titleKey="policy.notFound" bodyKey="policy.notFoundBody" />
      ) : (
        <View style={{ gap: 20 }}>
          {locale === 'km' && (
            <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
              <Text variant="micro" tone="neutral-600">{t('policy.englishOnly')}</Text>
            </View>
          )}
          <Text variant="body" tone="neutral-600">{policy.summary}</Text>
          {policy.sections.map((section) => (
            <View key={section.heading} style={{ gap: 8 }}>
              <Text variant="body" weight={700} tone="primary-900" accessibilityRole="header">{section.heading}</Text>
              {section.body?.map((paragraph) => (
                <Text key={paragraph} variant="body-sm" tone="neutral-900" style={{ lineHeight: 21 }}>{paragraph}</Text>
              ))}
              {section.bullets?.map((item) => (
                <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text variant="body-sm" tone="neutral-600">•</Text>
                  <Text variant="body-sm" tone="neutral-900" style={{ flex: 1, lineHeight: 21 }}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}
