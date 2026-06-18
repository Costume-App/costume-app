-- User-submitted feedback. Source of truth (the API also best-effort emails support).
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  user_id text not null,
  user_email text,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);
