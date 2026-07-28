-- Support for operator-run organization deletion (see
-- docs/runbooks/delete-organization.md).

-- Proof that a deletion request was honored. Deliberately holds no organization
-- content and no foreign key — by definition the organizations row is gone by the
-- time this is written. This is the record that demonstrates the 30-day
-- commitment in /privacy was met.
create table if not exists deletion_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null,
  org_name      text,
  requested_at  timestamptz not null,
  completed_at  timestamptz not null default now(),
  requested_by  text,
  notes         text
);

-- Feedback is anonymized rather than deleted when its organization is removed, so
-- these two columns must be nullable. Nothing reads the table (the only query is
-- an insert in src/lib/data/feedback.ts), so this is safe.
alter table feedback alter column org_id drop not null;
alter table feedback alter column user_id drop not null;
