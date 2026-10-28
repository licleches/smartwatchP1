# Contrato de vinculación segura

Este contrato describe las Edge Functions locales de MedTime Mobile. La
migracion y las funciones no se despliegan automaticamente desde Expo.

## Principios

- Wear OS no recibe contraseñas, access tokens ni refresh tokens de Supabase Auth.
- `watch-pair-start` no requiere login de usuario.
- Mobile usa su JWT de Supabase para revisar y aprobar.
- Wear OS usa `challenge_secret` durante el pairing y, despues de aprobar, un
  `device_token` propio con vigencia inicial de 30 dias.
- El backend almacena un HMAC-SHA-256 del codigo y hashes SHA-256 del secreto y
  token; nunca guarda sus valores en texto plano ni los escribe en logs.
- La migracion crea tablas privadas `watch_*` y no inventa columnas sobre
  `public.dispositivos`.

## Flujo

1. Wear OS llama `watch-pair-start` con `device_name`, `device_type: "wear_os"`
   y un `device_identifier` estable del reloj.
2. El backend genera un codigo criptograficamente aleatorio de 6 digitos, un
   secreto de desafio de 256 bits y una solicitud que expira en 5 minutos.
3. Wear OS muestra el codigo y conserva localmente el `request_id` y el
   `challenge_secret`.
4. Mobile introduce el codigo y llama `watch-pair-preview`.
5. Mobile muestra solamente nombre, tipo, estado y expiracion; nunca muestra
   identificadores internos ni secretos.
6. Mobile llama `watch-pair-approve` despues de una accion explicita del usuario.
   Esa aprobacion consume el codigo y registra `code_used_at` de forma atomica.
7. Wear OS consulta `watch-pair-status` con `request_id` y `challenge_secret`.
   Mientras Mobile no apruebe, la respuesta es `pending`.
8. La primera respuesta posterior a la aprobacion entrega el `device_token` una
   sola vez. Si se pierde, se debe revocar y crear un pairing nuevo.

## Autenticacion

| Funcion | Metodo | Credencial |
| --- | --- | --- |
| `watch-pair-start` | POST | Ninguna; rate limit persistente |
| `watch-pair-preview` | POST | JWT de Supabase Mobile |
| `watch-pair-approve` | POST | JWT de Supabase Mobile |
| `watch-pair-status` | POST | `challenge_secret` en el cuerpo |
| `watch-devices-list` | POST | JWT de Supabase Mobile |
| `watch-device-revoke` | POST | JWT de Supabase Mobile |
| `watch-doses-list` | POST | `Authorization: Bearer <device_token>` |
| `watch-dose-update` | POST | `Authorization: Bearer <device_token>` |

Las funciones que reciben la credencial propia del reloj desactivan la
verificacion JWT del gateway y validan el token explícitamente contra el hash,
el dispositivo vinculado, la expiracion y la revocacion.

## `watch-pair-start`

Request:

```json
{
  "device_name": "MedTimeWatch",
  "device_type": "wear_os",
  "device_identifier": "watch-installation-id"
}
```

Response `201`:

```json
{
  "request_id": "uuid",
  "code": "123456",
  "challenge_secret": "64-caracteres-hexadecimales",
  "expires_at": "ISO-8601 timestamp"
}
```

Las llamadas de preview tienen rate limit persistente por cuenta y por fuente.
Cuando la solicitud ya se identifica, los intentos invalidos de preview y
approve se acumulan en la solicitud hasta un maximo de 5. Un preview que solo
recibe el codigo no puede atribuir un codigo incorrecto a una solicitud concreta,
por lo que queda protegido por esos limites globales persistentes. Las
solicitudes repetidas desde la misma fuente/dispositivo tambien tienen rate
limit persistente.

## `watch-pair-preview`

Request:

```json
{
  "code": "123456"
}
```

Response `200`:

```json
{
  "request_id": "uuid",
  "device_name": "MedTimeWatch",
  "device_type": "wear_os",
  "status": "pending",
  "expires_at": "ISO-8601 timestamp",
  "can_approve": true
}
```

La respuesta no contiene `device_identifier`, `challenge_secret` ni tokens.

## `watch-pair-approve`

Request:

```json
{
  "request_id": "uuid",
  "code": "123456"
}
```

Response `200`:

```json
{
  "request_id": "uuid",
  "device_id": "uuid",
  "status": "pending",
  "linked_at": null,
  "expires_at": "ISO-8601 timestamp"
}
```

La funcion vincula el dispositivo al `auth.uid()` del JWT, no a un `user_id`
enviado por el cliente. La operacion es atomica; una aprobacion simultanea de
otra cuenta recibe `PAIRING_ALREADY_APPROVED` y no crea otro dispositivo. Un
reintento del mismo usuario devuelve el dispositivo ya creado, sin crear otro,
salvo que haya sido revocado.

## `watch-pair-status`

Request:

```json
{
  "request_id": "uuid",
  "challenge_secret": "64-caracteres-hexadecimales"
}
```

Respuesta pendiente:

```json
{
  "request_id": "uuid",
  "status": "pending",
  "device_id": null,
  "expires_at": "ISO-8601 timestamp"
}
```

Respuesta reclamada:

```json
{
  "request_id": "uuid",
  "status": "linked",
  "device_id": "uuid",
  "device_token": "token-de-64-caracteres-hexadecimales",
  "token_expires_at": "ISO-8601 timestamp"
}
```

`device_token` solo aparece en la primera reclamacion exitosa. No se devuelve
en `watch-pair-preview`, `watch-pair-approve` ni a Mobile.

## Dispositivos y revocacion

`watch-devices-list` devuelve solamente dispositivos `pending` o `linked` del
JWT actual. No devuelve tokens. `watch-device-revoke` recibe únicamente un
`device_id`, valida que pertenezca al usuario autenticado, marca el dispositivo
como `revoked` y revoca todos sus tokens.

## Dosis

`watch-doses-list` acepta opcionalmente `from`, `to` y `limit` y devuelve
medicamento, horario y dosis solo despues de validar el token del reloj. El
servidor filtra por `auth.users.id` asociado al dispositivo y no depende de una
columna `usuario_id` inventada en `dosis_programadas`.

`watch-dose-update` acepta:

```json
{
  "dose_id": "uuid",
  "status": "confirmada",
  "postpone_minutes": null
}
```

Los estados permitidos son `confirmada`, `omitida` y `pospuesta`. Para
`pospuesta`, `postpone_minutes` solo acepta `15`, `30`, `60` o `120`; el
servidor calcula la hora UTC, no confia en el reloj del cliente. La funcion
aplica una actualizacion condicional, valida propiedad mediante medicamento y
horario, y nunca inserta directamente en `registros_tomas`; los triggers
existentes siguen siendo la unica fuente del historial.

## Errores relevantes

- `400`: entrada, codigo, rango o estado invalido.
- `401`: JWT, secreto de desafio o token de dispositivo invalido.
- `404`: solicitud, dispositivo o dosis no encontrada para el propietario.
- `409`: solicitud expirada, bloqueada, ya aprobada o dosis terminal.
- `409`: dispositivo revocado; requiere un pairing nuevo.
- `429`: rate limit o limite de intentos alcanzado.
- `503`: migracion o backend aun no disponible.
