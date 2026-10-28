import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/colors';

export function AuthBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Ionicons color={colors.white} name="medical" size={30} />
      </View>
      <Text style={styles.brand}>MedTime</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: spacing.xl },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  brand: { color: colors.primary, fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21, marginTop: spacing.sm, textAlign: 'center' },
});
