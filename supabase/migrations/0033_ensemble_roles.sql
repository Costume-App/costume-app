-- Ensemble roles: a role with no primary/understudies, just performers who need costumes.
alter table roles add column if not exists is_ensemble boolean not null default false;

-- Allow the new assignment value. 0003 declared the check inline, so Postgres named it
-- castings_assignment_check.
alter table castings drop constraint if exists castings_assignment_check;
alter table castings add constraint castings_assignment_check
  check (assignment in ('primary', 'understudy', 'ensemble'));

-- Flip a role between regular and ensemble, converting its castings in one transaction.
--   -> ensemble: every casting (all casts) becomes 'ensemble'.
--   -> regular:  per cast, the earliest casting becomes 'primary', the rest 'understudy'.
-- Casting ids never change, so costume_pieces and measurements are untouched.
create or replace function set_role_ensemble(p_role_id uuid, p_is_ensemble boolean)
returns void
language plpgsql
set search_path = public
as $$
begin
  update roles set is_ensemble = p_is_ensemble
  where id = p_role_id and is_ensemble is distinct from p_is_ensemble;
  if not found then
    return;
  end if;
  if p_is_ensemble then
    update castings set assignment = 'ensemble' where role_id = p_role_id;
  else
    -- Demote everyone first so the one-primary-per-cast index never conflicts.
    update castings set assignment = 'understudy' where role_id = p_role_id;
    update castings c set assignment = 'primary'
    from (
      select distinct on (cast_id) id
      from castings
      where role_id = p_role_id
      order by cast_id, created_at, id
    ) firsts
    where c.id = firsts.id;
  end if;
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function set_role_ensemble(uuid, boolean) from public, anon, authenticated;
grant execute on function set_role_ensemble(uuid, boolean) to service_role;
