-- ============================================================================
-- Cadence — HubSpot Team Activity tab.
-- Calls, emails, meetings, tasks and neglected deals synced from HubSpot by the
-- `hubspot-sync` Edge Function (service role). Admins and managers can read;
-- nobody writes from the browser (Admin Settings edits go through admin-only
-- functions). Only owners in hubspot_people (plus "no owner") are ever stored.
-- No email bodies, call notes, task descriptions or contact details are kept.
-- Run in the Supabase SQL editor AFTER the earlier migrations. Safe to re-run.
-- ============================================================================

-- ---- Tables ----------------------------------------------------------------

-- People allowlist: HubSpot owner IDs whose records are synced and shown.
create table if not exists public.hubspot_people (
  owner_id   text primary key check (owner_id ~ '^[0-9]+$'),
  name       text not null check (btrim(name) <> ''),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.hubspot_people (owner_id, name) values
  ('160868972', 'Amit Kumar'),
  ('166654255', 'Puneet Prajapati'),
  ('166128521', 'Rohan Bhansali'),
  ('69394151',  'Chandresh Rai'),
  ('159656026', 'Siddhartha Chatterjee')
on conflict (owner_id) do nothing;

-- Neglected-deal alert: which deal stages to watch and after how many days.
-- Single row; stages is [{ "id": "<HubSpot stage id>", "label": "<name>" }, …].
create table if not exists public.hubspot_alert_settings (
  id             smallint primary key default 1 check (id = 1),
  threshold_days int not null default 10 check (threshold_days between 1 and 365),
  stages         jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array'),
  updated_at     timestamptz not null default now()
);
insert into public.hubspot_alert_settings (id, threshold_days, stages) values (1, 10, '[
  {"id": "appointmentscheduled", "label": "Marketing Qualified Lead"},
  {"id": "1711194873",           "label": "Sales Qualified Lead"},
  {"id": "qualifiedtobuy",       "label": "Proposal"}
]'::jsonb)
on conflict (id) do nothing;

-- Calls, emails and meetings. id is HubSpot's id. owner_id null = Unassigned.
create table if not exists public.hubspot_activities (
  id              text primary key,
  type            text not null check (type in ('call', 'email', 'meeting')),
  owner_id        text,
  occurred_at     timestamptz not null,
  call_outcome    text,            -- hs_call_disposition (outcome id), calls only
  email_direction text             -- hs_email_direction, emails only
);
create index if not exists hubspot_activities_occurred_idx on public.hubspot_activities (occurred_at);

-- Tasks (no subject or body).
create table if not exists public.hubspot_tasks (
  id           text primary key,
  owner_id     text,
  task_type    text,
  status       text,               -- hs_task_status, e.g. NOT_STARTED, COMPLETED
  due_at       timestamptz,
  completed_at timestamptz
);
create index if not exists hubspot_tasks_status_idx on public.hubspot_tasks (status);
create index if not exists hubspot_tasks_completed_idx on public.hubspot_tasks (completed_at);

-- Every deal currently in an alert stage (replaced on each sync).
create table if not exists public.hubspot_watch_deals (
  id                text primary key,
  name              text,
  stage             text,
  pipeline          text,
  owner_id          text,
  last_contacted_at timestamptz
);

-- Every sync attempt. backfilled_to = last day the first backfill has covered.
create table if not exists public.hubspot_sync_log (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  triggered_by  text not null,     -- 'schedule' or the user's id
  status        text not null default 'running'
                check (status in ('running', 'success', 'partial', 'error', 'skipped')),
  error         text,
  backfilled_to date
);
create index if not exists hubspot_sync_log_started_idx on public.hubspot_sync_log (started_at desc);

-- ---- Who may read: admins and managers --------------------------------------
create or replace function public.hubspot_user_can_view(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'manager') from public.profiles where id = p_uid), false);
$$;

