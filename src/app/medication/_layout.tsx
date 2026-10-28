import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';

export default function MedicationLayout() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
