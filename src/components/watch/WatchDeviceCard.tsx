import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import type { WatchDevice } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';

function maskedIdentifier(identifier: string | null) {
  if (!identifier) return null;
  if (identifier.length <= 8) return identifier;
  return `${identifier.slice(0, 4)}...${identifier.slice(-4)}`;
}

export function WatchDeviceCard({ device, loading, onUnlink }: { device: WatchDevice; loading?: boolean; onUnlink: () => void }) {
  return (
    <Card>
      <View style={styles.header}>
        <Ionicons color={colors.primary} name="watch-outline" size={23} />
        <Text style={styles.title}>{device.name || 'Smartwatch registrado'}</Text>
      </View>
      {device.type ? <Text style={styles.detail}>Tipo: {device.type}</Text> : null}
      <Text style={styles.detail}>Estado: {device.status === 'linked' ? 'Vinculado' : 'Pendiente'}</Text>
      {device.lastSyncedAt ? <Text style={styles.detail}>Última sincronización: {device.lastSyncedAt}</Text> : null}
      {maskedIdentifier(device.identifier) ? <Text style={styles.detail}>Identificador: {maskedIdentifier(device.identifier)}</Text> : null}
      <View style={styles.action}>
        <AppButton compact disabled={loading} loading={loading} onPress={onUnlink} variant="danger">Desvincular</AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 13, marginTop: 5 },
  action: { marginTop: spacing.md },
});
