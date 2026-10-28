# Despliegue de MedTimeWatch en Supabase

Este documento es una guia de preparacion. No ejecuta migraciones, no inicia
sesiones ni despliega funciones automaticamente.

## Alcance

El despliegue debe hacerse en dos fases: primero la migracion SQL y despues las
Edge Functions. La migracion actual esta en
`database/migrations/watch_pairing.sql`; Supabase CLI solo aplica migraciones
que esten dentro de `supabase/migrations`, por lo que debe copiarse alli
despues de revisar el esquema remoto y aprobar el cambio.

La migracion es deliberadamente fail-closed:

- No toca `public.dispositivos`, medicamentos, horarios, dosis ni registros.
- Falla si ya existe alguna tabla `watch_*` para evitar adaptar un esquema
  desconocido.
- No usa `DROP TABLE`, `DROP POLICY`, `DROP FUNCTION` ni `DROP TRIGGER`.
- Usa una transaccion; el inicio serializa por `device_identifier` con un
  bloqueo advisory transaccional y las operaciones posteriores bloquean la fila
  con `FOR UPDATE`.

## Archivos

Desplegar o revisar estos archivos:

- `database/migrations/watch_pairing.sql`, copiado a una migracion con timestamp.
- `supabase/config.toml`.
- `supabase/functions/_shared/http.ts`.
- `supabase/functions/_shared/pairing.ts`.
- `supabase/functions/_shared/server.ts`.
- `supabase/functions/watch-pair-start/index.ts`.
- `supabase/functions/watch-pair-preview/index.ts`.
- `supabase/functions/watch-pair-approve/index.ts`.
- `supabase/functions/watch-pair-status/index.ts`.
- `supabase/functions/watch-devices-list/index.ts`.
- `supabase/functions/watch-device-revoke/index.ts`.
- `supabase/functions/watch-doses-list/index.ts`.
- `supabase/functions/watch-dose-update/index.ts`.

La documentacion en `docs/smartwatch/` no se despliega al proyecto.

## Requisitos del CLI

El CLI npm funciona con Node `20` o posterior. Este entorno tiene Node
`22.13.0` y el paquete estable comprobado es `supabase@2.122.0`.

No es necesario instalar PostgreSQL ni Deno globalmente para vincular un
proyecto remoto o desplegar Edge Functions. La validacion de una base local
requiere Docker Desktop; no uses `supabase start` si no quieres crear el stack
local.

Instalacion local, solo cuando se apruebe:

```powershell
npm install --save-dev supabase@2.122.0
npx supabase --version
```

No ejecutes `supabase init --force`: este repositorio ya tiene
`supabase/config.toml` y sobrescribirlo puede perder la configuracion de
`verify_jwt`.

## Orden exacto

### 1. Revisar el remoto sin mutarlo

Desde la raiz del repositorio:

```powershell
npx supabase login
npx supabase link --project-ref "<PROJECT_REF>"
npx supabase migration list --linked
npx supabase db dump --linked --schema public --file ".\supabase-review-public.sql"
```

`login`, `link`, `migration list` y `db dump` no aplican migraciones. No
guardes el dump si contiene datos sensibles y no lo confirmes en Git.

Comprueba en el dump o en el SQL Editor, antes de continuar:

- Que no existan `watch_pairing_requests`, `watch_devices`,
  `watch_device_tokens` ni `watch_pairing_rate_limits`.
- Que el esquema real de `dispositivos` no necesite ser modificado; esta
  migracion no lo usa.
- Que existan las columnas core usadas por las funciones: `medicamentos.usuario_id`,
  `horarios.medicamento_id`, `dosis_programadas.horario_id` y los campos de
  estado/tiempo documentados en el contrato.
- Que los triggers de `registros_tomas` sigan presentes.

No uses `supabase db reset --linked` ni `supabase migration repair` como parte
de esta comprobacion.

### 2. Preparar la migracion local

