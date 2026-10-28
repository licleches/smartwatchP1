import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';

export default function AuthLayout() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  if (session) return <Redirect href="/(tabs)" />;
  return <Stack />;
}
