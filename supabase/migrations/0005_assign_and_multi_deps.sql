-- ============================================================================
-- Cadence — open task assignment + multiple dependency people per task.
-- Run in the Supabase SQL editor AFTER the earlier migrations.
-- ============================================================================

-- (1) Any active member (anyone who isn't a read-only Viewer) may create a task
-- and assign it to ANY team member — not just themselves. CSV import assigns by
-- "Assignee Email" the same way. Viewers still cannot write anything.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (not public.is_viewer());

-- (2) A task can now depend on MANY people. Junction table task -> users.
create table if not exists public.task_dependencies (
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table public.task_dependencies enable row level security;

-- Everyone signed in can read every task's dependency people (so managers /
-- admins see the full list on any task). Only non-viewers can add / remove.
drop policy if exists task_deps_select on public.task_dependencies;
create policy task_deps_select on public.task_dependencies
  for select to authenticated using (true);
drop policy if exists task_deps_insert on public.task_dependencies;
create policy task_deps_insert on public.task_dependencies
  for insert to authenticated with check (not public.is_viewer());
drop policy if exists task_deps_delete on public.task_dependencies;
create policy task_deps_delete on public.task_dependencies
  for delete to authenticated using (not public.is_viewer());

-- Carry any existing single dependency into the new table, then drop the column.
insert into public.task_dependencies (task_id, user_id)
  select id, depends_on_user_id
  from public.tasks
  where depends_on_user_id is not null
  on conflict do nothing;

alter table public.tasks drop column if exists depends_on_user_id;
