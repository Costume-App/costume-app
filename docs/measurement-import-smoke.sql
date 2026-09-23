-- Smoke test for import_measurement_forms (migration 0038).
-- Paste into the Supabase SQL editor and run as is. It picks its own test rows,
-- runs every check, then raises an exception ON PURPOSE so Postgres rolls the
-- whole block back. Nothing it writes survives.
--
-- Expected result: an ERROR whose message starts with "SMOKE PASSED".
-- Any other error message names the check that failed.

do $$
declare
  v_prod uuid;
  v_perf uuid;
  v_foreign uuid;
  v_res jsonb;
  v_num numeric;
  v_txt text;
  v_notes text;
  v_count int;
begin
  -- A production with at least one performer, and a performer from a different production.
  select p.production_id, p.id into v_prod, v_perf from performers p limit 1;
  select id into v_foreign from performers where production_id <> v_prod limit 1;
  if v_prod is null or v_foreign is null then
    raise exception 'SMOKE SETUP: need performers in at least two productions';
  end if;

  -- 1. A performer from another production raises P0002 and writes nothing.
  begin
    perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
      jsonb_build_object('performer', jsonb_build_object('id', v_foreign),
        'measurements', jsonb_build_array(jsonb_build_object('key', 'chest', 'value_numeric', 77.7, 'value_text', null)),
        'notes_append', null))));
    raise exception 'CHECK 1 FAILED: foreign performer was accepted';
  exception when sqlstate 'P0002' then null;
  end;
  select count(*) into v_count from performer_measurements
    where performer_id = v_foreign and measurement_key = 'chest' and value_numeric = 77.7;
  if v_count <> 0 then raise exception 'CHECK 1 FAILED: foreign performer was written'; end if;

  -- 2. An unknown key in form 2 rolls back form 1.
  begin
    perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
      jsonb_build_object('performer', jsonb_build_object('id', v_perf),
        'measurements', jsonb_build_array(jsonb_build_object('key', 'chest', 'value_numeric', 88.8, 'value_text', null)),
        'notes_append', null),
      jsonb_build_object('performer', jsonb_build_object('name', 'Smoke Test Person'),
        'measurements', jsonb_build_array(jsonb_build_object('key', 'no_such_key', 'value_numeric', 1, 'value_text', null)),
        'notes_append', null))));
    raise exception 'CHECK 2 FAILED: unknown key was accepted';
  exception when sqlstate 'P0002' then null;
  end;
  select count(*) into v_count from performer_measurements
    where performer_id = v_perf and measurement_key = 'chest' and value_numeric = 88.8;
  if v_count <> 0 then raise exception 'CHECK 2 FAILED: form 1 survived the rollback'; end if;
  select count(*) into v_count from performers where production_id = v_prod and label = 'Smoke Test Person';
  if v_count <> 0 then raise exception 'CHECK 2 FAILED: new performer survived the rollback'; end if;

  -- 3. A numeric upsert over a text row nulls value_text.
  perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('id', v_perf),
      'measurements', jsonb_build_array(jsonb_build_object('key', 'chest', 'value_numeric', null, 'value_text', 'smoke')),
      'notes_append', null))));
  perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('id', v_perf),
      'measurements', jsonb_build_array(jsonb_build_object('key', 'chest', 'value_numeric', 36.5, 'value_text', null)),
      'notes_append', null))));
  select value_numeric, value_text into v_num, v_txt from performer_measurements
    where performer_id = v_perf and measurement_key = 'chest';
  if v_num is distinct from 36.5 or v_txt is not null then
    raise exception 'CHECK 3 FAILED: got numeric %, text %', v_num, v_txt;
  end if;

  -- 4. Notes append onto null, empty, and existing notes.
  update performers set notes = null where id = v_perf;
  perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('id', v_perf), 'measurements', '[]'::jsonb, 'notes_append', 'alpha'))));
  select notes into v_notes from performers where id = v_perf;
  if v_notes is distinct from 'alpha' then raise exception 'CHECK 4a FAILED (null): got %', v_notes; end if;

  update performers set notes = '' where id = v_perf;
  perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('id', v_perf), 'measurements', '[]'::jsonb, 'notes_append', 'alpha'))));
  select notes into v_notes from performers where id = v_perf;
  if v_notes is distinct from 'alpha' then raise exception 'CHECK 4b FAILED (empty): got %', v_notes; end if;

  perform import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('id', v_perf), 'measurements', '[]'::jsonb, 'notes_append', 'beta'))));
  select notes into v_notes from performers where id = v_perf;
  if v_notes is distinct from E'alpha\n\nbeta' then raise exception 'CHECK 4c FAILED (existing): got %', v_notes; end if;

  -- 5. Returned counts: one new performer, two measurements, one notes block.
  v_res := import_measurement_forms(v_prod, jsonb_build_object('forms', jsonb_build_array(
    jsonb_build_object('performer', jsonb_build_object('name', 'Smoke Test Person'),
      'measurements', jsonb_build_array(
        jsonb_build_object('key', 'chest', 'value_numeric', 40, 'value_text', null),
        jsonb_build_object('key', 'shirt_size', 'value_numeric', null, 'value_text', 'M')),
      'notes_append', 'gamma'))));
  if v_res is distinct from '{"performers": 1, "measurements": 2, "notes": 1}'::jsonb then
    raise exception 'CHECK 5 FAILED: got %', v_res;
  end if;

  raise exception 'SMOKE PASSED: all 5 checks ok, everything rolled back';
end;
$$;
