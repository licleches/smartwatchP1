import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
});
