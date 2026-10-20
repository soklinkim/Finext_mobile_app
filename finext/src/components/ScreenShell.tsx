import { useState, type ReactNode } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BottomNav, NAV_HEIGHT, type NavKey } from './BottomNav';
import { HeaderBar } from './HeaderBar';
import { radius, shadow } from '@/theme';

interface Props {
  title?: string;
  /** hero band colour: primary-200 (default) or accent-tile (Financial Statements, §5) */
  heroTone?: 'primary' | 'tile';
  back?: boolean;
  lightHeader?: boolean;
  /** hide the bell + back row entirely (onboarding screens) */
  noHeader?: boolean;
  hero?: ReactNode;
  /** active bottom-nav item; null hides the nav (onboarding, auth) */
  nav?: NavKey | null;
  /** sheet scrolls (default). Set false when children manage their own layout. */
  scroll?: boolean;
  /** sticky footer above the nav (entry / statement screens, §6.26) */
  footer?: ReactNode;
  /** sheet content padding: 36 on lists and cards, 24 on onboarding (§4.1) */
  padding?: 24 | 36;
  children?: ReactNode;
}

/** §5 — light-blue hero band on top, white sheet with 72 px top corners sliding over it, optional bottom nav. */
export function ScreenShell({
  title,
  heroTone = 'primary',
  back = true,
  lightHeader = false,
  noHeader = false,
  hero,
  nav = null,
  scroll = true,
  footer,
  padding = 36,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(0);
  const navSpace = nav ? NAV_HEIGHT : 0;
  const bottomPad = navSpace + footerH + 24 + (nav ? 0 : insets.bottom);

  return (
    <View className={`flex-1 ${heroTone === 'tile' ? 'bg-accent-tile' : 'bg-primary-200'}`}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top }} />
      {!noHeader && <HeaderBar title={title} back={back} light={lightHeader} />}
      {hero}
      <Animated.View
        entering={FadeInDown.duration(280).withInitialValues({ transform: [{ translateY: 24 }] })}
        className="flex-1 bg-white"
        style={{ borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden', marginTop: hero || !noHeader ? 8 : 0 }}
      >
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: padding, paddingTop: 32, paddingBottom: bottomPad }}
          >
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1" style={{ paddingHorizontal: padding, paddingTop: 32, paddingBottom: bottomPad }}>
            {children}
          </View>
        )}
      </Animated.View>
      {footer && (
        <View
          className="absolute left-0 right-0 bg-white px-6"
          style={[{ bottom: navSpace + (nav ? 0 : insets.bottom), paddingTop: 10, paddingBottom: 8 }, shadow.footer]}
          onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)}
        >
          {footer}
        </View>
      )}
      {nav && <BottomNav active={nav} />}
    </View>
  );
}
