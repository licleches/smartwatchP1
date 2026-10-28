-- MedTime Watch: pairing seguro y API de dispositivo.
-- PROPUESTA. NO EJECUTAR AUTOMATICAMENTE.
--
-- Esta migracion no crea ni modifica public.dispositivos porque el esquema
-- existente de esa tabla no esta confirmado en este repositorio. Las tablas
-- watch_* son privadas para las Edge Functions y no exponen datos al cliente.

begin;

-- La migracion falla cerrada si ya existe una tabla watch_*; no intenta
-- adaptar, borrar ni sobreescribir un esquema previo de origen desconocido.
do $$
declare
  existing_tables text;
begin
  select string_agg(table_name, ', ' order by table_name)
  into existing_tables
  from (
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'watch_pairing_requests',
        'watch_devices',
        'watch_device_tokens',
        'watch_pairing_rate_limits'
      )
  ) as found_tables;

  if existing_tables is not null then
    raise exception 'Ya existen tablas watch_*: %. Revise el esquema manualmente; no se aplicaron cambios.', existing_tables;
  end if;
end;
$$;

create table public.watch_pairing_requests (
  id uuid primary key,
  pairing_code_hash text not null check (length(pairing_code_hash) = 64),
  challenge_secret_hash text not null check (length(challenge_secret_hash) = 64),
  device_name text not null check (char_length(device_name) between 1 and 80),
  device_identifier text not null check (char_length(device_identifier) between 1 and 200),
  device_type text not null default 'wear_os' check (device_type = 'wear_os'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'claimed', 'expired', 'locked', 'revoked')),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  approved_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  claimed_at timestamptz,
  code_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.watch_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pairing_request_id uuid not null unique references public.watch_pairing_requests(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  device_type text not null default 'wear_os' check (device_type = 'wear_os'),
  device_identifier text not null check (char_length(device_identifier) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'linked', 'revoked')),
  linked_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.watch_device_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.watch_devices(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.watch_pairing_rate_limits (
  key_hash text primary key check (length(key_hash) = 64),
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create unique index watch_pairing_active_device_identifier_idx
on public.watch_pairing_requests (device_identifier)
where status in ('pending', 'approved');

create unique index watch_pairing_active_code_idx
on public.watch_pairing_requests (pairing_code_hash)
where status in ('pending', 'approved');

create unique index watch_devices_active_owner_identifier_idx
on public.watch_devices (user_id, device_identifier)
where status <> 'revoked';

create index watch_pairing_requests_status_expiry_idx
on public.watch_pairing_requests (status, expires_at);

create index watch_devices_user_status_idx
on public.watch_devices (user_id, status, created_at desc);

create index watch_device_tokens_device_active_idx
on public.watch_device_tokens (device_id, expires_at)
where revoked_at is null;

create index watch_pairing_rate_limits_updated_at_idx
on public.watch_pairing_rate_limits (updated_at);

create function public.watch_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.watch_set_updated_at() from public, anon, authenticated;
grant execute on function public.watch_set_updated_at() to service_role;

create trigger watch_pairing_requests_updated_at
before update on public.watch_pairing_requests
for each row execute function public.watch_set_updated_at();

create trigger watch_devices_updated_at
before update on public.watch_devices
for each row execute function public.watch_set_updated_at();

create trigger watch_pairing_rate_limits_updated_at
before update on public.watch_pairing_rate_limits
for each row execute function public.watch_set_updated_at();

alter table public.watch_pairing_requests enable row level security;
alter table public.watch_devices enable row level security;
alter table public.watch_device_tokens enable row level security;
alter table public.watch_pairing_rate_limits enable row level security;

revoke all on table public.watch_pairing_requests from anon, authenticated, public, service_role;
revoke all on table public.watch_devices from anon, authenticated, public;
revoke all on table public.watch_device_tokens from anon, authenticated, public;
revoke all on table public.watch_pairing_rate_limits from anon, authenticated, public;

-- Direct request-table access is denied. The SECURITY DEFINER RPCs below use
-- their owner's privileges, not service_role table grants.
grant select on table public.watch_devices to service_role;

create function public.watch_start_pairing(
  p_request_id uuid,
  p_pairing_code_hash text,
  p_challenge_secret_hash text,
  p_device_name text,
  p_device_identifier text,
  p_device_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
begin
  if p_request_id is null
    or p_device_type is distinct from 'wear_os'
    or pg_catalog.char_length(coalesce(p_device_name, '')) not between 1 and 80
    or pg_catalog.char_length(coalesce(p_device_identifier, '')) not between 1 and 200
    or p_pairing_code_hash is null
    or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
    or p_challenge_secret_hash is null
    or p_challenge_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Parametros de pairing invalidos';
  end if;

  -- Serialize starts for the same physical identifier. This makes expiration
  -- and creation one transaction instead of two competing REST requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_device_identifier));

  update public.watch_pairing_requests
  set status = 'expired'
  where device_identifier = p_device_identifier
    and status in ('pending', 'approved')
    and expires_at <= pg_catalog.now();

  update public.watch_devices
  set status = 'revoked', revoked_at = pg_catalog.now()
  where device_identifier = p_device_identifier
    and status = 'pending'
    and pairing_request_id in (
      select id
      from public.watch_pairing_requests
      where device_identifier = p_device_identifier
        and status = 'expired'
    );

  if exists (
    select 1
    from public.watch_pairing_requests
    where device_identifier = p_device_identifier
      and status in ('pending', 'approved')
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'active_request');
  end if;

  insert into public.watch_pairing_requests (
    id,
    pairing_code_hash,
    challenge_secret_hash,
    device_name,
    device_identifier,
    device_type,
    expires_at,
    max_attempts
  )
  values (
    p_request_id,
    p_pairing_code_hash,
    p_challenge_secret_hash,
    p_device_name,
    p_device_identifier,
    p_device_type,
    pg_catalog.now() + interval '5 minutes',
    5
  )
  returning * into pairing;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'expires_at', pairing.expires_at
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'code_collision');
end;
$$;

