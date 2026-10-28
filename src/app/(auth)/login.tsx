import { Link, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { signInWithPassword } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    if (!password) {
      setError('Escribe tu contraseña.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signInWithPassword(email, password);
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid login credentials')
          ? 'Correo o contraseña incorrectos'
          : signInError.message.toLowerCase().includes('email not confirmed')
            ? 'La confirmación de correo sigue activada en Supabase. Desactívala para permitir el acceso inmediato.'
          : getErrorMessage(signInError),
      );
      return;
    }
    router.replace('/(tabs)');
  }

  return (
    <AppScreen>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <AuthBrand title="Bienvenido" subtitle="Organiza tus medicamentos y no olvides ninguna toma." />
        {error ? <Notice tone="error">{error}</Notice> : null}
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
          <TextField
            autoCapitalize="none"
            autoComplete="password"
            icon="lock-closed-outline"
            label="Contraseña"
            onChangeText={setPassword}
            placeholder="Tu contraseña"
            secureTextEntry
            value={password}
          />
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable>
              <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </Link>
          <AppButton loading={loading} onPress={handleSubmit}>
            Iniciar sesión
          </AppButton>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Aún no tienes una cuenta?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.link}>Crear cuenta</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  forgot: { color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800', marginLeft: spacing.xs },
});
