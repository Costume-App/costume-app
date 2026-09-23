-- Verify after applying (dashboard SQL editor, per the home CLAUDE.md use pg_proc, not information_schema):
--   set role postgres;
--   select proname, prosecdef, position('pg_advisory_xact_lock' in prosrc) > 0 as has_lock
--   from pg_proc where proname = 'import_measurement_forms';
-- Expected: one row, prosecdef false, has_lock true.

-- Race guards for import_measurement_forms (0038). Two app rules were checked only in TypeScript
-- before the RPC, so parallel imports could each pass the check and then all write:
--   * a new performer whose name matches an existing one (10 parallel imports made 6 duplicates)
--   * the performer notes cap (5 parallel appends reached 4155 characters against 4000)
-- The TypeScript checks stay as the fast, friendly path; this function is now the backstop.
--
-- 1. A transaction-scoped advisory lock keyed to the production serializes imports into the same
--    production. It is taken first, before the performer row locks, and combine_performers (0037)
--    never takes it, so the lock order cannot form a cycle. Any other function that creates
--    performers in a production can take the same key to join the serialization.
-- 2. Each new name is compared, under that lock, with every performer already in the production
--    (committed by an earlier import, or inserted earlier in this one) using a SQL copy of
--    matchKey in src/lib/cast-import/normalize.ts: lowercase, strip . , ' " and the right single
--    quote, collapse whitespace, trim. A match raises P0002, which the app maps to its 409.
--    src/lib/measurement-import/migration-0039.test.ts guards the copy against drift.
-- 3. After a notes append, the new length is checked against MAX_PERFORMER_NOTES (4000) while the
--    performer row is still locked. Over the cap raises 22001 (string_data_right_truncation) with
--    the performer's label in DETAIL, which the app maps to its notes-too-long 400.

create or replace function import_measurement_forms(p_production_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_form jsonb;
  v_m jsonb;
  v_performer_id uuid;
  v_unit text;
  v_notes text;
  v_existing_ids uuid[];
  v_locked_id uuid;
  v_locked_count int := 0;
  v_label text;
  v_notes_length int;
  n_performers int := 0;
  n_measurements int := 0;
  n_notes int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('import_measurement_forms:' || p_production_id::text, 0));

  select array_agg(distinct (f->'performer'->>'id')::uuid)
  into v_existing_ids
  from jsonb_array_elements(coalesce(p_payload->'forms', '[]'::jsonb)) f
  where f->'performer' ? 'id';

  if v_existing_ids is not null then
    for v_locked_id in
      select id from performers
      where production_id = p_production_id and id = any(v_existing_ids)
      order by id
      for update
    loop
      v_locked_count := v_locked_count + 1;
    end loop;
    if v_locked_count <> array_length(v_existing_ids, 1) then
      raise exception 'A performer in this import is not in this production' using errcode = 'P0002';
    end if;
  end if;

  for v_form in select value from jsonb_array_elements(coalesce(p_payload->'forms', '[]'::jsonb)) loop
    if v_form->'performer' ? 'id' then
      v_performer_id := (v_form->'performer'->>'id')::uuid;
    else
      select label into v_label
      from performers
      where production_id = p_production_id
        and btrim(regexp_replace(regexp_replace(lower(label), '[.,''"’]', '', 'g'), '\s+', ' ', 'g'))
          = btrim(regexp_replace(regexp_replace(lower(v_form->'performer'->>'name'), '[.,''"’]', '', 'g'), '\s+', ' ', 'g'))
      limit 1;
      if found then
        raise exception 'A performer named % is already in this production', v_label using errcode = 'P0002';
      end if;
      insert into performers (production_id, label, created_at)
      values (p_production_id, v_form->'performer'->>'name', clock_timestamp())
      returning id into v_performer_id;
      n_performers := n_performers + 1;
    end if;

    for v_m in select value from jsonb_array_elements(coalesce(v_form->'measurements', '[]'::jsonb)) loop
      select unit into v_unit from measurement_definitions where key = v_m->>'key';
      if v_unit is null then
        raise exception 'Unknown measurement %', v_m->>'key' using errcode = 'P0002';
      end if;
      insert into performer_measurements (performer_id, measurement_key, value_numeric, value_text, unit)
      values (
        v_performer_id,
        v_m->>'key',
        (v_m->>'value_numeric')::numeric,
        v_m->>'value_text',
        v_unit
      )
      on conflict (performer_id, measurement_key) do update
        set value_numeric = excluded.value_numeric,
            value_text = excluded.value_text,
            unit = excluded.unit;
      n_measurements := n_measurements + 1;
    end loop;

    v_notes := nullif(trim(coalesce(v_form->>'notes_append', '')), '');
    if v_notes is not null then
      update performers
      set notes = concat_ws(E'\n\n', nullif(notes, ''), v_notes)
      where id = v_performer_id
      returning label, char_length(notes) into v_label, v_notes_length;
      if v_notes_length > 4000 then
        raise exception 'Notes too long after import' using errcode = '22001', detail = v_label;
      end if;
      n_notes := n_notes + 1;
    end if;
  end loop;

  return jsonb_build_object('performers', n_performers, 'measurements', n_measurements, 'notes', n_notes);
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function import_measurement_forms(uuid, jsonb) from public, anon, authenticated;
grant execute on function import_measurement_forms(uuid, jsonb) to service_role;
