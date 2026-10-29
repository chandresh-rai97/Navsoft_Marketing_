-- ============================================================================
-- Cadence — Instantly.ai campaign analytics ("Campaigns" tab).
-- Data is written only by the `instantly-sync` Edge Function (service role);
-- the browser can read it but never write it. Run in the Supabase SQL editor
-- AFTER the earlier migrations. Safe to re-run.
-- ============================================================================

-- ---- Tables ----------------------------------------------------------------

-- One row per Instantly campaign. id is Instantly's own campaign id. Rows are
-- never deleted: a campaign that disappears from Instantly is flagged instead.
create table if not exists public.instantly_campaigns (
  id                   uuid primary key,
  name                 text not null,
  region               text not null default 'Unassigned',
  status               text,
  created_at           timestamptz,                    -- created in Instantly
  deleted_in_instantly boolean not null default false,
  last_seen_at         timestamptz
);

-- Instantly's daily campaign analytics, one row per campaign per day.
create table if not exists public.instantly_daily_stats (
  campaign_id   uuid not null references public.instantly_campaigns(id),
  date          date not null,
  sent          int not null default 0,
  new_leads     int not null default 0,
  unique_opens  int not null default 0,
  unique_clicks int not null default 0,
  replies       int not null default 0,
  auto_replies  int not null default 0,
  bounced       int not null default 0,
  opportunities int not null default 0,
  primary key (campaign_id, date)
);
create index if not exists instantly_daily_stats_date_idx on public.instantly_daily_stats (date);

-- Campaign-name tag → region. Tags are stored lower-case and matched
-- case-insensitively against the (bracketed) tags in campaign names.
create table if not exists public.region_aliases (
  tag        text primary key check (tag = lower(btrim(tag)) and tag <> ''),
  region     text not null check (btrim(region) <> ''),
  created_at timestamptz not null default now()
);

insert into public.region_aliases (tag, region) values
  ('india', 'India'), ('ind', 'India'), ('chennai', 'India'), ('mumbai', 'India'),
  ('sea', 'SEA'),
  ('europe', 'Europe'), ('eu', 'Europe'), ('uk', 'Europe'),
  ('us', 'US'), ('usa', 'US'),
  ('me', 'Middle East'), ('mena', 'Middle East'), ('middle east', 'Middle East'),
  ('uae', 'Middle East'), ('ksa', 'Middle East'), ('saudi', 'Middle East'),
  ('dubai', 'Middle East'), ('qatar', 'Middle East'), ('gcc', 'Middle East')
on conflict (tag) do nothing;

-- Every sync attempt, including ones skipped because another just ran.
create table if not exists public.instantly_sync_log (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  triggered_by text not null,                          -- 'schedule' or the user's id
  status       text not null default 'running'
               check (status in ('running', 'success', 'error', 'skipped')),
  error        text
);
create index if not exists instantly_sync_log_started_idx on public.instantly_sync_log (started_at desc);

-- ---- Who may see the Campaigns data ----------------------------------------
-- Admins, viewers, and the lead of the "Email Marketing" project.
create or replace function public.instantly_user_can_view(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'viewer') from public.profiles where id = p_uid), false)
      or exists (
        select 1 from public.projects p
        where lower(btrim(p.name)) = 'email marketing' and p.lead_user_id = p_uid
      );
$$;

-- The signed-in user's own check (used by RLS and the app).
create or replace function public.instantly_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.instantly_user_can_view(auth.uid());
$$;
grant execute on function public.instantly_can_view() to authenticated;

