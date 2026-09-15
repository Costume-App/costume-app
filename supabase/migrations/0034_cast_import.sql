-- Cast-list import: create casts, roles, performers and castings from one reviewed import in a
-- single transaction. The payload is built server-side (src/lib/data/cast-import.ts) after
-- validation; keys are references that tie castings to the casts/roles/performers in the payload.
--
-- p_payload:
--   casts:      [{ key, id } | { key, name, color }]
--   roles:      [{ key, id } | { key, name, is_ensemble }]
--   performers: [{ key, id } | { key, name }]
--   castings:   [{ cast, role, performer, assignment }]   -- cast/role/performer are keys
--
-- Existing ids must belong to p_production_id (P0002 otherwise). Castings that already exist are
-- skipped. A second primary for a cast+role violates castings_one_primary_per_cast_role (23505)
-- and rolls everything back. Returns the number of rows actually created.
create or replace function import_cast_list(p_production_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_order int;
  v_rows int;
  v_cast_ids jsonb := '{}'::jsonb;
  v_role_ids jsonb := '{}'::jsonb;
  v_performer_ids jsonb := '{}'::jsonb;
  n_casts int := 0;
  n_roles int := 0;
  n_performers int := 0;
  n_castings int := 0;
begin
  select coalesce(max(display_order), -1) + 1 into v_order from casts where production_id = p_production_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'casts', '[]'::jsonb)) loop
    v_id := null;
    if v_item ? 'id' then
      select id into v_id from casts where id = (v_item->>'id')::uuid and production_id = p_production_id;
      if v_id is null then
        raise exception 'Cast % is not in this production', v_item->>'id' using errcode = 'P0002';
      end if;
    else
      insert into casts (production_id, name, color, is_default, display_order)
      values (p_production_id, v_item->>'name', v_item->>'color', false, v_order)
      returning id into v_id;
      v_order := v_order + 1;
      n_casts := n_casts + 1;
    end if;
    v_cast_ids := v_cast_ids || jsonb_build_object(v_item->>'key', v_id);
  end loop;

  select coalesce(max(display_order), -1) + 1 into v_order from roles where production_id = p_production_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'roles', '[]'::jsonb)) loop
    v_id := null;
    if v_item ? 'id' then
      select id into v_id from roles where id = (v_item->>'id')::uuid and production_id = p_production_id;
      if v_id is null then
        raise exception 'Role % is not in this production', v_item->>'id' using errcode = 'P0002';
      end if;
    else
      insert into roles (production_id, name, is_ensemble, display_order)
      values (p_production_id, v_item->>'name', (v_item->>'is_ensemble')::boolean, v_order)
      returning id into v_id;
      v_order := v_order + 1;
      n_roles := n_roles + 1;
    end if;
    v_role_ids := v_role_ids || jsonb_build_object(v_item->>'key', v_id);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'performers', '[]'::jsonb)) loop
    v_id := null;
    if v_item ? 'id' then
      select id into v_id from performers where id = (v_item->>'id')::uuid and production_id = p_production_id;
      if v_id is null then
        raise exception 'Performer % is not in this production', v_item->>'id' using errcode = 'P0002';
      end if;
    else
      insert into performers (production_id, label)
      values (p_production_id, v_item->>'name')
      returning id into v_id;
      n_performers := n_performers + 1;
    end if;
    v_performer_ids := v_performer_ids || jsonb_build_object(v_item->>'key', v_id);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'castings', '[]'::jsonb)) loop
    insert into castings (production_id, cast_id, role_id, performer_id, assignment)
    values (
      p_production_id,
      (v_cast_ids->>(v_item->>'cast'))::uuid,
      (v_role_ids->>(v_item->>'role'))::uuid,
      (v_performer_ids->>(v_item->>'performer'))::uuid,
      v_item->>'assignment'
    )
    on conflict (cast_id, role_id, performer_id) do nothing;
    get diagnostics v_rows = row_count;
    n_castings := n_castings + v_rows;
  end loop;

  return jsonb_build_object('casts', n_casts, 'roles', n_roles, 'performers', n_performers, 'castings', n_castings);
end;
$$;
