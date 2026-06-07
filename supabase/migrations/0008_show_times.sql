-- Optional time-of-day per showing (matinee + evening = two rows, same date).
alter table show_dates add column show_time time;
