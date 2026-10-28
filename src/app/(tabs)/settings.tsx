import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { SelectField } from '@/components/common/SelectField';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { TextField } from '@/components/common/TextField';
import { TIME_ZONE_OPTIONS, getConfiguredTimeZone } from '@/constants/options';
import { useSession } from '@/contexts/SessionContext';
import { cancelMedicationNotifications, syncMedicationNotifications } from '@/services/notifications';
import { getNotificationsEnabled, setNotificationsEnabled } from '@/services/preferences';
import { updateUserProfile } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getDeviceTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { digitsOnly, isValidMexicanPhone } from '@/utils/validation';

export default function SettingsScreen() {
  const { user, profile, profileError, session, refreshProfile, signOut } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [timeZone, setTimeZone] = useState(getConfiguredTimeZone());
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const metadataName = typeof session?.user.user_metadata?.nombre === 'string' ? session.user.user_metadata.nombre.trim() : '';
      const metadataPhone = typeof session?.user.user_metadata?.telefono === 'string' ? session.user.user_metadata.telefono : '';
      const metadataTimeZone = typeof session?.user.user_metadata?.zona_horaria === 'string' ? session.user.user_metadata.zona_horaria : undefined;
      setName(profile?.nombre?.trim() || metadataName);
      setPhone(digitsOnly(profile?.telefono || metadataPhone));
      setTimeZone(getConfiguredTimeZone(profile?.zona_horaria || metadataTimeZone));
    }, 0);
    return () => clearTimeout(timeout);
  }, [profile, session]);

  useEffect(() => {
    if (user) void getNotificationsEnabled(user.id).then(setNotifications);
  }, [user]);

  async function saveProfile() {
    if (!user) {
      setError('Tu sesión ya no es válida. Inicia sesión nuevamente.');
      return;
    }
    if (!name.trim()) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (!TIME_ZONE_OPTIONS.some((option) => option.value === timeZone)) {
      setError('Selecciona una zona horaria válida.');
      return;
    }
    if (phone && !isValidMexicanPhone(phone)) {
      setError('El teléfono debe contener 10 dígitos.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateUserProfile({
        nombre: name.trim(),
        telefono: phone || (profile?.telefono && isValidMexicanPhone(profile.telefono) ? profile.telefono : null),
        zona_horaria: timeZone || getDeviceTimeZone(),
      });
      await refreshProfile();
      let notificationWarning: string | null = null;
      try {
        const synced = await syncMedicationNotifications(user.id, timeZone);
        if (notifications && !synced) notificationWarning = 'No se pudieron reprogramar todos los recordatorios locales.';
      } catch (notificationError) {
        notificationWarning = getErrorMessage(notificationError, 'No se pudieron reprogramar los recordatorios locales.');
      }
      setNotice(notificationWarning ? `Tus datos fueron actualizados. ${notificationWarning}` : 'Tus datos fueron actualizados.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'No se pudo actualizar tu perfil.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotifications(enabled: boolean) {
    if (!user) return;
    setError(null);
    setNotice(null);
    setNotifications(enabled);
    try {
      await setNotificationsEnabled(user.id, enabled);
      if (enabled) {
        const synced = await syncMedicationNotifications(user.id, timeZone);
        if (!synced) {
          setNotifications(false);
          await setNotificationsEnabled(user.id, false);
          setError('No se concedieron permisos para notificaciones.');
        } else {
          setNotice('Recordatorios locales activados.');
        }
      } else {
        await cancelMedicationNotifications();
        setNotice('Recordatorios locales desactivados.');
      }
    } catch (toggleError) {
      setNotifications(!enabled);
      await setNotificationsEnabled(user.id, !enabled);
      setError(getErrorMessage(toggleError));
    }
  }

  async function logout() {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (logoutError) {
      Alert.alert('No se pudo cerrar sesión', getErrorMessage(logoutError));
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Perfil y ajustes" subtitle="Administra tus datos y recordatorios." />
      {profileError ? <Notice tone="error">{profileError}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <Card>
        <View style={styles.cardTitle}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(name || 'U').charAt(0).toUpperCase()}</Text></View>
          <View><Text style={styles.cardHeading}>Información personal</Text><Text style={styles.cardSub}>Solo tú puedes editar estos datos.</Text></View>
        </View>
        <View style={styles.form}>
          <TextField icon="person-outline" label="Nombre" onChangeText={setName} value={name} />
          <TextField editable={false} icon="mail-outline" label="Correo electrónico" value={session?.user.email ?? ''} />
          <TextField
            icon="call-outline"
            keyboardType="phone-pad"
            label="Teléfono"
            maxLength={10}
            onChangeText={(value) => setPhone(digitsOnly(value))}
            value={phone}
          />
          <SelectField label="Zona horaria" onChange={setTimeZone} options={TIME_ZONE_OPTIONS} value={timeZone} />
          <AppButton loading={saving} onPress={saveProfile}>Guardar cambios</AppButton>
        </View>
      </Card>

      <Card>
        <View style={styles.settingRow}>
          <View style={styles.settingIcon}><Ionicons color={colors.primary} name="notifications-outline" size={21} /></View>
          <View style={styles.settingCopy}><Text style={styles.cardHeading}>Recordatorios locales</Text><Text style={styles.cardSub}>Avisos aunque la app esté cerrada.</Text></View>
          <Switch onValueChange={toggleNotifications} thumbColor={colors.white} trackColor={{ false: colors.border, true: colors.secondary }} value={notifications} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Próximamente</Text>
      <View style={styles.links}>
        <AppButton onPress={() => router.push('/caregivers')} variant="secondary">Cuidadores</AppButton>
        <AppButton onPress={() => router.push('/watch/connect')} variant="secondary">Conectar smartwatch</AppButton>
      </View>

      <View style={styles.logout}>
        <AppButton onPress={logout} variant="danger">Cerrar sesión</AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.md },
  avatar: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: 30, height: 52, justifyContent: 'center', marginRight: spacing.sm, width: 52 },
  avatarText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  cardHeading: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  form: { gap: spacing.md },
  settingRow: { alignItems: 'center', flexDirection: 'row' },
  settingIcon: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: 10, height: 40, justifyContent: 'center', marginRight: spacing.sm, width: 40 },
  settingCopy: { flex: 1 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },
  links: { gap: spacing.sm },
  logout: { marginTop: spacing.xl },
});
