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

/** Most API calls answer in well under a second; uploads, file downloads and sync can take longer on mobile data. */
export const REQUEST_TIMEOUT_MS = 15_000;
export const LONG_REQUEST_TIMEOUT_MS = 60_000;

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
