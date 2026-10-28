import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';

import { NotificationController } from '@/components/notifications/NotificationController';
import { SessionProvider, useSession } from '@/contexts/SessionContext';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashController />
      <NotificationController />
      <RootNavigator />
    </SessionProvider>
  );
}

function SplashController() {
  const { isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isLoading]);

  return null;
}

function RootNavigator() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="medication" />
      <Stack.Screen name="caregivers" />
      <Stack.Screen name="watch" />
    </Stack>
  );
}
