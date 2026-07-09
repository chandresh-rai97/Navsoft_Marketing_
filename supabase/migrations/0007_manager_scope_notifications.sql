-- ============================================================================
-- Cadence — (A) scope managers to their own project(s) at the database level,
-- and (B) required change-request comments + history + in-app notifications.
-- Run in the Supabase SQL editor AFTER the earlier migrations.
-- ============================================================================

-- ---- helper functions (SECURITY DEFINER → bypass RLS, no recursion) ---------
create or replace function public.manages_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = pid and p.lead_user_id = auth.uid());
$$;

create or replace function public.is_task_collaborator(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_collaborators tc where tc.task_id = tid and tc.user_id = auth.uid());
$$;

grant execute on function public.manages_project(uuid)     to authenticated;
grant execute on function public.is_task_collaborator(uuid) to authenticated;

-- ---- (A) role-scoped visibility on tasks ------------------------------------
-- The role we are actually restricting is MANAGER: a manager sees ONLY tasks in
-- the project(s) they manage, tasks assigned to them, or a task they've been
-- added to as a collaborator. Admin, Viewer and Member keep full read (Members'
-- own views already filter to their tasks, so their experience is unchanged).
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (
  public.my_role() in ('admin', 'viewer', 'member')
  or assignee_user_id = auth.uid()
  or public.manages_project(project_id)
  or public.is_task_collaborator(id)
);

-- Insert: admins & members anywhere (members may assign to anyone); managers
-- only into a project they manage (or a task for themselves). Viewers never.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (
  not public.is_viewer() and (
    public.my_role() in ('admin', 'member')
    or public.manages_project(project_id)
    or assignee_user_id = auth.uid()
  )
);

-- Update: admin anywhere; the assignee; the project's manager; a collaborator;
-- or the task's KR owner (legacy acceptance). Viewers never.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    not public.is_viewer() and (
      public.my_role() = 'admin'
      or assignee_user_id = auth.uid()
      or public.manages_project(project_id)
      or public.is_task_collaborator(id)
      or exists (select 1 from public.key_results k where k.id = tasks.key_result_id and k.owner_user_id = auth.uid())
    )
  )
  with check (not public.is_viewer());

-- ---- (B) review history + notifications -------------------------------------
alter table public.tasks add column if not exists review_history jsonb not null default '[]'::jsonb;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'info',
  task_id    uuid references public.tasks(id) on delete cascade,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read);

alter table public.notifications enable row level security;

-- You only ever see / change your OWN notifications. Any signed-in non-viewer
-- may create one (e.g. a reviewer notifying the member whose task they bounced).
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated with check (not public.is_viewer());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Push new notifications to the browser in real time (best-effort).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;
