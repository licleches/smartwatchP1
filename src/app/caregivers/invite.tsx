import { router } from 'expo-router';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';

export default function InviteCaregiverScreen() {
  return (
    <AppScreen>
      <EmptyState icon="person-add-outline" message="Las invitaciones a cuidadores estarán disponibles próximamente." title="Próximamente" action={<AppButton onPress={() => router.back()}>Volver</AppButton>} />
    </AppScreen>
  );
}
