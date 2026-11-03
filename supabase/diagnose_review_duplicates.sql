-- ============================================================================
-- Cadence — diagnose & clean up the "accepted task keeps asking to be
-- re-submitted" review loop.
--
-- This is NOT a schema migration (no DDL, no new columns). It is a one-off
-- diagnostic + optional cleanup you run by hand in the Supabase SQL editor.
-- The code fix (guarding the recurrence spawn so an accepted/completed task
-- can't create a second open occurrence) ships in src/context/AppData.jsx and
-- needs no SQL. Run the SELECTs below first to see what's in your data; only
-- run the clearly-marked CLEANUP blocks after reviewing their output.
--
-- Why the loop happens: accepting a recurring review task spawned a brand-new
-- "not_started" occurrence with the SAME title/assignee. That fresh row shows
-- the submitter a "Submit" button again, so submit -> accept -> spawn loops and
-- duplicate open rows pile up. The admin sees the one they accepted as Done;
-- the submitter is looking at the spawned duplicate. Both are correct about
-- their own row — there are simply two rows.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A) Does a recurring series have more than one OPEN occurrence? (loop source)
--    Expect 0 rows on a healthy system. Any row here is a pile-up to clean.
-- ---------------------------------------------------------------------------
select lower(btrim(title)) as title_key,
       assignee_user_id,
       project_id,
       recurrence,
       count(*)                                   as open_occurrences,
       array_agg(id     order by due_date, created_at) as task_ids,
       array_agg(status order by due_date, created_at) as statuses
from public.tasks
where recurrence <> 'none'
  and status not in ('done', 'cancelled')
group by 1, 2, 3, 4
having count(*) > 1
order by open_occurrences desc;


-- ---------------------------------------------------------------------------
-- B) Any task that exists as more than one row with the same
--    (title, assignee, project). "done_copies" + "open_copies" together show
--    the classic loop fingerprint: a Done copy sitting next to a still-open
--    copy that keeps showing "Submit".
-- ---------------------------------------------------------------------------
select lower(btrim(t.title)) as title_key,
       t.assignee_user_id,
       p.name                                     as project,
       count(*)                                   as copies,
       count(*) filter (where t.status = 'done')                        as done_copies,
       count(*) filter (where t.status = 'done_pending_acceptance')     as awaiting_copies,
       count(*) filter (where t.status not in ('done', 'cancelled'))    as open_copies,
       array_agg(t.id     order by t.created_at)  as task_ids,
       array_agg(t.status order by t.created_at)  as statuses
from public.tasks t
left join public.projects p on p.id = t.project_id
group by 1, 2, 3
having count(*) > 1
order by copies desc
limit 200;


-- ---------------------------------------------------------------------------
-- C) Inspect one specific task across its copies (replace the ILIKE text with
--    part of the looping task's title). Shows the full status of each row.
-- ---------------------------------------------------------------------------
select id, title, status, assignee_user_id, project_id, recurrence,
       submitted_at, completed_at, accepted_by_user_id, due_date, created_at
from public.tasks
where title ilike '%PASTE PART OF THE TITLE HERE%'
order by created_at;


-- ===========================================================================
-- CLEANUP — OPTIONAL and DESTRUCTIVE. Review A/B/C first. Each block is wrapped
-- in a transaction: inspect the RETURNING output, then COMMIT to keep it or
-- ROLLBACK to undo. Rows are set to 'cancelled' (not deleted), so nothing is
-- lost and the audit trail stays intact.
-- ===========================================================================

-- CLEANUP 1 — NON-recurring ghosts: for any task already marked Done, cancel
-- the other still-open copies of the same (title, assignee, project). These are
-- the leftover "to submit" rows behind the loop for one-off tasks.
--
-- begin;
--   with done_keys as (
--     select distinct lower(btrim(title)) as k, assignee_user_id, project_id
--     from public.tasks
--     where status = 'done'
--   )
--   update public.tasks t
--      set status = 'cancelled',
--          cancelled_reason = 'Duplicate of an already-accepted task (review-loop cleanup)'
--     from done_keys d
--    where lower(btrim(t.title)) = d.k
--      and t.assignee_user_id is not distinct from d.assignee_user_id
--      and t.project_id        is not distinct from d.project_id
--      and t.recurrence = 'none'                      -- leave recurring series to CLEANUP 2
--      and t.status not in ('done', 'cancelled')
--   returning t.id, t.title, t.status;
--   -- COMMIT; if the returned rows are correct, else ROLLBACK;
-- commit;

-- CLEANUP 2 — RECURRING series with several open occurrences: keep the single
-- earliest open occurrence per series and cancel the rest (matches the new app
-- rule of at most one open occurrence per recurring series).
--
-- begin;
--   with ranked as (
--     select id,
--            row_number() over (
--              partition by lower(btrim(title)), assignee_user_id, project_id, recurrence
--              order by due_date, created_at
--            ) as rn
--     from public.tasks
--     where recurrence <> 'none'
--       and status not in ('done', 'cancelled')
--   )
--   update public.tasks t
--      set status = 'cancelled',
--          cancelled_reason = 'Duplicate open occurrence (recurring review-loop cleanup)'
--     from ranked r
--    where t.id = r.id
--      and r.rn > 1
--   returning t.id, t.title, t.due_date;
--   -- COMMIT; if correct, else ROLLBACK;
-- commit;
