import * as Network from 'expo-network';

/**
 * Connectivity source of truth for services and the useNetworkStatus hook.
 * `setSimulatedOffline` lets testers force offline mode from Profile > Setting
 * without toggling airplane mode (dev aid; harmless in production).
 */
let simulatedOffline = false;
const listeners = new Set<() => void>();

export function setSimulatedOffline(value: boolean): void {
  simulatedOffline = value;
  listeners.forEach((fn) => fn());
}

export const isSimulatedOffline = (): boolean => simulatedOffline;

export function subscribeToSimulation(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function isOnline(): Promise<boolean> {
  if (simulatedOffline) return false;
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

export { Network };
