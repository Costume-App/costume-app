-- Manual active/inactive flag. Existing productions stay active.
alter table productions add column is_active boolean not null default true;
