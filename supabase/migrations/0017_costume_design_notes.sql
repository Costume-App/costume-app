-- Optional free-text notes per costume piece (design).
alter table costume_designs add column if not exists notes text;
