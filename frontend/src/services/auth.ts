import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, type Session } from '@supabase/supabase-js';
import { API_BASE_URL, fetchWithTimeout } from './apiBase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LOCAL_OWNER_KEY = '@finext.auth.local-owner.v1';

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

/** This device currently has one local ledger. Refuse to expose it to a different account. */
async function bindLocalLedger(userId: string) {
  const ownerId = await AsyncStorage.getItem(LOCAL_OWNER_KEY);
  if (ownerId && ownerId !== userId) {
    await getClient().auth.signOut({ scope: 'local' });
    throw new Error('This device’s offline bookkeeping data belongs to another account. Sign in with that account to continue.');
  }
  if (!ownerId) await AsyncStorage.setItem(LOCAL_OWNER_KEY, userId);
}

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
  if (error) throw error;
  if (!data.session) throw new Error('Supabase did not return a signed-in session.');
  // Check before binding this device's offline ledger, so a bank login never claims it.
  if (await isLenderAccount(data.session.access_token)) {
    await getClient().auth.signOut({ scope: 'local' });
    throw new Error('This is a partner bank account. Please sign in to the FINEXT lender portal instead.');
  }
  await bindLocalLedger(data.session.user.id);
  return data.session;
}

export async function signUp(email: string, password: string, metadata: Record<string, string>) {
  const { data, error } = await getClient().auth.signUp({
    email: email.trim(),
    password,
    options: { data: metadata },
  });
  if (error) throw error;
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
  if (error) throw error;
}
