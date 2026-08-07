-- ============================================================================
-- Cadence — strict approval routing (DB-enforced) + record who assigned a task.
-- Run in the Supabase SQL editor AFTER the earlier migrations. Safe to re-run.
-- ============================================================================

-- (2) Record the assigner (who created/assigned the task).
alter table public.tasks
  add column if not exists assigned_by_user_id uuid references public.profiles(id) on delete set null;

-- (1) Enforce the approval hierarchy at the database level. Only the correct
-- reviewer may move a submitted task to 'done' (accept) or 'changes_requested'
-- (request changes):
--   * a MEMBER's task  -> the manager (lead) of that task's project
--                         (fallback: an admin, only if the project has no lead)
--   * a MANAGER's/ADMIN's own task -> an admin
-- Routing is based on the ASSIGNEE (the person who did & submitted the task),
-- never on who assigned it. Runs SECURITY DEFINER so it can read profiles/projects.
create or replace function public.enforce_review_routing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assignee_role text;
  proj_lead uuid;
begin
  if old.status = 'done_pending_acceptance'
     and new.status in ('done', 'changes_requested')
     and auth.uid() is not null then

    select role into assignee_role from public.profiles where id = old.assignee_user_id;

    if assignee_role in ('manager', 'admin') then
      -- a manager's/admin's own submission is approved by an admin
      if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only an admin can approve a manager''s submitted task';
      end if;
    else
      -- a member's submission is approved by that project's manager (lead)
      select lead_user_id into proj_lead from public.projects where id = old.project_id;
      if proj_lead is null then
        -- no manager on the project: allow an admin as a safety net
        if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
          raise exception 'This project has no manager to approve the task';
        end if;
      elsif auth.uid() is distinct from proj_lead then
        raise exception 'Only the project manager can approve this task';
      end if;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists enforce_review_routing on public.tasks;
create trigger enforce_review_routing
  before update on public.tasks
  for each row execute function public.enforce_review_routing();
