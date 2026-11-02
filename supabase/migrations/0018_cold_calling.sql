-- ============================================================================
-- Cadence — Cold Calling Activity tab.
-- The call log arrives from the team's Google Sheet through the `calls-ingest`
-- Edge Function (a Google Apps Script sends it in batches). Phone numbers,
-- emails and LinkedIn are never stored. Access follows tab_access
-- ('cold_calling', default admin + manager); nobody writes from the browser
-- except admins editing outcome categories and product keywords.
-- Run in the Supabase SQL editor AFTER 0017 (tab access). Safe to re-run.
-- ============================================================================

-- ---- Tables ----------------------------------------------------------------

-- One row per sheet row (a call, or a contact not dialled yet: call_date null).
create table if not exists public.call_log (
  id             bigint generated always as identity primary key,
  sheet_row      int,
  added_on       date,            -- "Data added on" (lead batch)
  campaign       text,
  contact_name   text,
  company        text,
  contact_key    text,            -- stable id for the contact; never the phone number itself
  call_date      date,            -- null = not dialled yet (pending)
  caller         text,
  outcome        text,
  next_follow_up date,
  notes          text,
  synced_at      timestamptz not null default now()
);
create index if not exists call_log_call_date_idx on public.call_log (call_date);

-- Outcome → category. Outcomes not listed here are flagged in the tab.
create table if not exists public.call_outcomes (
  outcome  text primary key check (btrim(outcome) <> ''),
  category text not null check (category in ('Positive', 'Follow-up', 'Negative', 'Not connected', 'Bad number'))
);
insert into public.call_outcomes (outcome, category) values
  ('Connected - Meeting Booked', 'Positive'),
  ('Connected - Interested - Send Info', 'Positive'),
  ('Connected - Call Back Later', 'Follow-up'),
  ('Connected - Not Interested', 'Negative'),
  ('Connected - Not Relevant', 'Negative'),
  ('Connected - Do Not Call', 'Negative'),
  ('No Answer', 'Not connected'),
  ('Busy', 'Not connected'),
  ('Switched Off', 'Not connected'),
  ('Voicemail Left', 'Not connected'),
  ('Gatekeeper - Reception', 'Not connected'),
  ('Wrong Number', 'Bad number'),
  ('Invalid Number', 'Bad number')
on conflict (outcome) do nothing;

-- Campaign-name keyword → product (the product is the first part of the name).
create table if not exists public.campaign_products (
  keyword text primary key check (keyword = lower(btrim(keyword)) and keyword <> ''),
  product text not null check (btrim(product) <> '')
);
insert into public.campaign_products (keyword, product) values
  ('cctv', 'CCTV'),
  ('navai', 'NavAI'),
  ('data transformation', 'Data Transformation'),
  ('quote buddy', 'Quote Buddy')
on conflict (keyword) do nothing;

-- Every send from the sheet (a "run"): start → append batches → commit.
create table if not exists public.call_sync_log (
  id               uuid primary key default gen_random_uuid(),   -- the run_id
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'receiving'
                   check (status in ('receiving', 'success', 'failed', 'rejected')),
  total_expected   int,
  rows_received    int not null default 0,
  rows             int,                                           -- rows now in call_log
  unknown_outcomes text[],
  warnings         jsonb,
  error            text
);
create index if not exists call_sync_log_started_idx on public.call_sync_log (started_at desc);

-- Rows of a run still being received. Internal: never readable by the app.
create table if not exists public.call_log_incoming (
  run_id         uuid not null references public.call_sync_log(id) on delete cascade,
  sheet_row      int,
  added_on       date,
  campaign       text,
  contact_name   text,
  company        text,
  contact_key    text,
  call_date      date,
  caller         text,
  outcome        text,
  next_follow_up date,
  notes          text
);
create index if not exists call_log_incoming_run_idx on public.call_log_incoming (run_id);

-- ---- Tab access: add the Cold Calling tab (default: admin, manager) -----------
alter table public.tab_access drop constraint if exists tab_access_tab_key_check;
alter table public.tab_access add constraint tab_access_tab_key_check
  check (tab_key in ('campaigns', 'hubspot_team_activity', 'cold_calling'));

do $$
begin
  if not exists (select 1 from public.tab_access where tab_key = 'cold_calling') then
    insert into public.tab_access (tab_key, role) values ('cold_calling', 'admin'), ('cold_calling', 'manager');
  end if;
