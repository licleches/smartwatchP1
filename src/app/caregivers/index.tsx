import { router } from 'expo-router';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export default function CaregiversScreen() {
  return (
    <AppScreen>
      <ScreenHeader title="Cuidadores" subtitle="Comparte el seguimiento con personas de confianza." />
      <EmptyState
        icon="people-outline"
        message="La vinculación con familiares y cuidadores estará disponible en una próxima versión."
        title="Próximamente"
        action={<AppButton onPress={() => router.back()}>Volver</AppButton>}
      />
    </AppScreen>
  );
}
