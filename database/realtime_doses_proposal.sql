-- PROPUESTA. NO EJECUTAR AUTOMATICAMENTE.
-- Realtime debe habilitarse solo despues de confirmar el esquema y RLS.

do $$
begin
  if to_regclass('public.dosis_programadas') is null then
    raise exception 'No existe public.dosis_programadas; no se modifico la publicacion.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dosis_programadas'
  ) then
    alter publication supabase_realtime add table public.dosis_programadas;
  end if;
end;
$$;
