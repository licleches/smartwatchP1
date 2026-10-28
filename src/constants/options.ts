export const DEFAULT_TIME_ZONE = 'America/Hermosillo';

export const TIME_ZONE_OPTIONS = [
  { label: 'Sonora', value: 'America/Hermosillo' },
  { label: 'Baja California', value: 'America/Tijuana' },
  { label: 'Sinaloa', value: 'America/Mazatlan' },
  { label: 'Chihuahua', value: 'America/Chihuahua' },
  { label: 'Ciudad de México', value: 'America/Mexico_City' },
  { label: 'Nuevo León', value: 'America/Monterrey' },
  { label: 'Quintana Roo', value: 'America/Cancun' },
  { label: 'UTC', value: 'Etc/UTC' },
] as const;

export const PRESENTATION_OPTIONS = [
  'Tabletas',
  'Cápsulas',
  'Suspensión oral',
  'Jarabe',
  'Gotas',
  'Inhalador',
  'Solución inyectable',
  'Pluma de insulina',
  'Crema',
  'Pomada',
  'Gel',
  'Aerosol / Inhalador',
  'Parche',
  'Supositorios',
  'Polvo',
  'Solución oral',
] as const;

export const OTHER_PRESENTATION = 'Otra presentación';

export function getDetectedTimeZone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIME_ZONE_OPTIONS.some((option) => option.value === detected) ? detected : DEFAULT_TIME_ZONE;
}

export function getConfiguredTimeZone(value?: string | null) {
  return TIME_ZONE_OPTIONS.some((option) => option.value === value) ? value! : getDetectedTimeZone();
}
