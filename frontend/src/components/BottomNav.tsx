import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius, shadow, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

export type NavKey = 'home' | 'analysis' | 'bookkeeping' | 'statements' | 'profile';

const ITEMS: { key: NavKey; icon: IconName; href: string; label: TKey }[] = [
  { key: 'home', icon: 'home', href: '/home', label: 'nav.home' },
  { key: 'analysis', icon: 'chart', href: '/analysis', label: 'nav.analysis' },
  { key: 'bookkeeping', icon: 'notebook', href: '/bookkeeping', label: 'nav.bookkeeping' },
  { key: 'statements', icon: 'receipt', href: '/statements', label: 'nav.statements' },
  { key: 'profile', icon: 'account', href: '/profile', label: 'nav.profile' },
];

export const NAV_HEIGHT = 62;

/** Space under the items on phones with a gesture bar: a little, not the whole inset, so the bar stays compact. */
export const navBottomPad = (inset: number) => (inset > 0 ? Math.max(Math.round(inset * 0.5), 6) : 0);

/** §6.15 — compact white bar (62 high) with a hairline top edge; the active item sits on a soft blue pill, the rest are grey. */
export function BottomNav({ active }: { active: NavKey }) {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const dark = useAppTheme();
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around"
      style={[{
        height: NAV_HEIGHT + navBottomPad(insets.bottom), paddingBottom: navBottomPad(insets.bottom), paddingHorizontal: 12,
        borderTopLeftRadius: radius.nav, borderTopRightRadius: radius.nav,
        borderTopWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200],
        backgroundColor: dark ? colors.dark.surface : colors.white,
      }, shadow.footer]}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        const inactive = dark ? colors.dark.muted : colors.neutral[600];
        const activeColor = dark ? colors.dark.primary : colors.primary[900];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={t(item.label)}
            accessibilityState={{ selected: isActive }}
            onPress={() => !isActive && router.navigate(item.href as never)}
            style={{ flex: 1, minWidth: 0, maxWidth: 80, height: 54, gap: 2, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 44, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? (dark ? colors.dark.field : tint(colors.primary[500], 0.14)) : 'transparent' }}>
              <Icon name={item.icon} size={19} strokeWidth={isActive ? 2.1 : 1.7} color={isActive ? activeColor : inactive} />
            </View>
            <Text variant="micro" weight={isActive ? 700 : 500} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
              style={{ width: '100%', textAlign: 'center', fontSize: 9.5, lineHeight: 13, color: isActive ? activeColor : inactive }}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
