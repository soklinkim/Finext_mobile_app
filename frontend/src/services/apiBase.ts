import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * FINEXT API address. Web uses localhost; a phone running Expo Go reaches the computer that
 * serves the bundle (same host, port 8000). EXPO_PUBLIC_API_URL overrides both.
 */
const hostFromExpo = Constants.expoConfig?.hostUri?.split(':')[0];
const defaultApiUrl = Platform.OS === 'web'
  ? 'http://localhost:8000'
  : hostFromExpo
    ? `http://${hostFromExpo}:8000`
    : 'http://localhost:8000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || defaultApiUrl).replace(/\/+$/, '');
