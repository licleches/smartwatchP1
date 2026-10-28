import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { StatusPill } from '@/components/common/StatusPill';
import type { DoseWithMedication } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { formatTime } from '@/utils/dates';

type DoseCardProps = {
  dose: DoseWithMedication;
  timeZone?: string;
  onConfirm?: () => void;
  onPostpone?: () => void;
  onOmit?: () => void;
  busy?: boolean;
  disabled?: boolean;
};

export function DoseCard({ dose, timeZone, onConfirm, onPostpone, onOmit, busy = false, disabled = false }: DoseCardProps) {
  const canAct = dose.estado !== 'confirmada' && dose.estado !== 'omitida';
  return (
    <Card>
      <View style={styles.topRow}>
        <View style={styles.medicineIcon}>
          <Ionicons color={colors.primary} name="medical" size={22} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.name}>{dose.medicamento.nombre}</Text>
          <Text style={styles.details}>
            {dose.medicamento.dosis_indicada} · {dose.medicamento.presentacion}
          </Text>
        </View>
        <Text style={styles.time}>{formatTime(dose.programada_para, timeZone)}</Text>
      </View>
      <View style={styles.statusRow}>
        <StatusPill status={dose.estado} />
        {dose.pospuesta_hasta ? (
          <Text style={styles.postponed}>Nuevo aviso {formatTime(dose.pospuesta_hasta, timeZone)}</Text>
        ) : null}
      </View>
      {dose.medicamento.instrucciones ? (
        <Text style={styles.instructions}>{dose.medicamento.instrucciones}</Text>
      ) : null}
      {dose.estado === 'confirmada' && dose.confirmada_en ? (
        <Text style={styles.confirmation}>Confirmada por ti a las {formatTime(dose.confirmada_en, timeZone)}</Text>
      ) : null}
      {canAct && (onConfirm || onPostpone || onOmit) ? (
        <View style={styles.actions}>
          {onConfirm ? (
            <AppButton compact disabled={disabled} loading={busy} onPress={onConfirm}>
              Confirmar
            </AppButton>
          ) : null}
          {onPostpone ? (
            <AppButton compact disabled={disabled || busy} onPress={onPostpone} variant="secondary">
              Posponer
            </AppButton>
          ) : null}
          {onOmit ? (
            <AppButton compact disabled={disabled || busy} onPress={onOmit} variant="ghost">
              Omitir
            </AppButton>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row' },
  medicineIcon: {
    alignItems: 'center',
    backgroundColor: colors.softPrimary,
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 44,
  },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  details: { color: colors.muted, fontSize: 13, marginTop: 3 },
  time: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  statusRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.md },
  postponed: { color: colors.muted, fontSize: 12, marginLeft: spacing.sm },
  instructions: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  confirmation: { color: colors.success, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
