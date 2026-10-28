-- MedTime: reparacion manual de perfiles y RLS.
-- NO se ejecuta desde Expo ni desde la aplicacion.
-- Ejecutar primero la seccion A y detenerse para revisar sus resultados.
-- Esta migracion falla de forma segura si encuentra politicas desconocidas
-- en las tablas protegidas. No desactiva RLS ni usa service_role.

-- ============================================================================
-- A. DIAGNOSTICO. Ejecutar esta seccion y revisar los resultados antes de B.
-- ============================================================================

select
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
from information_schema.columns as c
where c.table_schema = 'public'
  and c.table_name in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas',
    'familiares',
    'notificaciones',
    'dispositivos'
  )
order by c.table_name, c.ordinal_position;

select
  n.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced
from pg_class as cls
join pg_namespace as n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas',
    'familiares',
    'notificaciones',
    'dispositivos'
  )
order by cls.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas',
    'familiares',
    'notificaciones',
    'dispositivos'
  )
order by tablename, policyname;

-- Politicas potencialmente peligrosas: revisar cualquier fila devuelta.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas',
    'familiares',
    'notificaciones',
    'dispositivos'
  )
  and (
    roles @> array['public']::name[]
    or coalesce(qual, '') ~* '(^|[^[:alpha:]_])true([^[:alpha:]_]|$)'
    or coalesce(with_check, '') ~* '(^|[^[:alpha:]_])true([^[:alpha:]_]|$)'
  );

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas',
    'familiares',
    'notificaciones',
    'dispositivos'
  )
  and lower(grantee) in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger as t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger as t
where t.tgrelid = to_regclass('public.dosis_programadas')
  and not t.tgisinternal;

select
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(con.oid) as constraint_definition
from information_schema.table_constraints as tc
join pg_constraint as con
  on con.conname = tc.constraint_name
 and con.connamespace = tc.constraint_schema::regnamespace
where tc.table_schema = 'public'
  and tc.table_name in (
    'usuarios',
    'medicamentos',
    'horarios',
    'dosis_programadas',
    'registros_tomas'
  )
  order by tc.table_name, tc.constraint_name;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('dosis_programadas', 'registros_tomas')
order by tablename, indexname;

-- DETENERSE AQUI. Ejecutar la seccion B solo despues de revisar A.

-- ============================================================================
-- B. REPARACION TRANSACCIONAL DE TABLAS CORE.
-- ============================================================================

begin;

-- B.1. Preflight: no se continua con un esquema incompleto o ambiguo.
do $$
declare
  missing_columns text;
begin
  if to_regclass('public.usuarios') is null
    or to_regclass('public.medicamentos') is null
    or to_regclass('public.horarios') is null
    or to_regclass('public.dosis_programadas') is null
    or to_regclass('public.registros_tomas') is null then
    raise exception 'Falta una tabla core de MedTime; no se aplicaron cambios.';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
  into missing_columns
  from (
    values
      ('usuarios', 'id'),
      ('usuarios', 'nombre'),
      ('usuarios', 'telefono'),
      ('usuarios', 'zona_horaria'),
      ('usuarios', 'creado_en'),
      ('usuarios', 'actualizado_en'),
      ('medicamentos', 'id'),
      ('medicamentos', 'usuario_id'),
      ('medicamentos', 'activo'),
      ('horarios', 'id'),
      ('horarios', 'medicamento_id'),
      ('horarios', 'activo'),
       ('dosis_programadas', 'id'),
       ('dosis_programadas', 'horario_id'),
       ('dosis_programadas', 'programada_para'),
       ('dosis_programadas', 'estado'),
       ('dosis_programadas', 'confirmada_en'),
       ('dosis_programadas', 'pospuesta_hasta')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Faltan columnas requeridas: %. No se aplicaron cambios.', missing_columns;
  end if;

  if (select atttypid from pg_attribute where attrelid = 'public.usuarios'::regclass and attname = 'id' and not attisdropped)
     is distinct from
     (select atttypid from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'id' and not attisdropped) then
    raise exception 'public.usuarios.id no tiene el mismo tipo que auth.users.id. No se aplicaron cambios.';
  end if;

  if exists (select 1 from public.usuarios where id is null)
    or exists (select id from public.usuarios group by id having count(*) > 1) then
    raise exception 'public.usuarios contiene IDs nulos o duplicados. Corrija esos datos manualmente antes de continuar.';
  end if;

  if not exists (
    select 1
    from pg_index as i
    where i.indrelid = 'public.usuarios'::regclass
      and i.indisunique
      and i.indnatts = 1
      and i.indkey[0] = (
        select attnum
        from pg_attribute
        where attrelid = 'public.usuarios'::regclass
          and attname = 'id'
          and not attisdropped
      )
  ) then
    raise exception 'public.usuarios.id debe tener una restriccion UNIQUE o PRIMARY KEY para evitar perfiles duplicados.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registros_tomas'
      and column_name in ('dosis_programada_id', 'dosis_id')
  ) then
    raise exception 'registros_tomas no tiene dosis_programada_id ni dosis_id; revise su relacion antes de continuar.';
  end if;
