-- ============================================================================
-- Cadence — fix Efforts vs Outcome periods imported with the wrong year.
-- The CSV importer parsed "Aug 2026" via new Date(), whose non-ISO parsing is
-- engine-dependent; in some browsers it read the year as 2001. This remaps any
-- eo period stored under year 2001 back to 2026 (month and week preserved), e.g.
-- '2001-08' -> '2026-08' and '2001-08-W1' -> '2026-08-W1'.
-- Run in the Supabase SQL editor AFTER 0013. Safe to re-run.
-- ============================================================================

-- Drop any 2001 rows that would collide with an existing (correct) 2026 row,
-- so the remap can't violate the unique keys, then remap the rest.
delete from public.eo_entries e
 where e.month like '2001-%'
   and exists (
     select 1 from public.eo_entries e2
     where e2.metric_id = e.metric_id
       and e2.month = '2026' || substring(e.month from 5)
   );
update public.eo_entries set month = '2026' || substring(month from 5) where month like '2001-%';

delete from public.eo_months m
 where m.month like '2001-%'
   and exists (
     select 1 from public.eo_months m2
     where m2.project_id = m.project_id
       and m2.month = '2026' || substring(m.month from 5)
   );
update public.eo_months set month = '2026' || substring(month from 5) where month like '2001-%';

-- Report what remains (should show 2026 periods, no 2001).
select 'eo_months' as tbl, month from public.eo_months where month like '20%' order by month
union all
select 'eo_entries', month from public.eo_entries where month like '20%' order by month;
