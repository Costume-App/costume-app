-- Optional free-text label per showing (e.g. "Tech rehearsal", "Opening Night").
alter table show_dates add column if not exists label text;
