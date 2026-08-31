-- ============================================================================
-- Cadence — week-wise tracking for Efforts vs Outcome.
-- A period can now be a month ('2026-08') or a week ('2026-08-W1'); the
-- granularity column distinguishes them. Weeks are the source of truth and the
-- month rolls up from its weeks (computed client-side). Existing rows are months.
-- Run in the Supabase SQL editor AFTER 0012. Safe to re-run.
-- ============================================================================

alter table public.eo_months  add column if not exists granularity text not null default 'month'
  check (granularity in ('month','week'));
alter table public.eo_entries add column if not exists granularity text not null default 'month'
  check (granularity in ('month','week'));

-- (The `month` column now holds the period key: 'YYYY-MM' for a month row or
--  'YYYY-MM-W#' for a week row. The unique keys (project_id,month) and
--  (metric_id,month) already keep month and week periods distinct.)
