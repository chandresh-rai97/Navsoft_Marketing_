-- ============================================================================
-- Cadence — "Depends on" is now a PERSON, not a task.
-- Run in the Supabase SQL editor AFTER the earlier migrations.
-- ============================================================================

-- A task may optionally depend on a team member (e.g. Manav's task depends on
-- Rohan because he needs something from Rohan first).
alter table public.tasks
  add column if not exists depends_on_user_id uuid references public.profiles(id) on delete set null;

-- Remove the old task-to-task dependency column.
alter table public.tasks
  drop column if exists depends_on_task_id;

-- Reassert that deleting a task (single or bulk) is admin-only at the database
-- level. Bulk delete just issues several deletes, each checked by this policy.
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (coalesce(public.my_role(), '') = 'admin');
