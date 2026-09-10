create table public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid references public.todos(id) on delete set null,
  title       text not null default '',
  description text not null default '',
  due_date    date,
  color       text not null default 'slate'
              check (color in ('slate','red','orange','yellow','green','teal','blue','purple')),
  completed   boolean not null default false,
  sort_order  double precision not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint todos_no_self_parent check (parent_id is distinct from id)
);

create index todos_user_id_idx      on public.todos (user_id);
create index todos_parent_id_idx    on public.todos (parent_id);
create index todos_user_updated_idx on public.todos (user_id, updated_at);

create or replace function public.todos_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;
  if new.updated_at is null or new.updated_at <= old.updated_at then
    return null;
  end if;
  return new;
end $$;

create trigger todos_before_write
  before insert or update on public.todos
  for each row execute function public.todos_before_write();

alter table public.todos enable row level security;

create policy "todos select own" on public.todos for select
  using ((select auth.uid()) = user_id);
create policy "todos insert own" on public.todos for insert
  with check ((select auth.uid()) = user_id);
create policy "todos update own" on public.todos for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "todos delete own" on public.todos for delete
  using ((select auth.uid()) = user_id);

alter table public.todos replica identity full;
alter publication supabase_realtime add table public.todos;
