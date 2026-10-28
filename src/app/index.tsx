import { Redirect } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';

export default function WelcomeScreen() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}
