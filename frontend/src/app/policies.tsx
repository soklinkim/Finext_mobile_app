import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { POLICIES, POLICY_ORDER } from '@/content/policies';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Profile > Policies: the formal Data and AI Policy first, then the pages that explain it to users. */
export default function PoliciesScreen() {
  const router = useRouter();
  // Opened from Sign Up (?from=auth): no tab bar, and Back returns there.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromAuth = from === 'auth';
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const line = dark ? colors.dark.border : colors.neutral[200];

  return (
    <ScreenShell title={t('settings.policies')} nav={fromAuth ? undefined : 'profile'} bell={!fromAuth} padding={24}>
      <View style={{ gap: 16 }}>
        <Text variant="body-sm" tone="neutral-600">{t('policy.listIntro')}</Text>
        <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16 }}>
          {POLICY_ORDER.map((id, index) => (
            <Pressable key={id} accessibilityRole="link" accessibilityLabel={POLICIES[id].title}
              onPress={() => router.push({ pathname: '/policy/[id]', params: fromAuth ? { id, from: 'auth' } : { id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: line }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                <Icon name={id === 'policy' ? 'shield' : 'file'} size={18} color={colors.primary[500]} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight={id === 'policy' ? 700 : 600} tone="primary-900">{POLICIES[id].title}</Text>
                <Text variant="micro" tone="neutral-600">{POLICIES[id].summary}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
            </Pressable>
          ))}
        </View>
        {locale === 'km' && <Text variant="micro" tone="neutral-500">{t('policy.englishOnly')}</Text>}
      </View>
    </ScreenShell>
  );
}