end;
$$;

-- B.2. Fallo cerrado ante politicas que no pertenecen a este conjunto conocido.
-- No se eliminan politicas desconocidas automaticamente.
do $$
declare
  unexpected_policies text;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname)
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('usuarios', 'medicamentos', 'horarios', 'dosis_programadas', 'registros_tomas')
    and policyname not in (
      'usuarios_select_propio',
      'usuarios_update_propio',
      'medicamentos_select_propios',
      'medicamentos_insert_propios',
      'medicamentos_update_propios',
      'horarios_select_de_medicamentos_propios',
      'horarios_insert_de_medicamentos_propios',
      'horarios_update_de_medicamentos_propios',
      'medtime_usuarios_select_own',
      'medtime_usuarios_update_own',
      'medtime_medicamentos_select_own',
      'medtime_medicamentos_insert_own',
      'medtime_medicamentos_update_own',
      'medtime_horarios_select_own',
      'medtime_horarios_insert_own',
      'medtime_horarios_update_own',
      'medtime_horarios_delete_own',
      'medtime_dosis_select_own',
      'medtime_dosis_insert_own',
      'medtime_dosis_update_own',
      'medtime_registros_tomas_select_own'
    );

  if unexpected_policies is not null then
    raise exception 'Se encontraron politicas no reconocidas: %. Revise la seccion A y elimine/reemplace solo las politicas incorrectas de forma explicita.', unexpected_policies;
  end if;
end;
$$;

