import { Alert, Platform, Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { signOut } from '@/services/auth';
import { getSettings } from '@/services/bookkeeping';
import { setPlainLanguage } from '@/services/preferences';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type Item = { key: string; icon: IconName; label: TKey; hint: TKey; href?: string };

// Items without an href are not built yet: they show a "Soon" tag.
const GROUPS: { title: TKey; items: Item[] }[] = [
  {
    title: 'profile.group.account',
    items: [
      { key: 'edit', icon: 'user', label: 'profile.menu.edit', hint: 'profile.hint.edit', href: '/edit-profile' },
      { key: 'security', icon: 'shield', label: 'profile.menu.security', hint: 'profile.hint.security' },
    ],
  },
  {
    title: 'profile.group.app',
    items: [
      { key: 'settings', icon: 'settings', label: 'profile.menu.settings', hint: 'profile.hint.settings', href: '/settings' },
      { key: 'policies', icon: 'shield', label: 'profile.menu.policies', hint: 'profile.hint.policies', href: '/policies' },
      { key: 'help', icon: 'help', label: 'profile.menu.help', hint: 'profile.hint.help' },
    ],
  },
];

/** Profile: who is signed in, then Account (Edit Profile, Security) and App (Settings, Help), and Log out. */
export default function Profile() {
  const router = useRouter();
  const { t, plain } = useI18n();
  const dark = useAppTheme();
  const { data: settings } = useLocalQuery(getSettings, []);

  const finishLogout = async () => {
    try {
      await signOut();
      router.replace('/launch');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign out. Please try again.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert(t('profile.logoutTitle'), message);
    }
  };

  const onPress = (key: string, href?: string) => {
    if (href) return router.push(href as never);
    if (key === 'logout') {
      if (Platform.OS === 'web') {
        if (window.confirm(`${t('profile.logoutTitle')}\n\n${t('profile.logoutBody')}`)) {
          void finishLogout();
        }
        return;
      }
      return Alert.alert(t('profile.logoutTitle'), t('profile.logoutBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logoutYes'), style: 'destructive', onPress: () => { void finishLogout(); } },
      ]);
    }
    Alert.alert(t('common.comingSoon'), t('auth.backendNote'));
  };

  const name = settings?.businessName?.trim() || t('nav.profile');
  const details = [settings?.ownerName?.trim(), settings?.location?.trim()].filter(Boolean).join(' · ');
  const initials = name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const card = { borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], overflow: 'hidden' } as const;
  const divider = dark ? colors.dark.border : colors.neutral[200];

  return (
    <ScreenShell
      title=""
      nav="profile"
      hero={(
        <View className="flex-row items-center" style={{ gap: 14, paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 }}>
          <View className="items-center justify-center" style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: dark ? colors.dark.surface : colors.white }}>
            <Text variant="title" weight={700} tone="primary-900">{initials}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" weight={700} tone="primary-900" numberOfLines={1}>{name}</Text>
            {details ? <Text variant="body-sm" tone="primary-900" numberOfLines={1}>{details}</Text> : null}
          </View>
        </View>
      )}
    >
      <View style={{ gap: 28, paddingTop: 20 }}>
        {/* Plain language first: it changes how the whole app reads. */}
        <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 18 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
            <Icon name="book" size={20} color={dark ? colors.dark.primary : colors.primary[500]} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="body-sm" weight={600} tone="primary-900">{t('profile.plain')}</Text>
            <Text variant="micro" tone="neutral-600">{t(plain ? 'profile.plainOn' : 'profile.plainOff')}</Text>
          </View>
          <Switch
            accessibilityLabel={t('profile.plain')}
            value={plain}
            onValueChange={(value) => { void setPlainLanguage(value); }}
            trackColor={{ true: colors.primary[900], false: colors.neutral[300] }}
            thumbColor={colors.white}
          />
        </View>

        {GROUPS.map((group) => (
          <View key={group.title} style={{ gap: 10 }}>
            <Text variant="caption" weight={600} tone="neutral-600" style={{ paddingHorizontal: 4 }}>{t(group.title)}</Text>
            <View style={card}>
              {group.items.map((item, index) => (
                <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={t(item.label)} onPress={() => onPress(item.key, item.href)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 18, ...(index > 0 ? { borderTopWidth: 1, borderTopColor: divider } : {}) }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                    <Icon name={item.icon} size={20} color={dark ? colors.dark.primary : colors.primary[500]} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body-sm" weight={600} tone="primary-900">{t(item.label)}</Text>
                    <Text variant="micro" tone="neutral-600" numberOfLines={1}>{t(item.hint)}</Text>
                  </View>
                  {!item.href && (
                    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: dark ? colors.dark.field : colors.neutral[200] }}>
                      <Text variant="micro" weight={600} tone="neutral-600">{t('profile.soon')}</Text>
                    </View>
                  )}
                  <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable accessibilityRole="button" accessibilityLabel={t('profile.menu.logout')} onPress={() => onPress('logout')}
          style={{ ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, marginTop: 8 }}>
          <Icon name="logout" size={18} color={colors.danger} />
          <Text variant="body-sm" weight={600} style={{ color: colors.danger }}>{t('profile.menu.logout')}</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}
