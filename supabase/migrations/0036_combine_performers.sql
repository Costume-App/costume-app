-- Verify after applying (dashboard SQL editor, per the home CLAUDE.md use pg_proc, not information_schema):
--   set role postgres;
--   select p.proname,
--          has_function_privilege('service_role', p.oid, 'execute') as service_role,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('anon', p.oid, 'execute') as anon
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'combine_performers';
-- Expected: one row, service_role true, authenticated false, anon false.

-- Combine same-name performers in a production into one person (see the 2026-09-22 spec).
-- Before 2026-09-15 every cast add created a new performer, so one person cast in three roles
-- became three rows with three measurement sets. This moves every casting from the dropped rows
-- onto the kept row, fills the kept row's missing measurements from the dropped rows, and deletes
-- the dropped rows, all in one transaction.
--
-- Rules:
--   * The kept row's measurement values always win. Only keys it lacks are filled.
--   * Among dropped rows holding the same key, the earliest updated_at wins.
--   * Costume pieces reference castings by id, so they move with the casting untouched.
--   * A casting unique violation (the kept row already holds that cast + role) aborts the call
--     with SQLSTATE 23505; the caller maps it to a user-facing conflict.
--   * Any id outside the production aborts with SQLSTATE P0002 before anything is written.
create or replace function combine_performers(p_production_id uuid, p_keep uuid, p_drop uuid[])
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n_expected int;
  n_found int;
  n_castings int := 0;
  n_measurements int := 0;
  n_performers int := 0;
begin
  n_expected := coalesce(array_length(p_drop, 1), 0);
  if n_expected = 0 then
    raise exception 'combine_scope: nothing to drop' using errcode = 'P0002';
  end if;
  if p_keep = any(p_drop) then
    raise exception 'combine_scope: kept performer is also listed to drop' using errcode = 'P0002';
  end if;
  if not exists (select 1 from performers where id = p_keep and production_id = p_production_id) then
    raise exception 'combine_scope: kept performer is not in this production' using errcode = 'P0002';
  end if;
  select count(distinct id) into n_found
  from performers
  where production_id = p_production_id and id = any(p_drop);
  if n_found <> n_expected then
    raise exception 'combine_scope: a dropped performer is not in this production' using errcode = 'P0002';
  end if;

  -- Move every casting. castings_cast_role_performer_key raises 23505 on a collision.
  update castings set performer_id = p_keep where performer_id = any(p_drop);
  get diagnostics n_castings = row_count;

  -- Fill only what the kept row lacks. One row per key from the dropped set, earliest wins.
  insert into performer_measurements (performer_id, measurement_key, value_numeric, value_text, unit, updated_at)
  select p_keep, d.measurement_key, d.value_numeric, d.value_text, d.unit, d.updated_at
  from (
    select distinct on (m.measurement_key) m.*
    from performer_measurements m
    where m.performer_id = any(p_drop)
    order by m.measurement_key, m.updated_at asc, m.id asc
  ) d
  on conflict (performer_id, measurement_key) do nothing;
  get diagnostics n_measurements = row_count;

  -- Their remaining measurements cascade with the row.
  delete from performers where id = any(p_drop);
  get diagnostics n_performers = row_count;

  return jsonb_build_object(
    'castings_moved', n_castings,
    'measurements_filled', n_measurements,
    'performers_removed', n_performers
  );
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function combine_performers(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function combine_performers(uuid, uuid, uuid[]) to service_role;
