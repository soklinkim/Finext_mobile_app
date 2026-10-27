import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

export type NavKey = 'home' | 'analysis' | 'bookkeeping' | 'statements' | 'profile';

const ITEMS: { key: NavKey; icon: IconName; href: string; label: TKey }[] = [
  { key: 'home', icon: 'home', href: '/home', label: 'nav.home' },
  { key: 'analysis', icon: 'analysis', href: '/analysis', label: 'nav.analysis' },
  { key: 'bookkeeping', icon: 'pencil', href: '/bookkeeping', label: 'nav.bookkeeping' },
  { key: 'statements', icon: 'layers', href: '/statements', label: 'nav.statements' },
  { key: 'profile', icon: 'user', href: '/profile', label: 'nav.profile' },
];

export const NAV_HEIGHT = 80;

/** §6.15 — primary-50 container (80 high, compacted from the spec's 108), rounded top corners, active item is a 44 × 38 primary-900 rounded square. */
export function BottomNav({ active }: { active: NavKey }) {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const dark = useAppTheme();
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around bg-primary-50"
      style={{ height: NAV_HEIGHT + Math.max(insets.bottom - 16, 0), paddingBottom: Math.max(insets.bottom - 16, 0), borderTopLeftRadius: radius.nav, borderTopRightRadius: radius.nav, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={t(item.label)}
            accessibilityState={{ selected: isActive }}
            onPress={() => !isActive && router.navigate(item.href as never)}
            className="items-center justify-center"
            style={{ flex: 1, minWidth: 0, maxWidth: 90, height: 64, gap: 3 }}
          >
            <View className={`items-center justify-center rounded-md ${isActive ? 'bg-primary-900' : ''}`} style={{ width: 44, height: 38 }}>
              <Icon name={item.icon} size={24} strokeWidth={1.7} color={isActive ? colors.white : dark ? colors.dark.primary : colors.primary[900]} />
            </View>
            <Text variant="micro" weight={isActive ? 700 : 500} tone={isActive ? 'primary-900' : 'neutral-900'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ width: '100%', textAlign: 'center', fontSize: 10, lineHeight: 14 }}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
