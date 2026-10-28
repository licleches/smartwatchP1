import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/colors';

export function LoadingState({ label = 'Cargando...' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  label: { color: colors.muted, marginTop: spacing.sm },
});
