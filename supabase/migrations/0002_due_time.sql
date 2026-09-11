alter table public.todos
  add column due_time text
    constraint todos_due_time_format
    check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint todos_due_time_needs_date
    check (due_time is null or due_date is not null);
