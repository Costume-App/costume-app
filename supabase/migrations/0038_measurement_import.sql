-- Measurement form import: write reviewed measurements (and leftover notes) for several
-- performers in one transaction. The payload is built server-side (src/lib/data/measurement-import.ts)
-- after validation.
--
-- p_payload:
--   forms: [{
--     performer:    { id } | { name },
--     measurements: [{ key, value_numeric, value_text }],
--     notes_append: text | null
--   }]
--
-- Existing performer ids must belong to p_production_id and measurement keys must exist in
-- measurement_definitions (P0002 otherwise). Any error rolls the whole import back. Returns the
-- counts of performers created, measurement rows written, and notes appended.
create or replace function import_measurement_forms(p_production_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form jsonb;
  v_m jsonb;
  v_performer_id uuid;
  v_unit text;
  v_notes text;
  n_performers int := 0;
  n_measurements int := 0;
  n_notes int := 0;
begin
  for v_form in select value from jsonb_array_elements(coalesce(p_payload->'forms', '[]'::jsonb)) loop
    v_performer_id := null;
    if v_form->'performer' ? 'id' then
      select id into v_performer_id
      from performers
      where id = (v_form->'performer'->>'id')::uuid and production_id = p_production_id
      for update;
      if v_performer_id is null then
        raise exception 'Performer % is not in this production', v_form->'performer'->>'id' using errcode = 'P0002';
      end if;
    else
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
      insert into performer_measurements (performer_id, measurement_key, value_numeric, value_text, unit, updated_at)
      values (
        v_performer_id,
        v_m->>'key',
        (v_m->>'value_numeric')::numeric,
        v_m->>'value_text',
        v_unit,
        now()
      )
      on conflict (performer_id, measurement_key) do update
        set value_numeric = excluded.value_numeric,
            value_text = excluded.value_text,
            unit = excluded.unit,
            updated_at = now();
      n_measurements := n_measurements + 1;
    end loop;

    v_notes := nullif(trim(coalesce(v_form->>'notes_append', '')), '');
    if v_notes is not null then
      update performers
      set notes = concat_ws(E'\n\n', nullif(notes, ''), v_notes)
      where id = v_performer_id;
      n_notes := n_notes + 1;
    end if;
  end loop;

  return jsonb_build_object('performers', n_performers, 'measurements', n_measurements, 'notes', n_notes);
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function import_measurement_forms(uuid, jsonb) from public, anon, authenticated;
grant execute on function import_measurement_forms(uuid, jsonb) to service_role;
