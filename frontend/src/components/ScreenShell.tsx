import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import { BottomNav, NAV_HEIGHT, navBottomPad, type NavKey } from './BottomNav';
import { FieldFocusContext, type FieldClaim } from './FieldFocus';
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

/** Height of the on-screen keyboard (0 when hidden). Web phones expose it only through visualViewport. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        setHeight(covered > 100 ? covered : 0);
      };
      vv.addEventListener('resize', update);
      return () => vv.removeEventListener('resize', update);
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
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
  const scrollRef = useRef<ScrollViewInstance>(null);
  const keyboardH = useKeyboardHeight();
  // iOS KeyboardAvoidingView already shrinks the screen; elsewhere reserve the keyboard's height so lower fields can scroll above it.
  const bottomPad = navSpace + footerH + 24 + (nav ? 0 : insets.bottom) + (Platform.OS === 'ios' ? 0 : keyboardH);

  // Scroll the field that has the cursor to just below the top of the sheet so the fields after it stay visible above the
  // keyboard. Runs when the keyboard opens and again each time another field gets focus (the keyboard stays open when
  // moving between fields, so the keyboard-height change alone would not scroll).
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reveal = useCallback(() => {
    clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      if (Platform.OS === 'web') {
        (document.activeElement as HTMLElement | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        return;
      }
      const input = TextInput.State.currentlyFocusedInput?.();
      const inner = scrollRef.current?.getInnerViewNode?.();
      if (!input || !inner) return;
      input.measureLayout(inner, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }), () => undefined);
    }, 100);
  }, []);

  // Fields with an error ask to be shown; after a short moment the topmost one wins: scroll to it and put the cursor in it.
  const [attempt, setAttempt] = useState(0);
  const claims = useRef<FieldClaim[]>([]);
  const claimTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldFocus = useMemo(() => ({
    tick: attempt,
    reveal,
    bump: () => setAttempt((n) => n + 1),
    inner: () => scrollRef.current?.getInnerViewNode?.(),
    claim: (claim: FieldClaim) => {
      claims.current.push(claim);
      clearTimeout(claimTimer.current);
      claimTimer.current = setTimeout(() => {
        const best = claims.current.reduce((a, b) => (b.y < a.y ? b : a));
        claims.current = [];
        if (Platform.OS === 'web') (best.node as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        else scrollRef.current?.scrollTo({ y: Math.max(0, best.y - 120), animated: true });
        best.focus?.();
      }, 120);
    },
  }), [attempt, reveal]);

  // Bring the focused field into view whenever the keyboard opens.
  useEffect(() => {
    if (keyboardH) reveal();
  }, [keyboardH, reveal]);

  return (
    <FieldFocusContext.Provider value={fieldFocus}>
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
          marginTop: hero || !noHeader ? 12 : 0,
        }}
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'web' ? 'none' : 'on-drag'}
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
    </FieldFocusContext.Provider>
  );
}
