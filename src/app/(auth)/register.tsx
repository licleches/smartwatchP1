import { Link, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { registerUser } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';
import { digitsOnly, isValidMexicanPhone } from '@/utils/validation';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    if (name.trim().length < 2) {
      setError('Escribe tu nombre completo.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    if (phone && !isValidMexicanPhone(phone)) {
      setError('El teléfono debe contener 10 dígitos.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { data, error: registerError } = await registerUser({
      nombre: name,
      email,
      telefono: phone,
      password,
    });
    setLoading(false);
    if (registerError) {
      setError(getErrorMessage(registerError));
      return;
    }
    if (data.session) {
      router.replace('/(tabs)');
    } else {
      setInfo('No se pudo iniciar la sesión automáticamente. Revisa que la confirmación de correo esté desactivada en Supabase.');
    }
  }

  return (
    <AppScreen>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <AuthBrand title="Crear cuenta" subtitle="Configura tu perfil para comenzar a cuidar tus horarios." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {info ? <Notice tone="success">{info}</Notice> : null}
        <View style={styles.form}>
          <TextField
            autoCapitalize="words"
            icon="person-outline"
            label="Nombre completo"
            onChangeText={setName}
            placeholder="Tu nombre"
            value={name}
          />
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
            autoComplete="tel"
            icon="call-outline"
            keyboardType="phone-pad"
            label="Teléfono (opcional)"
            maxLength={10}
            onChangeText={(value) => setPhone(digitsOnly(value))}
            placeholder="Tu teléfono"
            value={phone}
          />
          <TextField
            autoCapitalize="none"
            icon="lock-closed-outline"
            label="Contraseña"
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
            value={password}
          />
          <TextField
            autoCapitalize="none"
            icon="shield-checkmark-outline"
            label="Confirmar contraseña"
            onChangeText={setConfirmation}
            placeholder="Repite tu contraseña"
            secureTextEntry
            value={confirmation}
          />
          <AppButton loading={loading} onPress={handleSubmit}>
            Crear cuenta
          </AppButton>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes una cuenta?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.link}>Iniciar sesión</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800', marginLeft: spacing.xs },
});