end $$;

-- The "Who can see this tab" panel saves through this; now knows cold_calling.
create or replace function public.set_tab_access(p_tab text, p_roles text[], p_users uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_roles text[] := array(select distinct r from unnest(coalesce(p_roles, '{}')) r where r in ('manager', 'viewer', 'member'))
                    || array['admin'];
  v_users uuid[] := array(select distinct u from unnest(coalesce(p_users, '{}')) u where u is not null);
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change who can see this tab';
  end if;
  if p_tab not in ('campaigns', 'hubspot_team_activity', 'cold_calling') then
    raise exception 'Unknown tab %', p_tab;
  end if;

  delete from public.tab_access where tab_key = p_tab and role is not null and not (role = any (v_roles));
  insert into public.tab_access (tab_key, role, granted_by)
  select p_tab, r, auth.uid() from unnest(v_roles) r
  where not exists (select 1 from public.tab_access where tab_key = p_tab and role = r);

  delete from public.tab_access where tab_key = p_tab and user_id is not null and not (user_id = any (v_users));
  insert into public.tab_access (tab_key, user_id, granted_by)
  select p_tab, u, auth.uid() from unnest(v_users) u
  where exists (select 1 from public.profiles where id = u)
    and not exists (select 1 from public.tab_access where tab_key = p_tab and user_id = u);
end; $$;
grant execute on function public.set_tab_access(text, text[], uuid[]) to authenticated;

-- ---- RLS: read only with Cold Calling access; no browser writes ---------------
do $$
declare t text;
begin
  foreach t in array array['call_log', 'call_outcomes', 'campaign_products', 'call_sync_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.can_view_tab(''cold_calling''))', t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
alter table public.call_log_incoming enable row level security;
revoke all on public.call_log_incoming from anon, authenticated;

-- ---- Ingest steps (called only by the calls-ingest Edge Function) -------------

-- Start a run. More than 20 runs in the last hour is refused (and logged).
-- Runs left unfinished for over an hour are closed and their rows dropped.
create or replace function public.calls_start_run(p_total int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('calls-ingest'));

  update public.call_sync_log
  set status = 'failed', finished_at = now(), error = 'Abandoned: not committed within an hour'
  where status = 'receiving' and started_at < now() - interval '1 hour';
  delete from public.call_log_incoming i
  using public.call_sync_log l
  where l.id = i.run_id and l.status <> 'receiving';

  if (select count(*) from public.call_sync_log
      where started_at > now() - interval '1 hour' and status <> 'rejected') >= 20 then
    insert into public.call_sync_log (status, total_expected, finished_at, error)
    values ('rejected', p_total, now(), 'More than 20 runs in the last hour');
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.call_sync_log (total_expected) values (p_total) returning id into v_id;
  return jsonb_build_object('ok', true, 'run_id', v_id);
end; $$;

-- Add a batch of rows to a run that is still receiving.
create or replace function public.calls_append_rows(p_run uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.call_sync_log;
  v_n int := jsonb_array_length(p_rows);
begin
  select * into v_run from public.call_sync_log where id = p_run for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_run');
  end if;
  if v_run.status <> 'receiving' then
    return jsonb_build_object('ok', false, 'reason', 'run_closed', 'status', v_run.status);
  end if;
  if v_run.rows_received + v_n > v_run.total_expected then
    return jsonb_build_object('ok', false, 'reason', 'too_many_rows',
                              'expected', v_run.total_expected, 'received', v_run.rows_received + v_n);
  end if;

  insert into public.call_log_incoming (run_id, sheet_row, added_on, campaign, contact_name, company,
                                        contact_key, call_date, caller, outcome, next_follow_up, notes)
  select p_run, r.sheet_row, r.added_on, r.campaign, r.contact_name, r.company,
         r.contact_key, r.call_date, r.caller, r.outcome, r.next_follow_up, r.notes
  from jsonb_to_recordset(p_rows) as r(sheet_row int, added_on date, campaign text, contact_name text,
                                       company text, contact_key text, call_date date, caller text,
                                       outcome text, next_follow_up date, notes text);

  update public.call_sync_log set rows_received = rows_received + v_n where id = p_run;
  return jsonb_build_object('ok', true, 'received', v_run.rows_received + v_n);
end; $$;

-- Commit: replace call_log with this run's rows in one transaction, but only
-- if every expected row arrived. Returns the row count and unknown outcomes.
create or replace function public.calls_commit_run(p_run uuid, p_warnings jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.call_sync_log;
  v_got int;
  v_unknown text[];
begin
  perform pg_advisory_xact_lock(hashtext('calls-ingest'));
  select * into v_run from public.call_sync_log where id = p_run for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_run');
  end if;
  if v_run.status <> 'receiving' then
    return jsonb_build_object('ok', false, 'reason', 'run_closed', 'status', v_run.status);
  end if;

  select count(*) into v_got from public.call_log_incoming where run_id = p_run;
  if v_got <> v_run.total_expected then
    update public.call_sync_log
    set status = 'failed', finished_at = now(), warnings = p_warnings,
        error = format('Row count mismatch: expected %s, received %s', v_run.total_expected, v_got)
    where id = p_run;
    delete from public.call_log_incoming where run_id = p_run;
    return jsonb_build_object('ok', false, 'reason', 'count_mismatch', 'expected', v_run.total_expected, 'received', v_got);
  end if;

  delete from public.call_log where true;
  insert into public.call_log (sheet_row, added_on, campaign, contact_name, company, contact_key,
                               call_date, caller, outcome, next_follow_up, notes, synced_at)
  select sheet_row, added_on, campaign, contact_name, company, contact_key,
         call_date, caller, outcome, next_follow_up, notes, now()
  from public.call_log_incoming where run_id = p_run;
  delete from public.call_log_incoming where run_id = p_run;

  select coalesce(array_agg(distinct l.outcome order by l.outcome), '{}') into v_unknown
  from public.call_log l
  where nullif(btrim(l.outcome), '') is not null
    and not exists (select 1 from public.call_outcomes o where o.outcome = l.outcome);

  update public.call_sync_log
  set status = 'success', finished_at = now(), rows = v_got, unknown_outcomes = v_unknown, warnings = p_warnings
  where id = p_run;
  return jsonb_build_object('ok', true, 'rows', v_got, 'unknown_outcomes', to_jsonb(v_unknown));
end; $$;

revoke execute on function public.calls_start_run(int) from public, anon, authenticated;
revoke execute on function public.calls_append_rows(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.calls_commit_run(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.calls_start_run(int) to service_role;
grant execute on function public.calls_append_rows(uuid, jsonb) to service_role;
grant execute on function public.calls_commit_run(uuid, jsonb) to service_role;

-- ---- Admin Settings: outcome categories and product keywords (admins only) ----
-- p_rows: [{ "outcome": "...", "category": "Positive" }, …] — the full list.
create or replace function public.calls_save_outcomes(p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change call outcomes';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_rows) r
    where btrim(coalesce(r->>'outcome', '')) = ''
       or coalesce(r->>'category', '') not in ('Positive', 'Follow-up', 'Negative', 'Not connected', 'Bad number')
  ) then
    raise exception 'Every outcome needs a name and one of the five categories';
  end if;
  delete from public.call_outcomes
  where outcome not in (select btrim(r->>'outcome') from jsonb_array_elements(p_rows) r);
  insert into public.call_outcomes (outcome, category)
  select distinct on (btrim(r->>'outcome')) btrim(r->>'outcome'), r->>'category'
  from jsonb_array_elements(p_rows) r
  on conflict (outcome) do update set category = excluded.category;
end; $$;
grant execute on function public.calls_save_outcomes(jsonb) to authenticated;

-- p_rows: [{ "keyword": "cctv", "product": "CCTV" }, …] — the full list.
create or replace function public.calls_save_products(p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change product keywords';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_rows) r
    where btrim(coalesce(r->>'keyword', '')) = '' or btrim(coalesce(r->>'product', '')) = ''
  ) then
    raise exception 'Every keyword needs a product';
  end if;
  delete from public.campaign_products
  where keyword not in (select lower(btrim(r->>'keyword')) from jsonb_array_elements(p_rows) r);
  insert into public.campaign_products (keyword, product)
  select distinct on (lower(btrim(r->>'keyword'))) lower(btrim(r->>'keyword')), btrim(r->>'product')
  from jsonb_array_elements(p_rows) r
  on conflict (keyword) do update set product = excluded.product;
end; $$;
grant execute on function public.calls_save_products(jsonb) to authenticated;
