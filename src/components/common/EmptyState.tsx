import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function EmptyState({
  icon = 'medical-outline',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons color={colors.primary} name={icon} size={32} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.softPrimary,
    borderRadius: radius.pill,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  action: { marginTop: spacing.sm, minWidth: 190 },
});
