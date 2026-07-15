-- ============================================================================
-- Cadence — fix recurring tasks wrongly shown as "Overdue".
--
-- Root cause: when a recurring task was completed late, its next occurrence was
-- created with `due_date = old_due_date + step`, which could still be in the
-- past — so the fresh occurrence was born already overdue. The app code now
-- schedules the next occurrence forward from the later of the due date and
-- today. This migration corrects occurrences that are ALREADY mislabeled.
--
-- It rolls every still-open daily/weekly task whose due date is in the past
-- forward to its next on-cadence date (today for daily, the next weekly slot
-- for weekly), so its current occurrence is no longer in the past. Done and
-- Cancelled tasks, and non-recurring tasks, are left untouched.
--
-- Run in the Supabase SQL editor AFTER the earlier migrations. Safe to re-run.
-- ============================================================================

with adv as (
  select id,
         (case recurrence when 'weekly' then 7 else 1 end) as step
  from public.tasks
  where recurrence in ('daily', 'weekly')
    and status not in ('done', 'cancelled')
    and due_date < current_date
)
update public.tasks t
set due_date         = t.due_date + (ceil((current_date - t.due_date)::numeric / a.step) * a.step)::int,
    planned_for_date = t.due_date + (ceil((current_date - t.due_date)::numeric / a.step) * a.step)::int
from adv a
where t.id = a.id;
