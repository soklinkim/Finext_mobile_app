import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius } from '@/theme';

export type NavKey = 'home' | 'analysis' | 'bookkeeping' | 'statements' | 'profile';

const ITEMS: { key: NavKey; icon: IconName; href: string; label: TKey }[] = [
  { key: 'home', icon: 'home', href: '/home', label: 'nav.home' },
  { key: 'analysis', icon: 'analysis', href: '/analysis', label: 'nav.analysis' },
  { key: 'bookkeeping', icon: 'pencil', href: '/bookkeeping', label: 'nav.bookkeeping' },
  { key: 'statements', icon: 'layers', href: '/statements', label: 'nav.statements' },
  { key: 'profile', icon: 'user', href: '/profile', label: 'nav.profile' },
];

export const NAV_HEIGHT = 108;

/** §6.15 — primary-50 container, top corners 60, active item is a 58 × 58 primary-900 rounded square. */
export function BottomNav({ active }: { active: NavKey }) {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around bg-primary-50"
      style={{ height: NAV_HEIGHT + Math.max(insets.bottom - 16, 0), paddingBottom: Math.max(insets.bottom - 16, 0), borderTopLeftRadius: radius.nav, borderTopRightRadius: radius.nav }}
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
            className={`items-center justify-center rounded-md ${isActive ? 'bg-primary-900' : ''}`}
            style={{ width: 58, height: 58 }}
          >
            <Icon name={item.icon} size={32} strokeWidth={1.5} color={isActive ? colors.white : colors.primary[900]} />
          </Pressable>
        );
      })}
    </View>
  );
}
