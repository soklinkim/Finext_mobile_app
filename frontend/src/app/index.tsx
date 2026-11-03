import { useCallback, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { resolveStartRoute, type StartRoute } from '@/services/accountGate';
import { getSession } from '@/services/auth';

type Gate = { href: '/launch' | StartRoute } | { error: Error };

/**
 * Entry gate: finished onboarding → Home, otherwise the launch screen. A device that has not yet downloaded the
 * account never falls through to onboarding on a failed download; it shows a retry instead.
 */
export default function Index() {
  const [gate, setGate] = useState<Gate>();
  const check = useCallback(() => {
    setGate(undefined);
    getSession()
      .then((session) => (session ? resolveStartRoute() : '/launch' as const))
      .then((href) => setGate({ href }))
      .catch((e: unknown) => setGate({ error: e instanceof Error ? e : new Error(String(e)) }));
  }, []);
  useEffect(check, [check]);

  if (!gate) return <LoadingState />;
  if ('error' in gate) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><ErrorState error={gate.error} onRetry={check} /></View>;
  return <Redirect href={gate.href} />;
}
