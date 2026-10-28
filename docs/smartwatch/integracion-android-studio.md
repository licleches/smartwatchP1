# Integracion MedTimeWatch

## Alcance

MedTimeWatch sera una aplicacion complementaria para Wear OS. Este repositorio
contiene solamente MedTime Mobile; no incluye codigo Kotlin, Compose ni Data
Layer.

La vinculacion formal usa el contrato de
`docs/smartwatch/pairing-contract.md`. Wear OS mantiene su propia credencial de
dispositivo y nunca recibe la sesion personal de Mobile.

## Supabase

El cliente movil usa la URL publica del proyecto y una clave publishable. El
reloj debe configurar el mismo proyecto con su propia sesion Auth. Nunca se
deben transferir contrasenas, access tokens ni refresh tokens entre apps.

Tablas core disponibles en el contrato movil:

| Tabla | Uso |
| --- | --- |
| `usuarios` | Perfil del usuario autenticado. |
| `medicamentos` | Medicamentos propios del usuario. |
| `horarios` | Horas y dias asociados a un medicamento. |
| `dosis_programadas` | Instancias de dosis y su estado. |
| `registros_tomas` | Historial generado por triggers. El reloj no debe insertar aqui. |

`dispositivos` aparece solamente en el diagnostico SQL del repositorio. No se
asumen sus columnas ni politicas: el pairing formal usa las tablas privadas
`watch_*` descritas en el contrato seguro y no inventa filas en
`dispositivos`.

## Modelo de consulta

Para mostrar una dosis, el reloj debe consultar sus propias filas permitidas
por RLS y resolver:

- `dosis_programadas.id` como UUID estable de la dosis.
- `dosis_programadas.horario_id` hacia `horarios.id`.
- `horarios.medicamento_id` hacia `medicamentos.id`.
- `medicamentos.nombre`, `presentacion`, `dosis_indicada` e `instrucciones`.
- `horarios.hora` y `dias_semana` para la agenda.
- `dosis_programadas.programada_para`, `estado`, `pospuesta_hasta` y `confirmada_en`.

El reloj debe enviar el UUID de la dosis, no el nombre del medicamento, al
confirmar una toma. La actualizacion debe ser equivalente a:

```text
update dosis_programadas
set estado = confirmada,
    confirmada_en = now(),
    pospuesta_hasta = null
where id = <dose_uuid>
  and estado not in (confirmada, omitida)
```

La politica RLS del usuario autenticado sigue siendo la autoridad. Si la
actualizacion no devuelve una fila, el reloj debe informar que la dosis ya fue
confirmada, omitida o no pertenece a la cuenta.

## Estados de dosis

Estados permitidos:

- `programada`: creada para una hora futura.
- `pendiente`: disponible para ser atendida.
- `sin_confirmar`: vencida sin confirmacion.
- `pospuesta`: conserva la dosis y usa `pospuesta_hasta` como proximo aviso.
- `confirmada`: el usuario confirmo la toma.
- `omitida`: el usuario decidio omitirla.

Transiciones validas desde Wear OS:

- `programada`, `pendiente`, `sin_confirmar` o `pospuesta` -> `confirmada`.
- `programada`, `pendiente`, `sin_confirmar` o `pospuesta` -> `omitida`, solo si el producto habilita esa accion.
- `programada`, `pendiente`, `sin_confirmar` o `pospuesta` -> `pospuesta`, con una fecha futura valida.
- `confirmada` y `omitida` son estados terminales para evitar doble confirmacion.

No crear un registro en `registros_tomas` desde Wear OS. Los triggers existentes
de Supabase deben conservarse como unica fuente de ese historial.

## Realtime y actualizacion

MedTime Mobile ya prepara una suscripcion Realtime a `public.dosis_programadas`
y vuelve a cargar Dashboard e Historial cuando llega un cambio. El proyecto
Wear OS puede usar la misma estrategia si la tabla esta habilitada en la
publicacion `supabase_realtime`.

La habilitacion propuesta, sin ejecutar, esta en
`database/realtime_doses_proposal.sql`.

Como la tabla no tiene `usuario_id` directo en este esquema, no se debe crear un
filtro por una columna inventada. Las consultas posteriores deben depender de
RLS y de las relaciones reales. La app movil vuelve a consultar sus filas antes
de renderizar, por lo que un evento de otra cuenta no debe exponer datos.

Ademas, el reloj debe refrescar al volver al primer plano y manejar errores de
red sin marcar una dosis como confirmada localmente antes de recibir una
respuesta valida de Supabase.

## Vinculacion formal

La migracion propuesta esta en:

`database/migrations/watch_pairing.sql`

No modifica `public.dispositivos`; crea tablas privadas `watch_*` para
solicitudes, dispositivos, tokens y rate limits. El codigo no se genera en
Expo: Mobile solo valida el formato, solicita preview y requiere una aprobacion
explicita.

Las Edge Functions locales son:

- `watch-pair-start`
- `watch-pair-preview`
- `watch-pair-approve`
- `watch-pair-status`
- `watch-devices-list`
- `watch-device-revoke`
- `watch-doses-list`
- `watch-dose-update`

Revisar y desplegar manualmente la migracion y las funciones antes de probarlas
contra Supabase.

## Trabajo pendiente en Android Studio

- Configurar el mismo proyecto Supabase y autenticacion propia.
- Consultar medicamentos y dosis mediante la sesion del reloj.
- Mostrar la zona horaria configurada por el usuario al interpretar fechas.
- Confirmar dosis por UUID y manejar respuestas duplicadas o RLS.
- Refrescar al recuperar foco y manejar desconexion.
- Habilitar Realtime solo cuando `dosis_programadas` este publicada y protegida.
- Implementar las Edge Functions de pairing y su cliente HTTP.
- No transferir sesiones desde Mobile.
- No asumir que “vinculado” significa conectado a Internet.

## Funcionalidades moviles disponibles

- Auth y perfiles con Supabase.
- Medicamentos, horarios y fechas.
- Generacion de dosis programadas.
- Confirmar, posponer y omitir dosis con actualizacion condicional.
- Dashboard e Historial con refresco al recuperar foco.
- Refresco Realtime preparado para cambios en `dosis_programadas`.
- Pantalla Conectar smartwatch con estado no configurado, formulario validado e instrucciones.
