import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import type { WatchPairingPreview } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';

function formatExpiry(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function WatchPairingPreviewCard({
  preview,
  loading,
  onApprove,
  onCancel,
}: {
  preview: WatchPairingPreview;
  loading?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <Text style={styles.eyebrow}>Revisión de seguridad</Text>
      <Text style={styles.title}>¿Vincular este reloj?</Text>
      <View style={styles.details}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{preview.deviceName}</Text>
        <Text style={styles.label}>Tipo</Text>
        <Text style={styles.value}>{preview.deviceType === 'wear_os' ? 'Wear OS' : preview.deviceType}</Text>
        <Text style={styles.label}>Código válido hasta</Text>
        <Text style={styles.value}>{formatExpiry(preview.expiresAt)}</Text>
      </View>
      {preview.canApprove ? (
        <AppButton disabled={loading} loading={loading} onPress={onApprove}>Aprobar vinculación</AppButton>
      ) : (
        <Text style={styles.message}>Esta solicitud ya fue aprobada o reclamada.</Text>
      )}
      <AppButton compact disabled={loading} onPress={onCancel} variant="ghost">Cancelar</AppButton>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.xs },
  details: { gap: spacing.xs, marginVertical: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  value: { color: colors.text, fontSize: 15, marginBottom: spacing.xs },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
});
