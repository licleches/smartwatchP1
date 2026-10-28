import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { borderTopColor: colors.border, height: 68, paddingBottom: 9, paddingTop: 8 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          href: '/(tabs)',
          tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="home-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'Medicamentos',
          tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="medical-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="calendar-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="person-outline" size={size} />,
        }}
      />
    </Tabs>
  );
}