create function public.watch_consume_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_limit public.watch_pairing_rate_limits%rowtype;
begin
  if pg_catalog.length(coalesce(p_key_hash, '')) <> 64
    or p_window_seconds is null
    or p_window_seconds <= 0
    or p_max_attempts is null
    or p_max_attempts <= 0 then
    raise exception 'Parametros de rate limit invalidos';
  end if;

  insert into public.watch_pairing_rate_limits (key_hash, window_started_at, attempts)
  values (p_key_hash, pg_catalog.now(), 0)
  on conflict (key_hash) do nothing;

  select *
  into current_limit
  from public.watch_pairing_rate_limits
  where key_hash = p_key_hash
  for update;

  if current_limit.window_started_at <= pg_catalog.now() - (p_window_seconds || ' seconds')::interval then
    update public.watch_pairing_rate_limits
    set window_started_at = pg_catalog.now(), attempts = 1
    where key_hash = p_key_hash;
    return true;
  end if;

  if current_limit.attempts >= p_max_attempts then
    return false;
  end if;

  update public.watch_pairing_rate_limits
  set attempts = current_limit.attempts + 1
  where key_hash = p_key_hash;
  return true;
end;
$$;

create function public.watch_pair_preview(
  p_request_id uuid,
  p_pairing_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
begin
  select *
  into pairing
  from public.watch_pairing_requests
  where (
      p_request_id is not null
      and id = p_request_id
    )
    or (
      p_request_id is null
      and pairing_code_hash = p_pairing_code_hash
      and status in ('pending', 'approved')
    )
  order by created_at desc
  limit 1
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', case when p_request_id is null then 'invalid_code' else 'not_found' end
    );
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.code_used_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  if pairing.status in ('expired', 'locked', 'revoked') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
  end if;

  if pairing.pairing_code_hash <> p_pairing_code_hash then
    update public.watch_pairing_requests
    set attempt_count = attempt_count + 1,
        status = case when attempt_count + 1 >= max_attempts then 'locked' else status end
    where id = pairing.id
    returning * into pairing;

    if pairing.status = 'locked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'device_name', pairing.device_name,
    'device_type', pairing.device_type,
    'status', pairing.status,
    'expires_at', pairing.expires_at,
    'can_approve', pairing.status = 'pending'
  );
end;
$$;

create function public.watch_pair_approve(
  p_request_id uuid,
  p_pairing_code_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  device public.watch_devices%rowtype;
begin
  select *
  into pairing
  from public.watch_pairing_requests
  where id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.code_used_at is not null then
    if p_pairing_code_hash is null or pairing.pairing_code_hash <> p_pairing_code_hash then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
    end if;

    if pairing.status not in ('approved', 'claimed') then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
    end if;

    if pairing.approved_user_id is distinct from p_user_id then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_approved');
    end if;

    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'request_id', pairing.id,
      'device_id', device.id,
      'status', device.status,
      'linked_at', device.linked_at,
      'expires_at', pairing.expires_at
    );
  end if;

  if pairing.status in ('expired', 'locked', 'revoked') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
  end if;

  if pairing.pairing_code_hash <> p_pairing_code_hash then
    update public.watch_pairing_requests
    set attempt_count = attempt_count + 1,
        status = case when attempt_count + 1 >= max_attempts then 'locked' else status end
    where id = pairing.id
    returning * into pairing;

    if pairing.status = 'locked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  if pairing.status in ('approved', 'claimed') then
    if pairing.approved_user_id is distinct from p_user_id then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_approved');
    end if;

    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'request_id', pairing.id,
      'device_id', device.id,
      'status', device.status,
      'linked_at', device.linked_at,
      'expires_at', pairing.expires_at
    );
  end if;

  if exists (
    select 1
    from public.watch_devices
    where user_id = p_user_id
      and device_identifier = pairing.device_identifier
      and status <> 'revoked'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_exists');
  end if;

  insert into public.watch_devices (
    user_id,
    pairing_request_id,
    name,
    device_type,
    device_identifier,
    status
  )
  values (
    p_user_id,
    pairing.id,
    pairing.device_name,
    pairing.device_type,
    pairing.device_identifier,
    'pending'
  )
  returning * into device;

  update public.watch_pairing_requests
  set status = 'approved',
      approved_user_id = p_user_id,
      approved_at = pg_catalog.now(),
      code_used_at = pg_catalog.now()
  where id = pairing.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'device_id', device.id,
    'status', device.status,
    'linked_at', device.linked_at,
    'expires_at', pairing.expires_at
  );
