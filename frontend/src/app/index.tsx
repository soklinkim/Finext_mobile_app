import { Redirect } from 'expo-router';
import { Text } from 'react-native';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { getSession } from '@/services/auth';
import { getSettings } from '@/services/bookkeeping';

/** Entry gate: finished onboarding → Home, otherwise the launch screen. */
export default function Index() {
  const { data } = useLocalQuery(async () => {
    const [settings, session] = await Promise.all([getSettings(), getSession()]);
    return { settings, signedIn: Boolean(session) };
  }, []);
  if (!data) return <Text>Loading settings…</Text>;
  if (!data.signedIn) return <Redirect href="/launch" />;
  return <Redirect href={data.settings.onboardingStatus === 'completed' ? '/home' : '/onboarding/language'} />;
}
