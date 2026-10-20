import { Redirect } from 'expo-router';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { getSettings } from '@/services/bookkeeping';

/** Entry gate: finished onboarding → Home, otherwise the launch screen. */
export default function Index() {
  const { data } = useLocalQuery(getSettings, []);
  if (!data) return null;
  return <Redirect href={data.onboardingStatus === 'completed' ? '/home' : '/launch'} />;
}
