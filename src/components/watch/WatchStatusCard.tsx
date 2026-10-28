import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import type { WatchConnectionState } from '@/types/watch';
import { colors, radius, spacing } from '@/theme/colors';

const statusCopy: Record<WatchConnectionState, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; tone: 'info' | 'success' | 'warning' | 'error' }> = {
  no_device: { icon: 'watch-outline', title: 'Sin dispositivo vinculado', tone: 'info' },
  pending: { icon: 'time-outline', title: 'Vinculación pendiente', tone: 'warning' },
  linked: { icon: 'checkmark-circle-outline', title: 'Dispositivo vinculado', tone: 'success' },
  sync_pending: { icon: 'sync-outline', title: 'Sincronización pendiente', tone: 'warning' },
  error: { icon: 'alert-circle-outline', title: 'Error de conexión', tone: 'error' },
  not_configured: { icon: 'construct-outline', title: 'Integración no configurada', tone: 'info' },
};

export function WatchStatusCard({ state, message, loading, onRefresh }: { state: WatchConnectionState; message: string; loading?: boolean; onRefresh: () => void }) {
  const copy = statusCopy[state];
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, styles[`${copy.tone}Icon`]]}>
          <Ionicons color={copy.tone === 'success' ? colors.success : copy.tone === 'error' ? colors.error : copy.tone === 'warning' ? colors.alert : colors.primary} name={copy.icon} size={24} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      <AppButton compact disabled={loading} loading={loading} onPress={onRefresh} variant="secondary">
        Actualizar estado
      </AppButton>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.md },
  icon: { alignItems: 'center', borderRadius: radius.pill, height: 48, justifyContent: 'center', marginRight: spacing.sm, width: 48 },
  infoIcon: { backgroundColor: colors.softPrimary },
  successIcon: { backgroundColor: colors.successSoft },
  warningIcon: { backgroundColor: colors.alertSoft },
  errorIcon: { backgroundColor: colors.errorSoft },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
