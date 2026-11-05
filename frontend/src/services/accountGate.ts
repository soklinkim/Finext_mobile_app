import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession, getSignUpDetails } from '@/services/auth';
import { getSettings, updateSettings, type Settings, type SettingsPatch } from '@/services/bookkeeping';
import { isOnline } from '@/services/network';
import { OnlineRequiredError } from '@/services/analysis/types';

/** Must match the cursor key in services/sync: it exists once this device has downloaded the account. */
const CURSOR_KEY = '@finext.sync.cursor.v1';

/** Set when an existing account signs in (not when a new one signs up): from then on this device opens straight to Home. */
const LOGGED_IN_KEY = '@finext.auth.entered-home.v1';

/**
 * Fill the profile's empty fields from what the owner gave at sign-up (kept with the login), and save them so they
 * sync: Edit Profile, Home and a bank's view of a shared application then show them. A field that already holds
 * something is never touched. Accounts made before sign-up saved a business profile only have name and phone there.
 */
export async function fillProfileFromSignUp(): Promise<void> {
  // Only once this device holds the account: on a device that has not downloaded it yet, the local profile is blank,
  // and saving it would make that blank copy the newest and overwrite the real one on the next sync.
  const session = await getSession();
  if (!session || !(await AsyncStorage.getItem(`${CURSOR_KEY}:${session.user.id}`))) return;
  const [signUp, settings] = await Promise.all([getSignUpDetails(), getSettings()]);
  if (!signUp) return;
  const patch: SettingsPatch = {};
  const fill = <K extends keyof SettingsPatch>(key: K, value: string | null) => {
    const current = settings[key as keyof Settings];
    if (value && !(typeof current === 'string' && current.trim())) (patch as Record<string, unknown>)[key] = value;
  };
  fill('ownerName', signUp.ownerName);
  fill('ownerEmail', signUp.ownerEmail);
  fill('ownerPhone', signUp.ownerPhone);
  fill('contact', signUp.ownerPhone);
  fill('businessName', signUp.businessName);
  fill('businessIndustry', signUp.businessIndustry);
  fill('location', signUp.location);
  fill('startOperationDate', signUp.startOperationDate);
  fill('mainProducts', signUp.mainProducts);
  // The registration answer and number go together: only when this device has no answer yet.
  if (signUp.registrationStatus && !settings.registrationStatus) {
    patch.registrationStatus = signUp.registrationStatus;
    if (signUp.registrationStatus === 'registered') fill('registrationNumber', signUp.registrationNumber);
  }
  if (Object.keys(patch).length) await updateSettings(patch);
}

const fillQuietly = () => fillProfileFromSignUp().catch(() => undefined);

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
  await fillQuietly();
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
  // In the background: catch up with the account first, then fill any empty profile fields from sign-up.
  void (async () => {
    await (await import('@/services/sync')).syncService.sync().catch(() => undefined);
    await fillQuietly();
  })();
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
