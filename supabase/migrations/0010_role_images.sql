-- Reference photos per role (fabric / piece ideas). Objects live in the
-- private "role-images" Storage bucket; this table tracks their paths.
create table if not exists role_images (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references roles(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists role_images_role_id_idx on role_images(role_id);