end;
$$;

create function public.watch_pair_claim_token(
  p_request_id uuid,
  p_challenge_secret_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  device public.watch_devices%rowtype;
begin
  if pg_catalog.length(coalesce(p_challenge_secret_hash, '')) <> 64
    or pg_catalog.length(coalesce(p_token_hash, '')) <> 64
    or p_token_expires_at is null
    or p_token_expires_at <= pg_catalog.now()
    or p_token_expires_at > pg_catalog.now() + interval '31 days' then
    raise exception 'Credencial de dispositivo invalida';
  end if;

  select *
  into pairing
  from public.watch_pairing_requests
  where id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if pairing.challenge_secret_hash <> p_challenge_secret_hash then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_challenge');
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.status = 'pending' then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'pending', 'expires_at', pairing.expires_at);
  end if;

  if pairing.status = 'approved' then
    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    if device.status <> 'pending' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    insert into public.watch_device_tokens (device_id, token_hash, expires_at)
    values (device.id, p_token_hash, p_token_expires_at);

    update public.watch_devices
    set status = 'linked', linked_at = pg_catalog.now(), last_seen_at = pg_catalog.now()
    where id = device.id;

    update public.watch_pairing_requests
    set status = 'claimed', claimed_at = pg_catalog.now()
    where id = pairing.id;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'linked',
      'token_issued', true,
      'device_id', device.id,
      'token_expires_at', p_token_expires_at
    );
  end if;

  if pairing.status = 'claimed' then
    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    if device.status <> 'linked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'linked',
      'token_issued', false,
      'device_id', device.id,
      'linked_at', device.linked_at
    );
  end if;

  return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
end;
$$;

create function public.watch_authenticate_device(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row record;
begin
  select
    tokens.id as token_id,
    devices.id as device_id,
    devices.user_id
  into token_row
  from public.watch_device_tokens as tokens
  join public.watch_devices as devices on devices.id = tokens.device_id
  where tokens.token_hash = p_token_hash
    and tokens.revoked_at is null
    and tokens.expires_at > pg_catalog.now()
    and devices.status = 'linked'
    and devices.revoked_at is null;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_device_token');
  end if;

  update public.watch_device_tokens
  set last_used_at = pg_catalog.now()
  where id = token_row.token_id;

  update public.watch_devices
  set last_seen_at = pg_catalog.now()
  where id = token_row.device_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'device_id', token_row.device_id,
    'user_id', token_row.user_id
  );
end;
$$;

create function public.watch_revoke_device(
  p_user_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  pairing_request_id uuid;
  revoked_device public.watch_devices%rowtype;
begin
  select devices.pairing_request_id
  into pairing_request_id
  from public.watch_devices as devices
  where devices.id = p_device_id
    and devices.user_id = p_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select *
  into pairing
  from public.watch_pairing_requests as requests
  where requests.id = pairing_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.watch_devices
  set status = 'revoked', revoked_at = pg_catalog.now()
  where public.watch_devices.id = p_device_id
    and public.watch_devices.user_id = p_user_id
    and status <> 'revoked'
  returning * into revoked_device;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.watch_device_tokens
  set revoked_at = pg_catalog.now()
  where device_id = p_device_id
    and revoked_at is null;

  update public.watch_pairing_requests
  set status = 'revoked'
  where id = revoked_device.pairing_request_id
    and status in ('pending', 'approved');

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'device_id', revoked_device.id,
    'status', revoked_device.status,
    'revoked_at', revoked_device.revoked_at
  );
end;
$$;

revoke all on function public.watch_start_pairing(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.watch_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.watch_pair_preview(uuid, text) from public, anon, authenticated;
revoke all on function public.watch_pair_approve(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.watch_pair_claim_token(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.watch_authenticate_device(text) from public, anon, authenticated;
revoke all on function public.watch_revoke_device(uuid, uuid) from public, anon, authenticated;

grant execute on function public.watch_start_pairing(uuid, text, text, text, text, text) to service_role;
grant execute on function public.watch_consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.watch_pair_preview(uuid, text) to service_role;
grant execute on function public.watch_pair_approve(uuid, text, uuid) to service_role;
grant execute on function public.watch_pair_claim_token(uuid, text, text, timestamptz) to service_role;
grant execute on function public.watch_authenticate_device(text) to service_role;
grant execute on function public.watch_revoke_device(uuid, uuid) to service_role;

commit;
