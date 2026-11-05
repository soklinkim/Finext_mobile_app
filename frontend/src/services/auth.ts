import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, type Session } from '@supabase/supabase-js';
import { API_BASE_URL, fetchWithTimeout } from './apiBase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LOCAL_OWNER_KEY = '@finext.auth.local-owner.v1';
/** The email last used to sign up or log in on this device, filled in on the login screen (kept after logging out). */
const LAST_EMAIL_KEY = '@finext.auth.last-email.v1';

export async function getLastEmail(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_EMAIL_KEY).catch(() => null);
}

function rememberEmail(email: string) {
  void AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim()).catch(() => undefined);
}

/**
 * A sign-in refused for a reason the login screen explains in the owner's language. Supabase deliberately gives one
 * answer for "no such email" and "wrong password" (so nobody can test which emails have accounts), and so does this.
 */
export class SignInError extends Error {
  constructor(public code: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited', message: string) {
    super(message);
  }
}

function signInError(error: { message: string; code?: string; status?: number }): Error {
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) return new SignInError('invalid_credentials', error.message);
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) return new SignInError('email_not_confirmed', error.message);
  if (error.status === 429 || error.code === 'over_request_rate_limit') return new SignInError('rate_limited', error.message);
  return error as Error;
}

/** Supabase Auth client. The public key is supplied through frontend/.env.local. */
export const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

function getClient() {
  if (!supabase) {
    throw new Error('Supabase Auth is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to frontend/.env.local, then restart Expo.');
  }
  return supabase;
}

/** This device holds another account's offline data. */
export class LocalLedgerOwnedError extends Error {
  constructor() {
    super('This device’s offline bookkeeping data belongs to another account. Sign in with that account to continue.');
  }
}

/** Erase this device's offline ledger and the things saved with it, so a different account can use the device. */
export async function resetLocalLedger(): Promise<void> {
  await (await import('@/services/bookkeeping')).resetLocalData();
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key === LOCAL_OWNER_KEY ||
    key.startsWith('@finext.sync.cursor') ||
    key.startsWith('@finext.auth.entered-home') ||    key.startsWith('finext.analysis.') ||
    key === 'finext:finhealth:v1' ||
    key === 'finext:pref:unusualDismissed');
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

/** This device currently has one local ledger. Refuse to expose it to a different account. */
async function bindLocalLedger(userId: string) {
  let ownerId = await AsyncStorage.getItem(LOCAL_OWNER_KEY);
  if (ownerId && ownerId !== userId) {
    // Everything the other account did here is already on the server, so clearing this device loses nothing and the
    // new account downloads its own data. Only unsent changes are worth stopping for.
    if (await hasUnsyncedWork()) {
      await getClient().auth.signOut({ scope: 'local' });
      throw new LocalLedgerOwnedError();
    }
    await resetLocalLedger();
    ownerId = null;
  }
  if (!ownerId) await AsyncStorage.setItem(LOCAL_OWNER_KEY, userId);
}

async function hasUnsyncedWork(): Promise<boolean> {
  return (await import('@/services/bookkeeping')).hasUnsyncedWork();
}

/** A partner-bank login used in the business app; the login screen points it to the lender portal. */
export class LenderAccountError extends Error {}

