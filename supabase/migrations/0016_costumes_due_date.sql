-- Explicit "costumes due" deadline per production (director-set). Null = unset.
alter table productions add column if not exists costumes_due_date date;