Solo despues de revisar el remoto y aprobar el SQL:

```powershell
New-Item -ItemType Directory -Path ".\supabase\migrations" -Force
Copy-Item ".\database\migrations\watch_pairing.sql" ".\supabase\migrations\20261027000000_watch_pairing.sql"
```

Usa un timestamp real no usado por la migracion remota. No copies la propuesta
obsoleta `database/smartwatch_pairing_proposal.sql`.

### 3. Validar localmente

Con Docker Desktop disponible, valida la sintaxis y PL/pgSQL sin conectar al
proyecto remoto:

```powershell
npx supabase start
npx supabase db lint --local --schema public --fail-on error
npx supabase db push --local --dry-run
```

Si el proyecto no tiene un entorno local preparado, no uses `db reset` sobre un
entorno con datos importantes. En este equipo no hay Docker, PostgreSQL ni Deno
instalados, por lo que esta validacion queda pendiente.

Como comprobacion adicional contra el remoto, despues de revisar el dump:

```powershell
npx supabase db push --dry-run
```

`--dry-run` solo muestra las migraciones que se aplicarian. Revisa la lista y
detente si aparece cualquier archivo distinto de la migracion aprobada.

### 4. Configurar secretos de Edge Functions

Supabase inyecta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en las Edge
Functions. El segundo nunca debe entrar en Expo, Git, logs ni Wear OS.

Esta implementacion requiere un secreto adicional para no guardar el codigo de
6 digitos como un hash facilmente precomputable:

- `WATCH_PAIRING_CODE_SALT`: requerido, minimo 32 bytes aleatorios.
- `WATCH_RATE_LIMIT_SALT`: recomendado, minimo 32 bytes aleatorios; si falta,
  el codigo usa el service role como fallback interno.

Ejemplo PowerShell para generarlos sin usar `Get-Random`:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$pairingSalt = [Convert]::ToBase64String($bytes)
$rng.GetBytes($bytes)
$rateLimitSalt = [Convert]::ToBase64String($bytes)
$rng.Dispose()

npx supabase secrets set `
  "WATCH_PAIRING_CODE_SALT=$pairingSalt" `
  "WATCH_RATE_LIMIT_SALT=$rateLimitSalt"

Remove-Variable pairingSalt, rateLimitSalt, bytes
```

Comprueba solo los nombres, nunca los valores:

```powershell
npx supabase secrets list
```

Rotar `WATCH_PAIRING_CODE_SALT` invalida los pairing codes pendientes. No lo
rotes durante una ventana de pairing activa sin avisar a los usuarios.

### 5. Aplicar la migracion

Este es el primer comando mutante del procedimiento y requiere aprobacion
explicita:

```powershell
npx supabase db push
```

Si falla, la migracion usa una transaccion y debe revisarse el error antes de
reintentar. No marques la migracion como aplicada manualmente. No uses
`migration repair` para ocultar un fallo de SQL.

### 6. Desplegar funciones

El archivo `supabase/config.toml` es la fuente de verdad de JWT:

| Funcion | `verify_jwt` | Credencial validada por la funcion |
| --- | --- | --- |
| `watch-pair-start` | `false` | rate limit y body validado |
| `watch-pair-status` | `false` | challenge secret |
| `watch-doses-list` | `false` | bearer token de dispositivo |
| `watch-dose-update` | `false` | bearer token de dispositivo |
| `watch-pair-preview` | `true` | JWT de Mobile y `auth.getUser` |
| `watch-pair-approve` | `true` | JWT de Mobile y `auth.getUser` |
| `watch-devices-list` | `true` | JWT de Mobile y `auth.getUser` |
| `watch-device-revoke` | `true` | JWT de Mobile y `auth.getUser` |

El `false` de las cuatro funciones del reloj no significa acceso anónimo: el
gateway no puede interpretar un token de dispositivo como JWT de Supabase, por
eso `requireDevice` valida el hash, expiracion, revocacion, estado y propietario
en SQL. No cambies `verify_jwt` a `false` en las funciones de Mobile para
resolver un `401`.

Despliegue secuencial:

```powershell
$functions = @(
  "watch-pair-start",
  "watch-pair-preview",
  "watch-pair-approve",
  "watch-pair-status",
  "watch-devices-list",
  "watch-device-revoke",
  "watch-doses-list",
  "watch-dose-update"
)

