-- Cast-list import hardening: 0034's import_cast_list ran with the default privileges of
-- whoever called it and let new performers/castings inherit whatever now() happened to be. This
-- redefines the function so that:
--   1. Only the service role (supabaseAdmin) may call it — the app never calls this directly from
--      a user session, so authenticated/anon/public should not be able to either.
--   2. New performers and castings get an explicit created_at of clock_timestamp() instead of the
--      implicit now() default. now() is frozen for the whole transaction, so every row inserted
--      by one import would otherwise share the exact same created_at and sort arbitrarily;
--      clock_timestamp() advances within the transaction, keeping rows in the payload's list
--      order for listPerformers/listCastings, which both sort by created_at. Roles and casts
--      already carry an explicit display_order, so they are untouched.
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
      insert into performers (production_id, label, created_at)
      values (p_production_id, v_item->>'name', clock_timestamp())
      returning id into v_id;
      n_performers := n_performers + 1;
    end if;
    v_performer_ids := v_performer_ids || jsonb_build_object(v_item->>'key', v_id);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'castings', '[]'::jsonb)) loop
    insert into castings (production_id, cast_id, role_id, performer_id, assignment, created_at)
    values (
      p_production_id,
      (v_cast_ids->>(v_item->>'cast'))::uuid,
      (v_role_ids->>(v_item->>'role'))::uuid,
      (v_performer_ids->>(v_item->>'performer'))::uuid,
      v_item->>'assignment',
      clock_timestamp()
    )
    on conflict (cast_id, role_id, performer_id) do nothing;
    get diagnostics v_rows = row_count;
    n_castings := n_castings + v_rows;
  end loop;

  return jsonb_build_object('casts', n_casts, 'roles', n_roles, 'performers', n_performers, 'castings', n_castings);
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function import_cast_list(uuid, jsonb) from public, anon, authenticated;
grant execute on function import_cast_list(uuid, jsonb) to service_role;
