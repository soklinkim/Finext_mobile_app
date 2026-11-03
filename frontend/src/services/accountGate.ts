import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from '@/services/auth';
import { getSettings, type Settings } from '@/services/bookkeeping';
import { isOnline } from '@/services/network';
import { OnlineRequiredError } from '@/services/analysis/types';

/** Must match the cursor key in services/sync: it exists once this device has downloaded the account. */
const CURSOR_KEY = '@finext.sync.cursor.v1';

/** Set when an existing account signs in (not when a new one signs up): from then on this device opens straight to Home. */
const LOGGED_IN_KEY = '@finext.auth.entered-home.v1';

/**
 * After a successful sign-in (which already needed the internet), always Home. On the device that already holds the
 * account, Home shows its current data and a sync catches up in the background. On a device that has never downloaded
 * the account, the data is downloaded first, so Home is not empty; if that fails there is a retry instead.
 */
export async function enterAfterLogin(): Promise<'/home'> {
  const session = await getSession();
  const downloaded = session ? await AsyncStorage.getItem(`${CURSOR_KEY}:${session.user.id}`) : null;
  const sync = async () => (await import('@/services/sync')).syncService.sync();
  if (downloaded) {
    void sync().catch(() => undefined);
  } else {
    try {
      await sync();
    } catch (error) {
      throw (await isOnline()) ? error : new OnlineRequiredError('No internet connection.');
    }
  }
  if (session) await AsyncStorage.setItem(`${LOGGED_IN_KEY}:${session.user.id}`, '1');
  return '/home';
}

export type StartRoute = '/home' | '/onboarding/language' | '/onboarding/assets';

function routeFor(settings: Settings): StartRoute {
  if (settings.onboardingStatus === 'completed') return '/home';
  // Setup (wording, currency, start option) was finished: continue at the balances, not from the beginning.
  if (settings.onboardingStatus === 'in_progress' && settings.startOption) return '/onboarding/assets';
  return '/onboarding/language';
}

/**
 * Where a signed-in owner goes next, from the account's latest saved state. This device's copy can be behind (a new
 * browser, or one that last synced before the owner finished setup elsewhere), so unless it already shows completed
 * onboarding it syncs first. If that fails on a device that has never downloaded the account it throws, rather than
 * guess "start onboarding" from a blank profile; a device that has downloaded before falls back to its own copy.
 */
export async function resolveStartRoute(): Promise<StartRoute> {
  const local = await getSettings();
  if (local.onboardingStatus === 'completed') return '/home';

  const session = await getSession();
  // An owner who signed in to an existing account is not put back through setup when the app reopens.
  if (session && (await AsyncStorage.getItem(`${LOGGED_IN_KEY}:${session.user.id}`))) return '/home';
  const downloaded = session ? await AsyncStorage.getItem(`${CURSOR_KEY}:${session.user.id}`) : null;
  try {
    await (await import('@/services/sync')).syncService.sync();
  } catch (error) {
    if (!downloaded) throw (await isOnline()) ? error : new OnlineRequiredError('No internet connection.');
  }
  return routeFor(await getSettings());
}