foreach ($function in $functions) {
  npx supabase functions deploy $function
  if ($LASTEXITCODE -ne 0) { throw "Fallo el despliegue de $function" }
}
```

No uses `--no-verify-jwt` en las funciones de Mobile. Si una version del CLI no
lee el bloque de `config.toml`, ese flag solo puede usarse para
`watch-pair-start`, `watch-pair-status`, `watch-doses-list` y
`watch-dose-update`, porque esas funciones tienen controles personalizados en
el codigo fuente.

Verificacion de disponibilidad:

```powershell
npx supabase functions list
npx supabase secrets list
```

### 7. Verificacion funcional

No registres codes, challenges, device tokens, JWTs ni request bodies completos
en logs o capturas.

1. `watch-pair-start` devuelve `201`, un codigo de seis digitos y un challenge
   de 64 caracteres hexadecimales.
2. Una segunda solicitud activa para el mismo identificador devuelve `409` y no
   muta la solicitud anterior; nunca crea dos dispositivos activos.
3. Preview sin JWT devuelve `401`; con JWT devuelve solo nombre, tipo, estado y
   expiracion.
4. Un codigo incorrecto consume el rate limit; cinco intentos identificados
   bloquean la solicitud. Los intentos de preview sin `request_id` quedan
   limitados por cuenta y direccion porque no se puede asociar un codigo
   incorrecto a una solicitud concreta.
5. Approve sin JWT, con JWT de otra cuenta o con codigo usado falla; un reintento
   del mismo usuario despues de una respuesta perdida es idempotente.
6. Approve correcto crea un solo dispositivo `pending` ligado al `auth.uid()`.
7. Status devuelve `pending` antes de approve y entrega el token una sola vez
   despues de approve.
8. Una segunda consulta status nunca devuelve de nuevo el token.
9. List devuelve solo dispositivos de la cuenta autenticada.
10. Revoke invalida inmediatamente el token anterior.
11. Doses list/update con token invalido, expirado o revocado devuelve `401`.
12. Doses list nunca devuelve medicamentos de otra cuenta.
13. Dose update solo permite `confirmada`, `omitida` y `pospuesta`; esta ultima
    solo con 15, 30, 60 o 120 minutos.
14. Dos dispositivos intentando confirmar la misma dosis producen una sola
    transicion final; una repeticion identica es idempotente y una accion final
    distinta devuelve conflicto.
15. Confirmar una dosis crea el historial mediante los triggers existentes; el
   reloj nunca inserta directamente en `registros_tomas`.
16. Una solicitud aprobada que expira revoca su dispositivo `pending`; un nuevo
    start para el mismo identificador puede crear una solicitud.
17. Status con un dispositivo revocado devuelve `DEVICE_REVOKED` y nunca emite
    un token.

## Limpieza de rate limits

`watch_pairing_rate_limits` conserva solo contadores de ventanas temporales. La
retencion operativa recomendada es de 2 horas desde `updated_at`, ejecutada cada
15 minutos. Es mas amplia que la ventana maxima actual de 60 segundos y no
interfiere con claves activas.

Si el proyecto tiene `pg_cron` habilitado, un administrador de base de datos
puede registrar una unica tarea despues de aplicar la migracion:

```sql
select cron.schedule(
  'watch-rate-limits-cleanup',
  '*/15 * * * *',
  $$delete from public.watch_pairing_rate_limits
    where updated_at < now() - interval '2 hours'$$
);
```

Comprueba primero el volumen y evita borrar solicitudes de pairing, dispositivos
o tokens; esta tarea solo elimina claves de rate limit inactivas. Si `pg_cron` no
esta disponible, usa un scheduler de base de datos administrado con el mismo
`DELETE`, nunca un endpoint publico de Edge Functions. Para retirar la tarea:

```sql
select cron.unschedule('watch-rate-limits-cleanup');
```

## Pruebas de Expo y Wear OS

Antes de probar pairing real:

```powershell
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
npx expo start
```

En Mobile verifica restauracion de sesion, pantalla Conectar smartwatch,
preview/aprobacion, revocacion, notificaciones locales y refresco de Dashboard
e Historial tras un cambio en otro cliente autorizado. Realtime requiere que
`public.dosis_programadas` este habilitada en `supabase_realtime`; la propuesta
no ejecutada esta en `database/realtime_doses_proposal.sql`.

En Wear OS verifica que:

- No se transfiera ninguna sesion personal desde Mobile.
- El reloj use solo `challenge_secret` durante pairing y `device_token` despues.
- El token no se almacene en logs ni se envie a otra aplicacion.
- El reloj refresque al volver a primer plano y no confirme localmente antes de
  recibir una respuesta valida.
- Una revocacion en Mobile bloquee las siguientes consultas del reloj.

## Errores comunes

- `401` en Mobile: falta JWT, sesion expirada o se desplego una funcion con
  `verify_jwt = false` por error. No quitar la validacion; revisar la sesion.
- `401` en Wear OS: se envio un JWT de Supabase en vez del device token, el
  token expiro o fue revocado.
- `503 BACKEND_NOT_READY`: migracion no aplicada, RPC inexistente o falta
  `WATCH_PAIRING_CODE_SALT`.
- `PAIRING_CODE_USED` o `PAIRING_EXPIRED`: crear un pairing nuevo; no reusar el
  codigo.
- `DOSE_NOT_FOUND`: la dosis no pertenece al usuario del dispositivo, el
  horario/medicamento esta inactivo o el UUID no es correcto.
- La migracion no aparece en `db push`: el archivo aun esta en
  `database/migrations` y no en `supabase/migrations`.
- El CLI intenta aplicar archivos adicionales: detenerse y revisar
  `supabase migration list` y el `--dry-run`.

## Recuperacion

- Antes de `db push`, conserva un dump de esquema y la salida de
  `supabase migration list --linked`.
- Si la migracion falla, no ejecutes reparacion de historial; revisa el error,
  corrige el archivo local y repite la validacion.
- Si una funcion falla despues de desplegarse, redepliega la version anterior
  desde Git. No borres la funcion para resolver un error de autenticacion.
- Para revocar normalmente, usa la accion **Desvincular smartwatch** en Mobile.
  Eso marca el dispositivo como `revoked` y revoca sus tokens en una operacion
  atomica.
- Para una emergencia autorizada por un administrador de base de datos, puede
  ejecutarse la RPC con el propietario correcto:

  ```sql
  select public.watch_revoke_device('<USER_UUID>', '<DEVICE_UUID>');
  ```

  Esta instruccion es remota y mutante; no debe ejecutarse desde Expo, Wear OS
  ni como parte de una prueba automatica.

## Riesgos residuales

- La limpieza de `watch_pairing_rate_limits` requiere `pg_cron` o un scheduler
  administrado; conserva 2 horas y ejecuta cada 15 minutos. No borres claves
  activas durante una ventana.
- El CLI y Expo 58 dependen de una version vulnerable de `zod` por
  `@expo/cli`; `npm audit fix --force` propone un cambio incompatible de Expo y
  no debe ejecutarse sin una actualizacion planificada.
- El despliegue requiere una auditoria del esquema remoto porque el repositorio
  no contiene la definicion real de `public.dispositivos` ni la publicacion
  Realtime remota.
