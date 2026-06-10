-- Reference photos per costume piece (the "design"). Objects live in the shared
-- private "role-images" Storage bucket (under a designs/ path prefix); this table
-- tracks their paths. Mirrors role_images (0010).
create table if not exists costume_design_images (
  id                uuid primary key default gen_random_uuid(),
  costume_design_id uuid not null references costume_designs(id) on delete cascade,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);
create index if not exists costume_design_images_design_id_idx on costume_design_images(costume_design_id);
