-- Este archivo es una propuesta para revisar/ejecutar manualmente en Supabase.
-- La aplicacion no lo ejecuta y nunca debe contener una service_role key.

-- 1) Usuarios autenticados sin perfil y posibles duplicados.
select
  au.id as auth_user_id,
  au.email,
  u.id as profile_id
from auth.users as au
left join public.usuarios as u on u.id = au.id
where u.id is null;

select id, count(*) as profile_count
from public.usuarios
group by id
having count(*) > 1;

-- 2) Trigger(s) actualmente instalados sobre auth.users.
select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger as t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- 3) Politicas y permisos de medicamentos/horarios.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('usuarios', 'medicamentos', 'horarios');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('usuarios', 'medicamentos', 'horarios')
  and grantee in ('authenticated', 'anon')
order by table_name, grantee, privilege_type;

-- DETENERSE AQUI: revisar los resultados antes de ejecutar las secciones 4-6.

-- 4) Recuperacion segura de perfiles antiguos.
-- Solo inserta perfiles que no existen; no actualiza datos validos y evita duplicados.
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

-- 5) Trigger sugerido para nuevas cuentas.
-- Ejecutar solo despues de confirmar en la seccion 2 que no existe un trigger equivalente.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Ejecutar solo si la comprobacion anterior confirmo que falta el trigger.
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- 6) Politicas minimas, solo si la consulta de la seccion 3 confirma que faltan.
-- Estas politicas no desactivan RLS ni permiten acceso entre usuarios.
alter table public.usuarios enable row level security;
grant select, update on table public.usuarios to authenticated;

create policy usuarios_select_propio
on public.usuarios
for select to authenticated
using (id = auth.uid());

create policy usuarios_update_propio
on public.usuarios
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

alter table public.medicamentos enable row level security;
grant select, insert, update on table public.medicamentos to authenticated;

create policy medicamentos_select_propios
on public.medicamentos
for select to authenticated
using (usuario_id = auth.uid());

create policy medicamentos_insert_propios
on public.medicamentos
for insert to authenticated
with check (usuario_id = auth.uid());

create policy medicamentos_update_propios
on public.medicamentos
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

alter table public.horarios enable row level security;
grant select, insert, update on table public.horarios to authenticated;

create policy horarios_select_de_medicamentos_propios
on public.horarios
for select to authenticated
using (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = medicamento_id
      and m.usuario_id = auth.uid()
  )
);

create policy horarios_insert_de_medicamentos_propios
on public.horarios
for insert to authenticated
with check (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = medicamento_id
      and m.usuario_id = auth.uid()
  )
);

create policy horarios_update_de_medicamentos_propios
on public.horarios
for update to authenticated
using (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = medicamento_id
      and m.usuario_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.medicamentos as m
    where m.id = medicamento_id
      and m.usuario_id = auth.uid()
  )
);
