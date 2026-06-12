-- Optionally link a maker to a Clerk user (org member). Nullable so free-add
-- makers keep working; partial unique index = at most one maker per user per org.
alter table makers add column clerk_user_id text;

create unique index makers_org_user_unique
  on makers (org_id, clerk_user_id)
  where clerk_user_id is not null;
