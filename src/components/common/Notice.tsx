import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type NoticeProps = PropsWithChildren<{ tone?: 'error' | 'info' | 'success' }>;

export function Notice({ children, tone = 'info' }: NoticeProps) {
  return (
    <View style={[styles.base, styles[tone]]}>
      <Text style={[styles.text, tone === 'error' && styles.errorText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, padding: spacing.md },
  error: { backgroundColor: colors.errorSoft },
  info: { backgroundColor: colors.blueSoft },
  success: { backgroundColor: colors.successSoft },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  errorText: { color: '#991B1B' },
});
