import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useI18n, type TKey } from '@/i18n';
import { signOut } from '@/services/auth';
import { colors } from '@/theme';

const ITEMS: { key: string; icon: IconName; label: TKey; tile: 'bg-accent-tile' | 'bg-accent-tile-strong' | 'bg-accent-expense'; href?: string }[] = [
  { key: 'edit', icon: 'user', label: 'profile.menu.edit', tile: 'bg-accent-tile', href: '/edit-profile' },
  { key: 'security', icon: 'shield', label: 'profile.menu.security', tile: 'bg-accent-tile-strong' },
  { key: 'settings', icon: 'settings', label: 'profile.menu.settings', tile: 'bg-accent-expense', href: '/settings' },
  { key: 'help', icon: 'help', label: 'profile.menu.help', tile: 'bg-accent-tile' },
  { key: 'logout', icon: 'logout', label: 'profile.menu.logout', tile: 'bg-accent-tile-strong' },
];

/** Profile menu: Edit Profile, Security, Setting, Help, Logout. */
export default function Profile() {
  const router = useRouter();
  const { t } = useI18n();

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

  return (
    <ScreenShell
      title=""
      nav="profile"
      hero={(
        <View style={{ height: 64, justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text variant="title-lg" weight={700} tone="primary-900">{t('nav.profile')}</Text>
        </View>
      )}
    >
      <View style={{ gap: 28, paddingTop: 24 }}>
        {ITEMS.map((i) => (
          <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={t(i.label)} onPress={() => onPress(i.key, i.href)} className="flex-row items-center" style={{ gap: 16, minHeight: 56 }}>
            <View className={`items-center justify-center rounded-md ${i.tile}`} style={{ width: 56, height: 52 }}>
              <Icon name={i.icon} size={28} color={colors.white} strokeWidth={1.5} />
            </View>
            <Text variant="body-sm" weight={500} tone="primary-900">
              {t(i.label)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScreenShell>
  );
}
