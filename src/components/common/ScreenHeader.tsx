import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/colors';

export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  copy: { flex: 1, paddingRight: spacing.sm },
  title: { color: colors.text, fontSize: 27, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
});
