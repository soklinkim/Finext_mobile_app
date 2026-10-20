import '../global.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
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
import { getSettings, initBookkeeping, subscribeToChanges } from '@/services/bookkeeping';
import type { Locale } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Opens the DB (migrate + seed on first run) exactly once, before any screen renders. */
function useDatabase(): { ready: boolean; error: Error | null } {
  const [state, setState] = useState<{ ready: boolean; error: Error | null }>({ ready: false, error: null });
  useEffect(() => {
    try {
      initBookkeeping();
      setState({ ready: true, error: null });
    } catch (e) {
      setState({ ready: false, error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, []);
  return state;
}

/** Keeps the UI language in sync with the `settings.language` row. */
function LocaleGate({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en-GB');
  useEffect(() => {
    const load = () => getSettings().then((s) => setLocale(s.language)).catch(() => undefined);
    load();
    return subscribeToChanges(load);
  }, []);
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
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
    if ((fontsLoaded && db.ready) || db.error) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, db.ready, db.error]);

  if (db.error) throw db.error;
  if (!fontsLoaded || !db.ready) return null;

  return (
    <SafeAreaProvider>
      <LocaleGate>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </LocaleGate>
    </SafeAreaProvider>
  );
}
