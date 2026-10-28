# MedTime

Aplicacion movil para organizar medicamentos y recordatorios con Expo, React Native, TypeScript, Expo Router y Supabase.

## Configuracion

1. Instala dependencias: `npm install`.
2. Define `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env`.
3. Inicia Expo: `npx expo start`.

`.env` esta excluido de Git. Usa solo la clave publishable; nunca una `service_role`.

## Comandos

- `npm run lint`
- `npm run typecheck`
- `npx expo start`

## Funcionalidades

- Registro, inicio, recuperacion de acceso y sesion persistente.
- Rutas protegidas para usuarios autenticados.
- Dashboard con datos reales de Supabase.
- Alta, edicion y desactivacion de medicamentos.
- Horarios, dias de la semana y dosis programadas para 14 dias.
- Confirmacion, posposicion y omision voluntaria de dosis.
- Historial semanal, calendario simple y filtro por medicamento.
- Perfil, zona horaria y recordatorios locales.

Las funciones de smartwatch y cuidadores permanecen como "Proximamente".
