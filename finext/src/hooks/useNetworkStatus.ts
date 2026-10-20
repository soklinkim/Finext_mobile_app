import { useEffect, useState } from 'react';
import { Network, isOnline, isSimulatedOffline, subscribeToSimulation } from '@/services/network';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  /** true when Profile > Setting > "Simulate offline" is forcing offline mode */
  simulated: boolean;
}

/** Live online/offline state (expo-network) combined with the dev "simulate offline" switch. */
export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [simulated, setSimulated] = useState(isSimulatedOffline());

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      isOnline().then((v) => mounted && setOnline(v));
      setSimulated(isSimulatedOffline());
    };
    refresh();
    const sub = Network.addNetworkStateListener(refresh);
    const unsub = subscribeToSimulation(refresh);
    return () => {
      mounted = false;
      sub.remove();
      unsub();
    };
  }, []);

  return { isOnline: online, isOffline: !online, simulated };
}
