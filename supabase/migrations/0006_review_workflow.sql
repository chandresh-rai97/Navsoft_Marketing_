-- ============================================================================
-- Cadence — task submit/approve workflow + project membership & collaboration.
-- Run in the Supabase SQL editor AFTER the earlier migrations.
-- IMPORTANT: existing tasks are marked "legacy" so their behaviour is untouched;
-- only tasks created from now on use the new submit-and-approve flow.
-- ============================================================================

-- ---- new task columns --------------------------------------------------------
alter table public.tasks add column if not exists proof_link  text;      -- evidence link on submit
alter table public.tasks add column if not exists resubmit_by  date;     -- "Resubmit by" when changes requested
alter table public.tasks add column if not exists review_note  text;     -- optional reviewer note
alter table public.tasks add column if not exists uses_review  boolean not null default true;

-- Mark every task that already exists as legacy (old behaviour, members may
-- still complete them directly). New rows default to uses_review = true.
update public.tasks set uses_review = false;

-- ---- add the "changes_requested" status --------------------------------------
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('not_started','in_progress','blocked','done_pending_acceptance',
                    'done','carried_forward','cancelled','changes_requested'));

-- ---- (1) project members (a project's manager can add users to it) -----------
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;

-- ---- (8) temporary task collaborators (a manager onto one task) --------------
create table if not exists public.task_collaborators (
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
alter table public.task_collaborators enable row level security;

-- ---- (6/7) enforce: members cannot mark a review-flow task Done --------------
create or replace function public.enforce_task_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.uses_review
     and new.status = 'done'
     and old.status is distinct from 'done'
     and auth.uid() is not null
     and not public.is_manager() then
    raise exception 'Only a manager or admin can mark a task done (members submit for review)';
  end if;
  return new;
end; $$;

drop trigger if exists enforce_task_review on public.tasks;
create trigger enforce_task_review
  before update on public.tasks
  for each row execute function public.enforce_task_review();

-- ---- (8) a task's collaborators are auto-revoked once it is Done --------------
create or replace function public.revoke_collaborators_on_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    delete from public.task_collaborators where task_id = new.id;
  end if;
  return new;
end; $$;

drop trigger if exists revoke_collaborators_on_done on public.tasks;
create trigger revoke_collaborators_on_done
  after update on public.tasks
  for each row execute function public.revoke_collaborators_on_done();

-- ---- RLS for the new tables --------------------------------------------------
-- project_members: everyone signed in can read; the project's manager (lead) or
-- an admin can add/remove members.
drop policy if exists pm_select on public.project_members;
create policy pm_select on public.project_members for select to authenticated using (true);
drop policy if exists pm_write on public.project_members;
create policy pm_write on public.project_members for all to authenticated
  using (
    public.my_role() = 'admin'
    or exists (select 1 from public.projects p where p.id = project_id and p.lead_user_id = auth.uid())
  )
  with check (
    public.my_role() = 'admin'
    or exists (select 1 from public.projects p where p.id = project_id and p.lead_user_id = auth.uid())
  );

-- task_collaborators: everyone signed in can read (so the collaboration is
-- visible); the task's project manager (lead) or an admin can add/remove.
drop policy if exists tc_select on public.task_collaborators;
create policy tc_select on public.task_collaborators for select to authenticated using (true);
drop policy if exists tc_write on public.task_collaborators;
create policy tc_write on public.task_collaborators for all to authenticated
  using (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.tasks t join public.projects p on p.id = t.project_id
      where t.id = task_id and p.lead_user_id = auth.uid()
    )
  )
  with check (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.tasks t join public.projects p on p.id = t.project_id
      where t.id = task_id and p.lead_user_id = auth.uid()
    )
  );

-- ---- (5) new project "SEO/Website" ------------------------------------------
insert into public.projects (name, description, status, color)
select 'SEO/Website', 'Website & SEO workstream', 'active', '#2f6db3'
where not exists (select 1 from public.projects where lower(name) = lower('SEO/Website'));
