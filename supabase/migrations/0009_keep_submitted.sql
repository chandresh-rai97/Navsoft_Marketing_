-- ============================================================================
-- Cadence — stop the daily carry-forward sweep from reverting submitted tasks.
-- Run in the Supabase SQL editor AFTER the earlier migrations. Safe to re-run.
--
-- Bug: carry_forward_sweep excluded only ('done','cancelled'), so a task with
-- status 'done_pending_acceptance' (submitted for review) was swept back to
-- 'carried_forward' once a day — reverting the member's submission.
-- ============================================================================

-- 1) Redefine the sweep so it never touches review-workflow statuses. A
--    submitted task ('done_pending_acceptance') is the member's finished work
--    waiting on a reviewer; 'changes_requested' carries its own resubmit_by
--    deadline. Neither should be rolled forward or restatused.
create or replace function public.carry_forward_sweep(p_today date default current_date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.app_meta where id = 1 and last_sweep = p_today) then
    return;
  end if;

  update public.tasks
     set planned_for_date    = p_today,
         status              = 'carried_forward',
         carry_forward_count = coalesce(carry_forward_count,0) + 1,
         carry_forward_history = coalesce(carry_forward_history,'[]'::jsonb) || to_jsonb(p_today::text)
   where status not in ('done','cancelled','done_pending_acceptance','changes_requested')
     and planned_for_date is not null
     and planned_for_date < p_today;

  insert into public.app_meta (id, last_sweep) values (1, p_today)
    on conflict (id) do update set last_sweep = excluded.last_sweep;
end; $$;

-- 2) Record when a task entered review, so reviewers can see how long it has
--    been waiting.
alter table public.tasks add column if not exists submitted_at timestamptz;

-- 3) Repair tasks that were ALREADY wrongly swept out of review. proof_link is
--    only ever set when a task is submitted, so a 'carried_forward' row with a
--    proof link was swept out of review; restore it (to changes_requested if it
--    carries a resubmit_by, otherwise back to awaiting acceptance).
update public.tasks
   set status = case when resubmit_by is not null then 'changes_requested'
                     else 'done_pending_acceptance' end
 where status = 'carried_forward'
   and proof_link is not null;

-- 4) Give the "waiting for review" clock a floor for anything currently awaiting
--    acceptance without a submit timestamp (pre-existing + restored rows).
update public.tasks
   set submitted_at = now()
 where status = 'done_pending_acceptance'
   and submitted_at is null;
