import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * FINEXT API address. Web uses localhost; a phone running Expo Go reaches the computer that
 * serves the bundle (same host, port 8000). EXPO_PUBLIC_API_URL overrides both.
 */
const hostFromExpo = Constants.expoConfig?.hostUri?.split(':')[0];
// The relay started by `npm run phone` (see scripts/) listens on another port when the firewall blocks 8000.
const apiPort = process.env.EXPO_PUBLIC_API_PORT || '8000';
const defaultApiUrl = Platform.OS === 'web'
  ? 'http://localhost:8000'
  : hostFromExpo
    ? `http://${hostFromExpo}:${apiPort}`
    : 'http://localhost:8000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || defaultApiUrl).replace(/\/+$/, '');

/** The lender portal for partner-bank staff, served by the same API. */
export const LENDER_PORTAL_URL = `${API_BASE_URL}/portal/`;

/**
 * Most API calls answer in well under a second; uploads, file downloads and sync can take longer on mobile data.
 * A free-tier host that has been idle needs about a minute to wake up, so the limits leave room for that first request.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
export const LONG_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Wakes a sleeping host in the background when the app opens (free hosting pauses an idle server, and waking it takes
 * up to a minute), so the first sign-in or sync does not have to wait for it. Fire and forget: failures are ignored.
 */
export function wakeServer(): void {
  fetchWithTimeout(`${API_BASE_URL}/health`, {}, 90_000).catch(() => undefined);
}

/**
 * fetch with a time limit. A firewall or an unreachable host often drops the connection without refusing it, and the
 * phone would then wait a minute or more before failing; this gives up after `timeoutMs` so the screen can say so.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = init.signal;
  const forward = () => controller.abort();
  outer?.addEventListener('abort', forward);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !outer?.aborted) throw new Error(`No answer within ${timeoutMs / 1000} seconds`);
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}
