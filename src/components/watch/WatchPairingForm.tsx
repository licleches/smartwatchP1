import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { Notice } from '@/components/common/Notice';
import { normalizeWatchPairingCode, validateWatchPairingCode, WATCH_PAIRING_CODE_LENGTH } from '@/services/watchService';
import { colors, spacing } from '@/theme/colors';

export function WatchPairingForm({
  loading,
  onSubmit,
}: {
  loading?: boolean;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalized = normalizeWatchPairingCode(code);
    if (!validateWatchPairingCode(normalized)) {
      setError(`Escribe el código numérico de ${WATCH_PAIRING_CODE_LENGTH} dígitos que muestra MedTimeWatch.`);
      return;
    }
    setError(null);
    await onSubmit(normalized);
  }

  return (
    <Card>
      <Text style={styles.title}>Vinculación por código</Text>
      <Text style={styles.description}>Primero revisaremos el nombre y tipo del reloj. La vinculación solo se completa después de tu aprobación.</Text>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.form}>
        <CharacterCountField
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          label="Código temporal"
          maxLength={WATCH_PAIRING_CODE_LENGTH}
          onChangeText={(value) => setCode(normalizeWatchPairingCode(value))}
          placeholder="123456"
          value={code}
        />
        <AppButton disabled={loading} loading={loading} onPress={() => void submit()} variant="secondary">Conectar smartwatch</AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 5 },
  form: { gap: spacing.md, marginTop: spacing.md },
});