-- B.3. Trigger seguro para perfiles nuevos.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.usuarios (
    id,
    nombre,
    telefono,
    zona_horaria,
    creado_en,
    actualizado_en
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefono', ''), '[^0-9]', '', 'g'), ''),
    case
      when new.raw_user_meta_data ->> 'zona_horaria' in (
        'America/Hermosillo',
        'America/Tijuana',
        'America/Mazatlan',
        'America/Chihuahua',
        'America/Mexico_City',
        'America/Monterrey',
        'America/Cancun',
        'Etc/UTC'
      ) then new.raw_user_meta_data ->> 'zona_horaria'
      else 'America/Hermosillo'
    end,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;

-- Solo se reemplaza el trigger con este nombre. Otros triggers existentes
-- aparecen en la seccion A y no se eliminan automaticamente.
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- B.4. Recuperacion idempotente de perfiles antiguos.
insert into public.usuarios (
  id,
  nombre,
  telefono,
  zona_horaria,
  creado_en,
  actualizado_en
)
select
  au.id,
  nullif(trim(au.raw_user_meta_data ->> 'nombre'), ''),
  nullif(regexp_replace(coalesce(au.raw_user_meta_data ->> 'telefono', ''), '[^0-9]', '', 'g'), ''),
  case
    when au.raw_user_meta_data ->> 'zona_horaria' in (
      'America/Hermosillo',
      'America/Tijuana',
      'America/Mazatlan',
      'America/Chihuahua',
      'America/Mexico_City',
      'America/Monterrey',
      'America/Cancun',
      'Etc/UTC'
    ) then au.raw_user_meta_data ->> 'zona_horaria'
    else 'America/Hermosillo'
  end,
  now(),
  now()
from auth.users as au
where not exists (
  select 1
  from public.usuarios as existing
  where existing.id = au.id
)
on conflict (id) do nothing;

-- B.5. Mantener RLS y conceder solo los privilegios de la app.
alter table public.usuarios enable row level security;
alter table public.medicamentos enable row level security;
alter table public.horarios enable row level security;
alter table public.dosis_programadas enable row level security;
alter table public.registros_tomas enable row level security;

revoke all on table public.usuarios from anon, public;
revoke all on table public.medicamentos from anon, public;
revoke all on table public.horarios from anon, public;
revoke all on table public.dosis_programadas from anon, public;
revoke all on table public.registros_tomas from anon, public;

grant select, update on table public.usuarios to authenticated;
grant select, insert, update on table public.medicamentos to authenticated;
grant select, insert, update, delete on table public.horarios to authenticated;
grant select, insert, update on table public.dosis_programadas to authenticated;
grant select on table public.registros_tomas to authenticated;

-- B.6. Reemplazar solo los nombres de politicas conocidos por politicas propias.
drop policy if exists usuarios_select_propio on public.usuarios;
drop policy if exists usuarios_update_propio on public.usuarios;
drop policy if exists medtime_usuarios_select_own on public.usuarios;
drop policy if exists medtime_usuarios_update_own on public.usuarios;

drop policy if exists medicamentos_select_propios on public.medicamentos;
drop policy if exists medicamentos_insert_propios on public.medicamentos;
drop policy if exists medicamentos_update_propios on public.medicamentos;
drop policy if exists medtime_medicamentos_select_own on public.medicamentos;
drop policy if exists medtime_medicamentos_insert_own on public.medicamentos;
drop policy if exists medtime_medicamentos_update_own on public.medicamentos;

drop policy if exists horarios_select_de_medicamentos_propios on public.horarios;
drop policy if exists horarios_insert_de_medicamentos_propios on public.horarios;
drop policy if exists horarios_update_de_medicamentos_propios on public.horarios;
drop policy if exists medtime_horarios_select_own on public.horarios;
drop policy if exists medtime_horarios_insert_own on public.horarios;
drop policy if exists medtime_horarios_update_own on public.horarios;
drop policy if exists medtime_horarios_delete_own on public.horarios;

drop policy if exists medtime_dosis_select_own on public.dosis_programadas;
drop policy if exists medtime_dosis_insert_own on public.dosis_programadas;
drop policy if exists medtime_dosis_update_own on public.dosis_programadas;
drop policy if exists medtime_registros_tomas_select_own on public.registros_tomas;

create policy medtime_usuarios_select_own
on public.usuarios
for select to authenticated
using (id = (select auth.uid()));

create policy medtime_usuarios_update_own
on public.usuarios
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy medtime_medicamentos_select_own
on public.medicamentos
for select to authenticated
using (usuario_id = (select auth.uid()));

create policy medtime_medicamentos_insert_own
on public.medicamentos
for insert to authenticated
with check (usuario_id = (select auth.uid()));

create policy medtime_medicamentos_update_own
on public.medicamentos
for update to authenticated
using (usuario_id = (select auth.uid()))
with check (usuario_id = (select auth.uid()));

create policy medtime_horarios_select_own
on public.horarios
for select to authenticated
using (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = horarios.medicamento_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_horarios_insert_own
on public.horarios
for insert to authenticated
with check (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = horarios.medicamento_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_horarios_update_own
on public.horarios
for update to authenticated
using (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = horarios.medicamento_id
      and m.usuario_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = horarios.medicamento_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_horarios_delete_own
on public.horarios
for delete to authenticated
using (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = horarios.medicamento_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_dosis_select_own
on public.dosis_programadas
for select to authenticated
using (
  exists (
    select 1
    from public.horarios as h
    join public.medicamentos as m on m.id = h.medicamento_id
    where h.id = dosis_programadas.horario_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_dosis_insert_own
on public.dosis_programadas
for insert to authenticated
with check (
  exists (
    select 1
    from public.horarios as h
    join public.medicamentos as m on m.id = h.medicamento_id
    where h.id = dosis_programadas.horario_id
      and m.usuario_id = (select auth.uid())
  )
);

create policy medtime_dosis_update_own
on public.dosis_programadas
for update to authenticated
using (
  exists (
    select 1
    from public.horarios as h
    join public.medicamentos as m on m.id = h.medicamento_id
    where h.id = dosis_programadas.horario_id
      and m.usuario_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.horarios as h
    join public.medicamentos as m on m.id = h.medicamento_id
    where h.id = dosis_programadas.horario_id
      and m.usuario_id = (select auth.uid())
  )
);

-- registros_tomas no recibe INSERT/UPDATE/DELETE del rol authenticated.
-- El trigger existente debe insertar usando el propietario/SECURITY DEFINER.
do $$
declare
  dose_column text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registros_tomas'
      and column_name = 'dosis_programada_id'
  ) then
    dose_column := 'dosis_programada_id';
  else
    dose_column := 'dosis_id';
  end if;

  execute format(
    'create policy medtime_registros_tomas_select_own
     on public.registros_tomas
     for select to authenticated
     using (exists (
       select 1
       from public.dosis_programadas as d
       join public.horarios as h on h.id = d.horario_id
       join public.medicamentos as m on m.id = h.medicamento_id
       where d.id = registros_tomas.%I
         and m.usuario_id = (select auth.uid())
     ))',
    dose_column
  );
end;
$$;

revoke insert, update, delete on table public.registros_tomas from authenticated;

-- B.7. Las tablas adicionales no tienen esquema en este repositorio.
-- Se diagnostican, pero no se inventan politicas basadas en columnas supuestas.
-- Si existen, su migracion debe usar su FK real de propietario/autorizacion.
do $$
declare
  unsafe_tables text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name)
  into unsafe_tables
  from information_schema.tables as t
  join pg_class as cls
    on cls.relname = t.table_name
  join pg_namespace as ns
    on ns.oid = cls.relnamespace
   and ns.nspname = t.table_schema
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and t.table_name in ('familiares', 'notificaciones', 'dispositivos')
    and (
      not cls.relrowsecurity
      or not exists (
        select 1 from pg_policies as p
        where p.schemaname = t.table_schema
          and p.tablename = t.table_name
      )
      or exists (
        select 1 from pg_policies as p
        where p.schemaname = t.table_schema
          and p.tablename = t.table_name
          and (
            p.roles @> array['public']::name[]
            or coalesce(p.qual, '') ~* '(^|[^[:alpha:]_])true([^[:alpha:]_]|$)'
            or coalesce(p.with_check, '') ~* '(^|[^[:alpha:]_])true([^[:alpha:]_]|$)'
          )
      )
    );

  if unsafe_tables is not null then
    raise exception 'Las tablas adicionales requieren revision manual antes de continuar: %.', unsafe_tables;
  end if;
end;
$$;

commit;

-- ============================================================================
-- C. VALIDACION POSTERIOR. Ejecutar despues de B y con dos sesiones Auth.
-- ============================================================================

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('usuarios', 'medicamentos', 'horarios', 'dosis_programadas', 'registros_tomas')
order by tablename, policyname;

select
  au.id as auth_user_id,
  au.email,
  u.id as profile_id,
  (u.id = au.id) as ids_match
from auth.users as au
left join public.usuarios as u on u.id = au.id
order by au.created_at;

-- En una sesion autenticada de A, estas consultas deben devolver solo filas de A.
-- Ejecutarlas mediante la app o una peticion PostgREST con el JWT de A/B;
-- el SQL Editor ejecutado como propietario no es una prueba valida de RLS.
select (select auth.uid()) as current_auth_uid;
select id, usuario_id from public.medicamentos;
select h.id, h.medicamento_id from public.horarios as h;
select d.id, d.horario_id from public.dosis_programadas as d;
select r.* from public.registros_tomas as r;

-- Estas consultas deben devolver cero filas para A y para B.
select * from public.usuarios where id <> (select auth.uid());
select * from public.medicamentos where usuario_id <> (select auth.uid());
select h.*
from public.horarios as h
join public.medicamentos as m on m.id = h.medicamento_id
where m.usuario_id <> (select auth.uid());
select d.*
from public.dosis_programadas as d
join public.horarios as h on h.id = d.horario_id
join public.medicamentos as m on m.id = h.medicamento_id
where m.usuario_id <> (select auth.uid());

-- Comprobar que el trigger existe despues de la reparacion.
select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger as t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;
