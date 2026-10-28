import { StyleSheet, Text, View } from 'react-native';

import type { DoseStatus } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';

const labels: Record<DoseStatus, string> = {
  programada: 'Programada',
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  pospuesta: 'Pospuesta',
  omitida: 'Omitida',
  sin_confirmar: 'Sin confirmar',
};

export function StatusPill({ status }: { status: DoseStatus }) {
  const tone = status === 'confirmada' ? 'success' : status === 'omitida' ? 'error' : 'alert';
  const textStyle = tone === 'success' ? styles.successText : tone === 'error' ? styles.errorText : styles.alertText;
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.label, textStyle]}>{labels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  success: { backgroundColor: colors.successSoft },
  error: { backgroundColor: colors.errorSoft },
  alert: { backgroundColor: colors.alertSoft },
  label: { fontSize: 12, fontWeight: '700' },
  successText: { color: colors.success },
  errorText: { color: colors.error },
  alertText: { color: '#92400E' },
});