-- ---- RLS: read for admin / viewer / Email Marketing lead; no browser writes --
do $$
declare t text;
begin
  foreach t in array array['instantly_campaigns', 'instantly_daily_stats', 'region_aliases', 'instantly_sync_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.instantly_can_view())', t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---- Region detection --------------------------------------------------------
-- Tags are the parts of a name in brackets, e.g. "CCTV_Pharma(India)7thSept'26".
-- The first tag with a known alias wins. Otherwise the first tag without digits
-- (and at most 20 characters) becomes "<tag> (unmapped)". No tag: "Unassigned".
create or replace function public.instantly_region_for(p_name text)
returns text language sql stable security definer set search_path = public as $$
  with tags as (
    select btrim(t.m[1]) as tag, t.ord
    from regexp_matches(coalesce(p_name, ''), '\(([^)]+)\)', 'g') with ordinality as t(m, ord)
  )
  select coalesce(
    (select a.region from tags join public.region_aliases a on a.tag = lower(tags.tag) order by tags.ord limit 1),
    (select tag || ' (unmapped)' from tags where tag !~ '\d' and char_length(tag) <= 20 order by ord limit 1),
    'Unassigned'
  );
$$;

-- Recompute every campaign's region (after a sync, or after an alias is added).
create or replace function public.instantly_apply_regions()
returns void language sql security definer set search_path = public as $$
  update public.instantly_campaigns c
  set region = public.instantly_region_for(c.name)
  where c.region is distinct from public.instantly_region_for(c.name);
$$;

-- Admin Settings: map an unmapped tag to a region, then re-derive regions.
create or replace function public.instantly_map_tag(p_tag text, p_region text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can map region tags';
  end if;
  if btrim(coalesce(p_tag, '')) = '' or btrim(coalesce(p_region, '')) = '' then
    raise exception 'Tag and region are both required';
  end if;
  insert into public.region_aliases (tag, region)
  values (lower(btrim(p_tag)), btrim(p_region))
  on conflict (tag) do update set region = excluded.region;
  perform public.instantly_apply_regions();
end; $$;
grant execute on function public.instantly_map_tag(text, text) to authenticated;

-- ---- Sync bookkeeping (called only by the Edge Function) --------------------

-- Start a run, unless one is running or one finished in the last 10 minutes.
-- A "running" row older than 15 minutes is treated as dead (function timed out).
create or replace function public.instantly_sync_begin(p_triggered_by text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_last timestamptz;
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('instantly-sync'));

  update public.instantly_sync_log
  set status = 'error', finished_at = now(), error = 'Timed out'
  where status = 'running' and started_at < now() - interval '15 minutes';

  if exists (select 1 from public.instantly_sync_log where status = 'running') then
    insert into public.instantly_sync_log (triggered_by, status, finished_at, error)
    values (p_triggered_by, 'skipped', now(), 'Another sync is already running');
    return jsonb_build_object('started', false, 'reason', 'running');
  end if;

  select max(finished_at) into v_last from public.instantly_sync_log where status = 'success';
  if v_last > now() - interval '10 minutes' then
    insert into public.instantly_sync_log (triggered_by, status, finished_at, error)
    values (p_triggered_by, 'skipped', now(), 'A sync finished less than 10 minutes ago');
    return jsonb_build_object('started', false, 'reason', 'recent', 'last_finished_at', v_last);
  end if;

  v_first := v_last is null;
  insert into public.instantly_sync_log (triggered_by) values (p_triggered_by) returning id into v_id;
  return jsonb_build_object('started', true, 'log_id', v_id, 'first_run', v_first);
end; $$;

create or replace function public.instantly_sync_finish(p_log_id bigint, p_status text, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update public.instantly_sync_log
  set status = p_status, finished_at = now(), error = p_error
  where id = p_log_id;
$$;

-- Flag campaigns that Instantly no longer returns (history is kept).
create or replace function public.instantly_mark_missing(p_seen uuid[])
returns void language sql security definer set search_path = public as $$
  update public.instantly_campaigns
  set deleted_in_instantly = true
  where not deleted_in_instantly and not (id = any (p_seen));
$$;

-- Token the daily pg_cron job sends so the function knows the call is the
-- schedule. Generated once and kept in Supabase Vault; nobody needs to copy it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'instantly_sync_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'instantly_sync_cron_token',
      'Sent by the instantly-sync pg_cron job'
    );
  end if;
end $$;

create or replace function public.instantly_check_cron_token(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'instantly_sync_cron_token' and decrypted_secret = p_token
  );
$$;

-- Server-only functions: callable by the Edge Function's service role, not the browser.
revoke execute on function public.instantly_user_can_view(uuid) from public, anon, authenticated;
revoke execute on function public.instantly_region_for(text) from public, anon, authenticated;
revoke execute on function public.instantly_apply_regions() from public, anon, authenticated;
revoke execute on function public.instantly_sync_begin(text) from public, anon, authenticated;
revoke execute on function public.instantly_sync_finish(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.instantly_mark_missing(uuid[]) from public, anon, authenticated;
revoke execute on function public.instantly_check_cron_token(text) from public, anon, authenticated;
grant execute on function public.instantly_user_can_view(uuid) to service_role;
grant execute on function public.instantly_region_for(text) to service_role;
grant execute on function public.instantly_apply_regions() to service_role;
grant execute on function public.instantly_sync_begin(text) to service_role;
grant execute on function public.instantly_sync_finish(bigint, text, text) to service_role;
grant execute on function public.instantly_mark_missing(uuid[]) to service_role;
grant execute on function public.instantly_check_cron_token(text) to service_role;

-- Regions for any campaigns already present (no-op on a fresh install).
select public.instantly_apply_regions();
