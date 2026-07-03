-- ============================================================================
-- Cadence — batch of changes (task dependencies, admin-only task delete,
-- strictly read-only Viewer role). Run in the Supabase SQL editor AFTER the
-- earlier migrations.
-- ============================================================================

-- (3) Task dependencies: a task may optionally depend on one other task.
alter table public.tasks
  add column if not exists depends_on_task_id uuid references public.tasks(id) on delete set null;

-- (1) Deleting a task is admin-only (was manager+admin).
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (coalesce(public.my_role(), '') = 'admin');

-- (7) Viewer = strictly read-only everywhere. Most write policies already
-- exclude viewers; these three had gaps (a viewer could edit their own
-- profile, submit standups, or update a KR they happened to own). Close them.

-- profiles: a viewer cannot edit even their own row.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (not public.is_viewer() and (id = auth.uid() or public.is_manager()))
  with check (not public.is_viewer() and (id = auth.uid() or public.is_manager()));

-- standup entries: no viewer writes at all.
drop policy if exists standups_insert on public.standup_entries;
create policy standups_insert on public.standup_entries for insert to authenticated
  with check (not public.is_viewer() and user_id = auth.uid());
drop policy if exists standups_update on public.standup_entries;
create policy standups_update on public.standup_entries for update to authenticated
  using (not public.is_viewer() and (user_id = auth.uid() or public.is_manager()))
  with check (not public.is_viewer() and (user_id = auth.uid() or public.is_manager()));
drop policy if exists standups_delete on public.standup_entries;
create policy standups_delete on public.standup_entries for delete to authenticated
  using (not public.is_viewer() and (user_id = auth.uid() or public.is_manager()));

-- key results: a viewer who owns a KR still cannot write to it.
drop policy if exists kr_update on public.key_results;
create policy kr_update on public.key_results for update to authenticated
  using (not public.is_viewer() and (public.is_manager() or owner_user_id = auth.uid()))
  with check (not public.is_viewer() and (public.is_manager() or owner_user_id = auth.uid()));

-- Note: projects/objectives writes already require is_manager() (false for a
-- viewer); tasks, blockers, weekly_priorities and audit inserts already carry
-- `not is_viewer()`. Combined with the above, the Viewer role can read every
-- table but write to none.
