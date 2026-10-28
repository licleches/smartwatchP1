import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { updatePassword } from '@/services/auth';
import { spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError(getErrorMessage(updateError, 'El enlace puede haber vencido.'));
      return;
    }
    Alert.alert('Contraseña actualizada', 'Ya puedes iniciar sesión con tu nueva contraseña.', [
      { text: 'Continuar', onPress: () => router.replace('/(auth)/login') },
    ]);
  }

  return (
    <AppScreen>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <AuthBrand title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={styles.form}>
          <TextField icon="lock-closed-outline" label="Nueva contraseña" onChangeText={setPassword} secureTextEntry value={password} />
          <TextField icon="shield-checkmark-outline" label="Confirmar contraseña" onChangeText={setConfirmation} secureTextEntry value={confirmation} />
          <AppButton loading={loading} onPress={handleSubmit}>Actualizar contraseña</AppButton>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
});