/** Partner-bank staff use the lender portal. Unknown (e.g. offline) counts as a business owner. */
async function isLenderAccount(accessToken: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/me`, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!response.ok) return false;
    return ((await response.json()) as { role?: string }).role === 'lender';
  } catch {
    return false;
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw signInError(error);
  if (!data.session) throw new Error('Supabase did not return a signed-in session.');
  rememberEmail(email);
  // Check before binding this device's offline ledger, so a bank login never claims it.
  if (await isLenderAccount(data.session.access_token)) {
    await getClient().auth.signOut({ scope: 'local' });
    throw new LenderAccountError('This is a partner bank account. Please sign in to the FINEXT lender portal instead.');
  }
  await bindLocalLedger(data.session.user.id);
  return data.session;
}

export async function signUp(email: string, password: string, metadata: Record<string, string>) {
  // Check before the account is created: a new account would otherwise exist on the server but be refused on this device.
  if (await AsyncStorage.getItem(LOCAL_OWNER_KEY)) {
    if (await hasUnsyncedWork()) throw new LocalLedgerOwnedError();
    await resetLocalLedger();
  }
  const { data, error } = await getClient().auth.signUp({
    email: email.trim(),
    password,
    options: { data: metadata },
  });
  if (error) throw error;
  if (data.user) rememberEmail(email);
  if (data.session) await bindLocalLedger(data.session.user.id);
  return data;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Force a new access token, e.g. after the API rejected the current one. Returns null if the refresh token is no longer valid. */
export async function refreshSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await getClient().auth.refreshSession();
  if (error) return null;
  return data.session;
}

/**
 * The name to greet the owner by: the business name, else the owner's name from the business profile, else the
 * name given at sign-up (kept with the login in Supabase, so it is there even when setup was never finished).
 */
export async function getDisplayName(settings: { businessName?: string | null; ownerName?: string | null } | undefined): Promise<string | null> {
  const fromProfile = settings?.businessName?.trim() || settings?.ownerName?.trim();
  if (fromProfile) return fromProfile;
  const signUpName = (await getSession().catch(() => null))?.user.user_metadata?.full_name;
  return typeof signUpName === 'string' && signUpName.trim() ? signUpName.trim() : null;
}

/** What the owner gave when creating the account, as kept with the login (older accounts have only name and phone). */
export interface SignUpDetails {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  businessName: string | null;
  businessIndustry: string | null;
  location: string | null;
  startOperationDate: string | null;
  mainProducts: string | null;
  registrationStatus: 'registered' | 'unregistered' | null;
  registrationNumber: string | null;
}

export async function getSignUpDetails(): Promise<SignUpDetails | null> {
  const user = (await getSession().catch(() => null))?.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof meta[key] === 'string' && (meta[key] as string).trim() ? (meta[key] as string).trim() : null);
  return {
    ownerName: text('full_name'), ownerEmail: user.email ?? null, ownerPhone: text('phone'),
    businessName: text('business_name'), businessIndustry: text('business_industry'), location: text('location'),
    startOperationDate: text('start_operation_date'), mainProducts: text('main_products'),
    registrationStatus: text('registration_status') === 'registered' || text('registration_status') === 'unregistered'
      ? (text('registration_status') as 'registered' | 'unregistered') : null,
    registrationNumber: text('registration_number'),
  };
}

/** Who is signed in on this device, for Profile > Security. */
export async function getAccount(): Promise<{ email: string; lastSignInAt: string | null } | null> {
  const session = await getSession();
  if (!session) return null;
  return { email: session.user.email ?? '', lastSignInAt: session.user.last_sign_in_at ?? null };
}

/** Thrown when the current password given to changePassword is wrong. */
export class WrongPasswordError extends Error {}

/** Change the password, after checking the current one (so an unlocked phone alone cannot change it). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const client = getClient();
  const email = (await getSession())?.user.email;
  if (!email) throw new Error('You are signed out. Sign in again to change your password.');
  const check = await client.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) throw new WrongPasswordError(check.error.message);
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Sign out on every device signed in to this account, this one included. Needs a connection. */
export async function signOutEverywhere(): Promise<void> {
  const { error } = await getClient().auth.signOut({ scope: 'global' });
  if (error) throw error;
}

export function subscribeToAuthChanges(onSignedIn: (signedIn: boolean) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onSignedIn(Boolean(session));
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await getClient().auth.signOut({ scope: 'local' });
  // Supabase also tells its server. When that call fails (offline, a network blip: "Failed to fetch") it has still
  // signed out on this device, which is all a local sign-out needs, so only a session left behind is a real failure.
  if (error && (await getClient().auth.getSession()).data.session) throw error;
}
