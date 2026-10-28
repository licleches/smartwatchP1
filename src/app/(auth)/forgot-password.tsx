import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { sendPasswordReset } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await sendPasswordReset(email);
    setLoading(false);
    if (resetError) {
      setError(getErrorMessage(resetError));
      return;
    }
    setSuccess(true);
  }

  return (
    <AppScreen>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <AuthBrand title="Recuperar acceso" subtitle="Te enviaremos un enlace para crear una nueva contraseña." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? (
          <Notice tone="success">Revisa tu correo. Si existe una cuenta asociada, recibirás instrucciones para continuar.</Notice>
        ) : null}
        <View style={styles.form}>
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            icon="mail-outline"
            keyboardType="email-address"
            label="Correo electrónico"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            value={email}
          />
          <AppButton loading={loading} onPress={handleSubmit}>
            Enviar enlace
          </AppButton>
        </View>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.back}>
            <Text style={styles.link}>Volver a iniciar sesión</Text>
          </Pressable>
        </Link>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  back: { alignItems: 'center', marginTop: spacing.lg },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800' },
});