create or replace function public.hubspot_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.hubspot_user_can_view(auth.uid());
$$;
grant execute on function public.hubspot_can_view() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['hubspot_people', 'hubspot_alert_settings', 'hubspot_activities',
                           'hubspot_tasks', 'hubspot_watch_deals', 'hubspot_sync_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.hubspot_can_view())', t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---- Daily totals for the tab (India time), read through the caller's RLS ----
create or replace view public.hubspot_activity_daily with (security_invoker = true) as
  select (occurred_at at time zone 'Asia/Kolkata')::date as day, owner_id, type, count(*)::int as n
  from public.hubspot_activities
  group by 1, 2, 3;

create or replace view public.hubspot_tasks_done_daily with (security_invoker = true) as
  select (completed_at at time zone 'Asia/Kolkata')::date as day, owner_id, count(*)::int as n
  from public.hubspot_tasks
  where status = 'COMPLETED' and completed_at is not null
  group by 1, 2;

revoke all on public.hubspot_activity_daily, public.hubspot_tasks_done_daily from anon;
grant select on public.hubspot_activity_daily, public.hubspot_tasks_done_daily to authenticated;

-- ---- Allowlist helper ---------------------------------------------------------
-- A record may be stored only if it has no owner or its owner is an active person.
create or replace function public.hubspot_owner_allowed(p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner is null or exists (select 1 from public.hubspot_people where owner_id = p_owner and active);
$$;

-- Drop anything owned by someone not (or no longer) on the allowlist.
create or replace function public.hubspot_purge_unlisted()
returns void language sql security definer set search_path = public as $$
  delete from public.hubspot_activities  where not public.hubspot_owner_allowed(owner_id);
  delete from public.hubspot_tasks       where not public.hubspot_owner_allowed(owner_id);
  delete from public.hubspot_watch_deals where not public.hubspot_owner_allowed(owner_id);
$$;

-- ---- Writes used by the Edge Function (rows passed as a JSON array) ----------

-- Backfill: insert or update activities.
create or replace function public.hubspot_upsert_activities(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.hubspot_activities as a (id, type, owner_id, occurred_at, call_outcome, email_direction)
  select r.id, r.type, nullif(r.owner_id, ''), r.occurred_at, r.call_outcome, r.email_direction
  from jsonb_to_recordset(p_rows) as r(id text, type text, owner_id text, occurred_at timestamptz,
                                       call_outcome text, email_direction text)
  where public.hubspot_owner_allowed(nullif(r.owner_id, ''))
  on conflict (id) do update set type = excluded.type, owner_id = excluded.owner_id,
    occurred_at = excluded.occurred_at, call_outcome = excluded.call_outcome,
    email_direction = excluded.email_direction;
  get diagnostics n = row_count;
  return n;
end; $$;

-- Recent window: delete everything from p_from onwards and re-insert, in one
-- transaction, so edits and deletions in HubSpot show up.
create or replace function public.hubspot_replace_activities(p_from timestamptz, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  delete from public.hubspot_activities where occurred_at >= p_from;
  return public.hubspot_upsert_activities(p_rows);
end; $$;

-- Insert or update tasks.
create or replace function public.hubspot_upsert_tasks(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.hubspot_tasks as t (id, owner_id, task_type, status, due_at, completed_at)
  select r.id, nullif(r.owner_id, ''), r.task_type, r.status, r.due_at, r.completed_at
  from jsonb_to_recordset(p_rows) as r(id text, owner_id text, task_type text, status text,
                                       due_at timestamptz, completed_at timestamptz)
  where public.hubspot_owner_allowed(nullif(r.owner_id, ''))
  on conflict (id) do update set owner_id = excluded.owner_id, task_type = excluded.task_type,
    status = excluded.status, due_at = excluded.due_at, completed_at = excluded.completed_at;
  get diagnostics n = row_count;
  return n;
end; $$;

-- Open tasks: full refresh (removes tasks completed or deleted since last time).
create or replace function public.hubspot_replace_open_tasks(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  delete from public.hubspot_tasks where status is distinct from 'COMPLETED';
  return public.hubspot_upsert_tasks(p_rows);
end; $$;

-- Watched deals: replace the whole table.
create or replace function public.hubspot_replace_deals(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.hubspot_watch_deals where true;
  insert into public.hubspot_watch_deals (id, name, stage, pipeline, owner_id, last_contacted_at)
  select r.id, r.name, r.stage, r.pipeline, nullif(r.owner_id, ''), r.last_contacted_at
  from jsonb_to_recordset(p_rows) as r(id text, name text, stage text, pipeline text,
                                       owner_id text, last_contacted_at timestamptz)
  where public.hubspot_owner_allowed(nullif(r.owner_id, ''))
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end; $$;

-- ---- Sync bookkeeping ---------------------------------------------------------

-- Start a run unless one is running or a successful one finished in the last
-- 10 minutes. A "running" row older than 15 minutes is treated as dead.
-- first_run: no successful run yet (the backfill isn't complete). backfill_from:
-- where the backfill continues, after any earlier partial runs.
create or replace function public.hubspot_sync_begin(p_triggered_by text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_last timestamptz;
  v_resume date;
begin
  perform pg_advisory_xact_lock(hashtext('hubspot-sync'));

  update public.hubspot_sync_log
  set status = 'error', finished_at = now(), error = 'Timed out'
  where status = 'running' and started_at < now() - interval '15 minutes';

  if exists (select 1 from public.hubspot_sync_log where status = 'running') then
    insert into public.hubspot_sync_log (triggered_by, status, finished_at, error)
    values (p_triggered_by, 'skipped', now(), 'Another sync is already running');
    return jsonb_build_object('started', false, 'reason', 'running');
  end if;

  select max(finished_at) into v_last from public.hubspot_sync_log where status = 'success';
  if v_last > now() - interval '10 minutes' then
    insert into public.hubspot_sync_log (triggered_by, status, finished_at, error)
    values (p_triggered_by, 'skipped', now(), 'A sync finished less than 10 minutes ago');
    return jsonb_build_object('started', false, 'reason', 'recent', 'last_finished_at', v_last);
  end if;

  select max(backfilled_to) + 1 into v_resume from public.hubspot_sync_log where backfilled_to is not null;
  insert into public.hubspot_sync_log (triggered_by) values (p_triggered_by) returning id into v_id;
  return jsonb_build_object(
    'started', true,
    'log_id', v_id,
    'first_run', v_last is null,
    'backfill_from', coalesce(v_resume, date '2025-03-01')
  );
end; $$;

create or replace function public.hubspot_sync_progress(p_log_id bigint, p_backfilled_to date)
returns void language sql security definer set search_path = public as $$
  update public.hubspot_sync_log set backfilled_to = p_backfilled_to where id = p_log_id;
$$;

create or replace function public.hubspot_sync_finish(p_log_id bigint, p_status text, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update public.hubspot_sync_log
  set status = p_status, finished_at = now(), error = p_error
  where id = p_log_id;
$$;

-- Token the daily pg_cron job sends so the function knows the call is the
-- schedule. Generated once and kept in Supabase Vault; nobody needs to copy it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hubspot_sync_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'hubspot_sync_cron_token',
      'Sent by the hubspot-sync pg_cron job'
    );
  end if;
end $$;

create or replace function public.hubspot_check_cron_token(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'hubspot_sync_cron_token' and decrypted_secret = p_token
  );
$$;

-- ---- Admin Settings (admin only) ---------------------------------------------

-- p_stages: [{ "id": "...", "label": "..." }, …]
create or replace function public.hubspot_save_alert_settings(p_threshold int, p_stages jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change HubSpot settings';
  end if;
  if jsonb_typeof(p_stages) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_stages) s
    where btrim(coalesce(s->>'id', '')) = '' or btrim(coalesce(s->>'label', '')) = ''
  ) then
    raise exception 'Every stage needs a stage ID and a name';
  end if;
  update public.hubspot_alert_settings
  set threshold_days = p_threshold,
      stages = (select coalesce(jsonb_agg(jsonb_build_object('id', btrim(s->>'id'), 'label', btrim(s->>'label'))), '[]'::jsonb)
                from jsonb_array_elements(p_stages) s),
      updated_at = now()
  where id = 1;
end; $$;
grant execute on function public.hubspot_save_alert_settings(int, jsonb) to authenticated;

-- p_people: the full allowlist, [{ "owner_id": "...", "name": "...", "active": true }, …].
-- People left out are removed, and their records are deleted straight away.
create or replace function public.hubspot_save_people(p_people jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change HubSpot settings';
  end if;
  if jsonb_typeof(p_people) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_people) p
    where coalesce(p->>'owner_id', '') !~ '^[0-9]+$' or btrim(coalesce(p->>'name', '')) = ''
  ) then
    raise exception 'Every person needs a numeric HubSpot owner ID and a name';
  end if;
  delete from public.hubspot_people
  where owner_id not in (select p->>'owner_id' from jsonb_array_elements(p_people) p);
  insert into public.hubspot_people (owner_id, name, active)
  select p->>'owner_id', btrim(p->>'name'), coalesce((p->>'active')::boolean, true)
  from jsonb_array_elements(p_people) p
  on conflict (owner_id) do update set name = excluded.name, active = excluded.active;
  perform public.hubspot_purge_unlisted();
end; $$;
grant execute on function public.hubspot_save_people(jsonb) to authenticated;

-- Server-only functions: callable by the Edge Function's service role, not the browser.
do $$
declare f text;
begin
  foreach f in array array[
    'hubspot_user_can_view(uuid)', 'hubspot_owner_allowed(text)', 'hubspot_purge_unlisted()',
    'hubspot_upsert_activities(jsonb)', 'hubspot_replace_activities(timestamptz, jsonb)',
    'hubspot_upsert_tasks(jsonb)', 'hubspot_replace_open_tasks(jsonb)', 'hubspot_replace_deals(jsonb)',
    'hubspot_sync_begin(text)', 'hubspot_sync_progress(bigint, date)',
    'hubspot_sync_finish(bigint, text, text)', 'hubspot_check_cron_token(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
