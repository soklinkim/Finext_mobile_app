import '../global.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { AppState, Platform, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import {
  KantumruyPro_300Light,
  KantumruyPro_400Regular,
  KantumruyPro_500Medium,
  KantumruyPro_600SemiBold,
  KantumruyPro_700Bold,
} from '@expo-google-fonts/kantumruy-pro';
import { I18nProvider } from '@/i18n';
import { isNetworkConnected, isSimulatedOffline, Network, subscribeToSimulation } from '@/services/network';
import { AppThemeProvider, useAppTheme } from '@/theme/AppTheme';
import { colors } from '@/theme';
import type { Locale } from '@/theme';
import { getSession, subscribeToAuthChanges } from '@/services/auth';

if (process.env.EXPO_OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

/** Opens the DB (migrate + seed on first run) exactly once, before any screen renders. */
type Bookkeeping = typeof import('@/services/bookkeeping');
let bookkeepingPromise: Promise<Bookkeeping> | null = null;

function loadBookkeeping(): Promise<Bookkeeping> {
  if (!bookkeepingPromise) {
    bookkeepingPromise = (async () => {
      const bookkeeping = await import('@/services/bookkeeping');
      bookkeeping.initBookkeeping();
      return bookkeeping;
    })();
  }
  return bookkeepingPromise;
}

function useDatabase(): { ready: boolean; error: Error | null; bookkeeping: Bookkeeping | null } {
  const [state, setState] = useState<{
    ready: boolean;
    error: Error | null;
    bookkeeping: Bookkeeping | null;
  }>({ ready: false, error: null, bookkeeping: null });
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) {
        setState({
          ready: false,
          error: new Error('Database startup is taking longer than expected.'),
          bookkeeping: null,
        });
      }
    }, 15000);
    loadBookkeeping().then(
      (bookkeeping) => {
        clearTimeout(timeout);
        if (active) setState({ ready: true, error: null, bookkeeping });
      },
      (e: unknown) => {
        clearTimeout(timeout);
        if (active) {
          setState({
            ready: false,
            error: e instanceof Error ? e : new Error(String(e)),
            bookkeeping: null,
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/** Keeps the UI language in sync with the `settings.language` row. */
function LocaleGate({ children, bookkeeping }: { children: ReactNode; bookkeeping: Bookkeeping }) {
  const [locale, setLocale] = useState<Locale>('en-GB');
  const [darkTheme, setDarkTheme] = useState(false);
  useEffect(() => {
    const load = () => bookkeeping.getSettings().then((s) => {
      setLocale(s.language);
      setDarkTheme(s.darkTheme);
    }).catch(() => undefined);
    load();
    return bookkeeping.subscribeToChanges(load);
  }, [bookkeeping]);
  return (
    <AppThemeProvider dark={darkTheme}>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </AppThemeProvider>
  );
}

/** Pushes local writes when connected, and pulls again after reconnect or app resume. */
function BackgroundSync({ bookkeeping }: { bookkeeping: Bookkeeping }) {
  useEffect(() => {
    let active = true;
    let syncing = false;
    let runAgain = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let syncModule: typeof import('@/services/sync') | null = null;
    let analysisModule: typeof import('@/services/analysis') | null = null;

    const run = async () => {
      if (!active) return;
      if (syncing) {
        runAgain = true;
        return;
      }

      syncing = true;
      try {
        if (!(await isNetworkConnected())) return;
        const session = await getSession();
        if (!session) return;
        syncModule ??= await import('@/services/sync');
        const result = await syncModule.syncService.sync();
        if (__DEV__ && result.push.rejected.length > 0) {
          console.warn('[sync] Some rows were rejected by the API:', result.push.rejected);
        }
        if (__DEV__ && (result.push.conflicts?.length ?? 0) > 0) {
          console.warn('[sync] Newer server copies replaced older local rows:', result.push.conflicts.map((item) => `${item.table}:${item.row.id}`));
        }
        try {
          // Run the every-entry health triggers after synced bookkeeping changes, and cache the
          // result so the bell shows new alerts and partner-bank updates without opening the screen.
          analysisModule ??= await import('@/services/analysis');
          await analysisModule.refreshNotificationsAfterSync();
        } catch (error) {
          if (__DEV__) console.warn('[health] Financial health refresh failed:', error);
        }
      } catch (error) {
        if (__DEV__) console.warn('[sync] Sync attempt failed:', error);
      } finally {
        syncing = false;
        if (runAgain && active) {
          runAgain = false;
          schedule();
        }
      }
    };

    const schedule = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void run(), 350);
    };

    const unsubscribeChanges = bookkeeping.subscribeToChanges((source) => {
      if (source === 'local') schedule();
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected) schedule();
    });
    const unsubscribeSimulation = subscribeToSimulation(() => {
      if (!isSimulatedOffline()) schedule();
    });
    const unsubscribeAuth = subscribeToAuthChanges((signedIn) => {
      if (signedIn) schedule();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
    });

    schedule();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      unsubscribeChanges();
      unsubscribeSimulation();
      unsubscribeAuth();
      networkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [bookkeeping]);

  return null;
}

function AppFrame() {
  const dark = useAppTheme();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const isPublicRoute = ['/launch', '/login', '/signup', '/forgot-password'].includes(pathname);
    if (!isPublicRoute) {
      void getSession().then((session) => {
        if (!session) router.replace('/launch');
      }).catch(() => router.replace('/launch'));
    }
    return subscribeToAuthChanges((signedIn) => {
      if (!signedIn && !isPublicRoute) router.replace('/launch');
    });
  }, [pathname, router]);
  return (
    <View style={{ flex: 1, backgroundColor: dark ? colors.dark.background : '#e5e7eb', alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 430 : undefined, backgroundColor: dark ? colors.dark.background : colors.white }}>
        {/* Detail pages slide in from the right (native motion, swipe back on iOS); the tab group and the sign-in
            pages fade, since they are not "deeper" pages. */}
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250, gestureEnabled: true }}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="launch" options={{ animation: 'fade' }} />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="signup" options={{ animation: 'fade' }} />
        </Stack>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    KantumruyPro_300Light,
    KantumruyPro_400Regular,
    KantumruyPro_500Medium,
    KantumruyPro_600SemiBold,
    KantumruyPro_700Bold,
  });
  const db = useDatabase();

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' && ((fontsLoaded && db.ready) || db.error)) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, db.ready, db.error]);

  if (db.error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#991b1b', textAlign: 'center' }}>
          Finext could not finish starting: {db.error.message}
        </Text>
      </View>
    );
  }
  if ((process.env.EXPO_OS !== 'web' && !fontsLoaded) || !db.ready || !db.bookkeeping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Starting Finext…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <LocaleGate bookkeeping={db.bookkeeping}>
        <BackgroundSync bookkeeping={db.bookkeeping} />
        <AppFrame />
      </LocaleGate>
    </SafeAreaProvider>
  );
}
