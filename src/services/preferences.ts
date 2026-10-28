import AsyncStorage from '@react-native-async-storage/async-storage';

const notificationKey = (userId: string) => `medtime.notifications.${userId}`;

export async function getNotificationsEnabled(userId: string) {
  const value = await AsyncStorage.getItem(notificationKey(userId));
  return value !== 'false';
}

export function setNotificationsEnabled(userId: string, enabled: boolean) {
  return AsyncStorage.setItem(notificationKey(userId), String(enabled));
}
