-- ============================================================================
-- Cadence — "Efforts vs Outcome" tracker (per channel = per project).
-- Matches the Marketing_Effort_Outcome_Tracker.xlsx template. Run in the
-- Supabase SQL editor AFTER the earlier migrations. Safe to re-run.
-- A channel is a Cadence project; scoping mirrors how managers are scoped to the
-- project(s) they lead.
-- ============================================================================

-- Metric rows (config): the fixed left columns Metric | Unit | Direction | Carry?
create table if not exists public.eo_metrics (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section    text not null check (section in ('effort','outcome')),
  name       text not null,
  unit       text not null default '',
  direction  text not null default 'higher' check (direction in ('higher','lower')),
  carry      boolean not null default true,          -- Carry? Yes/No
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists eo_metrics_project_idx on public.eo_metrics (project_id);

-- Month columns for a channel (e.g. '2026-08'). Explicit so "Add month" works.
create table if not exists public.eo_months (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month      text not null,                           -- 'YYYY-MM'
  created_at timestamptz not null default now(),
  unique (project_id, month)
);

-- The user-entered cells for a metric in a month. carried_in is only meaningful
-- (and editable) for the channel's FIRST month; later months derive it from the
-- previous month's To Carry, computed client-side (never stored/overwritten).
create table if not exists public.eo_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  metric_id   uuid not null references public.eo_metrics(id) on delete cascade,
  month       text not null,                          -- 'YYYY-MM'
  base_target numeric,
  achieved    numeric,
  carried_in  numeric,                                -- opening backlog (first month only)
  created_at  timestamptz not null default now(),
  unique (metric_id, month)
);
create index if not exists eo_entries_project_idx on public.eo_entries (project_id);

-- ---- RLS: admin + viewer see all channels; a manager sees only the project(s)
--          they lead; only admin or the project's manager can edit. ------------
alter table public.eo_metrics enable row level security;
alter table public.eo_months  enable row level security;
alter table public.eo_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['eo_metrics','eo_months','eo_entries'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format($f$create policy %I_select on public.%I for select to authenticated
      using (public.my_role() in ('admin','viewer') or public.manages_project(project_id))$f$, t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all to authenticated
      using (not public.is_viewer() and (public.my_role() = 'admin' or public.manages_project(project_id)))
      with check (not public.is_viewer() and (public.my_role() = 'admin' or public.manages_project(project_id)))$f$, t, t);
  end loop;
end $$;
