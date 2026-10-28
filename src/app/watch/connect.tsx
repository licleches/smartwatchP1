import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { WatchDeviceCard } from '@/components/watch/WatchDeviceCard';
import { WatchPairingForm } from '@/components/watch/WatchPairingForm';
import { WatchPairingPreviewCard } from '@/components/watch/WatchPairingPreviewCard';
import { WatchStatusCard } from '@/components/watch/WatchStatusCard';
import { useSession } from '@/contexts/SessionContext';
import { approveWatchPairing, getWatchConnection, previewWatchPairing, unlinkWatchDevice } from '@/services/watchService';
import type { WatchConnection, WatchPairingPreview } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function ConnectWatchScreen() {
  const { user } = useSession();
  const [connection, setConnection] = useState<WatchConnection | null>(null);
  const [pairingPreview, setPairingPreview] = useState<WatchPairingPreview | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingFormResetKey, setPairingFormResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'success' } | null>(null);
  const loadVersion = useRef(0);

  const loadConnection = useCallback(async () => {
    if (!user) return;
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setLoading(true);
    setError(null);
    try {
      const nextConnection = await getWatchConnection(user.id);
      if (version !== loadVersion.current) return;
      setConnection(nextConnection);
    } catch (loadError) {
      if (version !== loadVersion.current) return;
      setConnection({
        state: 'error',
        devices: [],
        message: 'No se pudo consultar el estado del smartwatch.',
      });
      setError(getErrorMessage(loadError, 'No se pudo consultar el estado del smartwatch.'));
    } finally {
      if (version !== loadVersion.current) return;
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadConnection();
      return () => {
        loadVersion.current += 1;
      };
    }, [loadConnection]),
  );

  async function handlePairing(code: string) {
    if (!user) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const preview = await previewWatchPairing(user.id, code);
      setPairingCode(code);
      setPairingPreview(preview);
      setNotice({ text: 'Revisa los datos del reloj antes de aprobar la vinculación.', tone: 'info' });
    } catch (pairingError) {
      setError(getErrorMessage(pairingError, 'No se pudo revisar el código de vinculación.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprovePairing() {
    if (!user || !pairingPreview) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const approval = await approveWatchPairing(user.id, pairingPreview.requestId, pairingCode);
      setPairingPreview(null);
      setPairingCode('');
      setPairingFormResetKey((value) => value + 1);
      setNotice({
        text: approval.status === 'linked'
          ? 'El smartwatch quedó vinculado.'
          : 'Vinculación aprobada. Abre MedTimeWatch para reclamar sus credenciales.',
        tone: 'success',
      });
      await loadConnection();
    } catch (approvalError) {
      setError(getErrorMessage(approvalError, 'No se pudo aprobar la vinculación.'));
    } finally {
      setActionLoading(false);
    }
  }

  function handleUnlink(deviceId: string) {
    if (!user || actionLoading) return;
    Alert.alert('Desvincular smartwatch', 'El reloj dejará de acceder a tus dosis y su credencial será revocada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Continuar',
        onPress: () => {
          setActionLoading(true);
          void unlinkWatchDevice(user.id, deviceId)
            .then(async () => {
              setNotice({ text: 'Smartwatch desvinculado y credenciales revocadas.', tone: 'success' });
              await loadConnection();
            })
            .catch((unlinkError) => setError(getErrorMessage(unlinkError, 'No se pudo desvincular el smartwatch.')))
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }

  function showInstructions() {
    Alert.alert(
      'Preparar MedTimeWatch',
      'MedTimeWatch inicia una solicitud y muestra un código numérico de 6 dígitos. Escríbelo aquí, revisa el nombre del reloj y aprueba la vinculación. El reloj nunca recibe tu contraseña ni tu sesión de Supabase.',
    );
  }

  return (
    <AppScreen>
      <ScreenHeader
        action={<Ionicons color={colors.primary} name="watch-outline" size={28} />}
        subtitle="Conecta tu smartwatch para recibir recordatorios y gestionar tus medicamentos desde tu muñeca."
        title="Conectar smartwatch"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loading && !connection ? <LoadingState /> : (
        <>
          {connection ? (
            <WatchStatusCard loading={loading} message={connection.message} onRefresh={() => void loadConnection()} state={connection.state} />
          ) : null}
          {connection?.devices.map((device) => (
            <WatchDeviceCard device={device} key={device.id} loading={actionLoading} onUnlink={() => handleUnlink(device.id)} />
          ))}
          {pairingPreview ? (
            <WatchPairingPreviewCard
              loading={actionLoading}
              onApprove={() => void handleApprovePairing()}
              onCancel={() => {
                setPairingPreview(null);
                setPairingCode('');
                setPairingFormResetKey((value) => value + 1);
              }}
              preview={pairingPreview}
            />
          ) : null}
          <WatchPairingForm key={pairingFormResetKey} loading={actionLoading} onSubmit={handlePairing} />
          <Card>
            <View style={styles.infoHeader}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={21} />
              <Text style={styles.infoTitle}>Sincronización inicial</Text>
            </View>
            <Text style={styles.infoText}>La credencial del reloj se genera en el backend y se puede revocar desde esta pantalla. La vinculación no transfiere sesiones personales ni contraseñas.</Text>
            <AppButton compact onPress={showInstructions} variant="secondary">Ver instrucciones</AppButton>
          </Card>
          <AppButton disabled={actionLoading} onPress={() => router.back()} variant="ghost">Volver</AppButton>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  infoHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  infoTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  infoText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginVertical: spacing.sm },
});
