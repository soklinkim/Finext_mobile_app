import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import { BottomNav, NAV_HEIGHT, navBottomPad, type NavKey } from './BottomNav';
import { HeaderBar } from './HeaderBar';
import { colors, radius, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  title?: string;
  back?: boolean;
  backFallbackHref?: Href;
  bell?: boolean;
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
  sheetRadius?: number;
  children?: ReactNode;
}

/** §5 — pale mist hero band on top, white sheet with 72 px top corners sliding over it, optional bottom nav. */
export function ScreenShell({
  title,
  back = true,
  backFallbackHref,
  bell = true,
  noHeader = false,
  hero,
  nav = null,
  scroll = true,
  footer,
  padding = 36,
  sheetRadius = radius.sheet,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const dark = useAppTheme();
  const [footerH, setFooterH] = useState(0);
  const navSpace = nav ? NAV_HEIGHT + navBottomPad(insets.bottom) : 0;
  const bottomPad = navSpace + footerH + 24 + (nav ? 0 : insets.bottom);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={{ width: '100%', alignSelf: 'stretch' }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={0}
    >
    {/* Every screen's top band is the same pale mist; blue is kept for accents. */}
    <View className="flex-1" style={{ width: '100%', alignSelf: 'stretch', backgroundColor: dark ? colors.dark.hero : colors.mist }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />
      {!noHeader && <HeaderBar title={title} back={back} backFallbackHref={backFallbackHref} bell={bell} />}
      {hero}
      <View
        style={{
          flex: 1,
          width: '100%',
          alignSelf: 'stretch',
          backgroundColor: dark ? colors.dark.background : colors.white,
          borderTopLeftRadius: sheetRadius,
          borderTopRightRadius: sheetRadius,
          overflow: 'hidden',
          marginTop: hero || !noHeader ? 8 : 0,
        }}
      >
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={{ paddingHorizontal: padding, paddingTop: 32, paddingBottom: bottomPad }}
          >
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1" style={{ paddingHorizontal: padding, paddingTop: 32, paddingBottom: bottomPad }}>
            {children}
          </View>
        )}
      </View>
      {footer && (
        <View
          className="absolute left-0 right-0 bg-white px-6"
          style={[{ bottom: navSpace + (nav ? 0 : insets.bottom), paddingTop: 10, paddingBottom: 8, backgroundColor: dark ? colors.dark.background : colors.white }, shadow.footer]}
          onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)}
        >
          {footer}
        </View>
      )}
      {nav && <BottomNav active={nav} />}
    </View>
    </KeyboardAvoidingView>
  );
}
