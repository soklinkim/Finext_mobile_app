import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Where questions and data requests go. Empty: the contact row is hidden. Set it once FINEXT has a support address. */
const SUPPORT_EMAIL = '';

/** Common questions, grouped as the app is: recording, statements and analysis, banks, account. */
const TOPICS: { title: TKey; icon: IconName; questions: [TKey, TKey][] }[] = [
  {
    title: 'help.topic.records', icon: 'notebook',
    questions: [['help.q.record', 'help.a.record'], ['help.q.offline', 'help.a.offline'], ['help.q.import', 'help.a.import'], ['help.q.mistake', 'help.a.mistake']],
  },
  {
    title: 'help.topic.analysis', icon: 'chart',
    questions: [['help.q.statements', 'help.a.statements'], ['help.q.health', 'help.a.health'], ['help.q.ai', 'help.a.ai']],
  },
  {
    title: 'help.topic.banks', icon: 'account',
    questions: [['help.q.share', 'help.a.share'], ['help.q.stop', 'help.a.stop'], ['help.q.pack', 'help.a.pack']],
  },
  {
    title: 'help.topic.account', icon: 'user',
    questions: [['help.q.language', 'help.a.language'], ['help.q.password', 'help.a.password'], ['help.q.delete', 'help.a.delete']],
  },
];

/** Profile > Help: answers to common questions, then where to get more help. */
export default function HelpScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const [open, setOpen] = useState<TKey | null>(null);

  const line = dark ? colors.dark.border : colors.neutral[200];
  const iconColor = dark ? colors.dark.primary : colors.primary[500];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16 } as const;

  const heading = (title: string, icon: IconName) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{title}</Text>
    </View>
  );

  const linkRow = (icon: IconName, label: string, onPress: () => void, first?: boolean) => (
    <Pressable accessibilityRole="link" onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderTopWidth: first ? 0 : 1, borderTopColor: line }}>
      <Icon name={icon} size={18} color={iconColor} />
      <Text variant="body" weight={600} tone="primary-900" style={{ flex: 1 }}>{label}</Text>
      <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
    </Pressable>
  );

  return (
    <ScreenShell title={t('profile.menu.help')} nav="profile" padding={24}>
      <View style={{ gap: 28 }}>
        <Text variant="body-sm" tone="neutral-600">{t('help.intro')}</Text>

        {TOPICS.map((topic) => (
          <View key={topic.title} style={{ gap: 10 }}>
            {heading(t(topic.title), topic.icon)}
            <View style={card}>
              {topic.questions.map(([q, a], index) => {
                const expanded = open === q;
                return (
                  <View key={q} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: line }}>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : q)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12 }}>
                      <Text variant="body" weight={600} tone="primary-900" style={{ flex: 1 }}>{t(q)}</Text>
                      <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                        <Icon name="chevronDown" size={18} color={colors.neutral[500]} />
                      </View>
                    </Pressable>
                    {expanded && (
                      <Text variant="body-sm" tone="neutral-900" style={{ paddingBottom: 16, lineHeight: 21 }}>{t(a)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={{ gap: 10 }}>
          {heading(t('help.more'), 'helpCircle')}
          <View style={card}>
            {linkRow('shield', t('settings.policies'), () => router.push('/policies'), true)}
            {linkRow('lock', t('profile.menu.security'), () => router.push('/security'))}
            {SUPPORT_EMAIL ? linkRow('mail', t('help.contact', { email: SUPPORT_EMAIL }), () => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }) : null}
          </View>
        </View>

        <Text variant="micro" tone="neutral-500" style={{ textAlign: 'center' }}>
          {t('help.version', { version: Constants.expoConfig?.version ?? '—' })}
        </Text>
      </View>
    </ScreenShell>
  );
}
