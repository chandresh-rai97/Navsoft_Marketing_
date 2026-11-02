-- ============================================================================
-- Cadence — per-tab access control for two tabs only: Campaigns and
-- HubSpot Team Activity. A row grants a tab to a whole role or to one user.
-- Admins can always see both tabs. Only admins can read or change grants, and
-- every change is written to audit_log. Run in the Supabase SQL editor AFTER
-- the earlier migrations (0015 and 0016 included). Safe to re-run.
-- ============================================================================

-- ---- Table (created and seeded once, with today's access) ------------------
do $$
begin
  if to_regclass('public.tab_access') is null then
    create table public.tab_access (
      id         uuid primary key default gen_random_uuid(),
      tab_key    text not null check (tab_key in ('campaigns', 'hubspot_team_activity')),
      role       text check (role in ('admin', 'manager', 'viewer', 'member')),
      user_id    uuid references public.profiles(id) on delete cascade,
      granted_by uuid references public.profiles(id) on delete set null,
      granted_at timestamptz not null default now(),
      check ((role is null) <> (user_id is null))      -- exactly one of role / user
    );
    create unique index tab_access_role_uniq on public.tab_access (tab_key, role) where role is not null;
    create unique index tab_access_user_uniq on public.tab_access (tab_key, user_id) where user_id is not null;

    -- Today's access, so nothing changes for anyone:
    --   Campaigns: admin, viewer and the Email Marketing project lead.
    --   HubSpot Team Activity: admin, manager.
    insert into public.tab_access (tab_key, role) values
      ('campaigns', 'admin'), ('campaigns', 'viewer'),
      ('hubspot_team_activity', 'admin'), ('hubspot_team_activity', 'manager');
    insert into public.tab_access (tab_key, user_id)
    select distinct 'campaigns', p.lead_user_id
    from public.projects p
    where lower(btrim(p.name)) = 'email marketing' and p.lead_user_id is not null;
  end if;
end $$;

-- ---- Who can see a tab --------------------------------------------------------
-- True if the user is an admin, their role is granted, or they are granted by name.
create or replace function public.can_view_tab_for(p_tab text, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and (
    exists (select 1 from public.profiles where id = p_uid and role = 'admin')
    or exists (select 1 from public.tab_access t join public.profiles p on p.id = p_uid
               where t.tab_key = p_tab and t.role = p.role)
    or exists (select 1 from public.tab_access where tab_key = p_tab and user_id = p_uid)
  );
$$;

-- The signed-in user's own check (used by RLS, the sidebar and the Edge Functions).
create or replace function public.can_view_tab(p_tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_tab_for(p_tab, auth.uid());
$$;
grant execute on function public.can_view_tab(text) to authenticated;
revoke execute on function public.can_view_tab_for(text, uuid) from public, anon, authenticated;
grant execute on function public.can_view_tab_for(text, uuid) to service_role;

-- The Edge Functions ask these before an on-demand refresh; they now follow
-- tab access (the 10-minute cooldown is unchanged).
create or replace function public.instantly_user_can_view(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_tab_for('campaigns', p_uid);
$$;
create or replace function public.instantly_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_tab('campaigns');
$$;
create or replace function public.hubspot_user_can_view(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_tab_for('hubspot_team_activity', p_uid);
$$;
create or replace function public.hubspot_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_tab('hubspot_team_activity');
$$;

-- ---- Read policies on the two tabs' data -------------------------------------
do $$
declare t text;
begin
  -- Campaigns (region_aliases is the Campaigns region-tag list)
  foreach t in array array['instantly_campaigns', 'instantly_daily_stats', 'instantly_sync_log', 'region_aliases'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.can_view_tab(''campaigns''))', t, t);
  end loop;
  -- HubSpot Team Activity
  foreach t in array array['hubspot_people', 'hubspot_alert_settings', 'hubspot_activities',
                           'hubspot_tasks', 'hubspot_watch_deals', 'hubspot_sync_log'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.can_view_tab(''hubspot_team_activity''))', t, t);
  end loop;
end $$;

-- ---- tab_access: admins only (read and write) ---------------------------------
alter table public.tab_access enable row level security;
drop policy if exists tab_access_admin on public.tab_access;
create policy tab_access_admin on public.tab_access for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
revoke all on public.tab_access from anon;

-- ---- Every grant / revoke goes to audit_log, however it is made --------------
create or replace function public.tab_access_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.tab_access;
begin
  r := coalesce(new, old);
  insert into public.audit_log (entity_type, entity_id, action, changed_by_user_id, old_value, new_value)
  values (
    'tab_access',
    r.id,
    case tg_op when 'INSERT' then 'grant' when 'DELETE' then 'revoke' else 'update' end,
    auth.uid(),
    case when tg_op <> 'INSERT' then jsonb_build_object('tab_key', old.tab_key, 'role', old.role, 'user_id', old.user_id) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('tab_key', new.tab_key, 'role', new.role, 'user_id', new.user_id) end
  );
  return null;
end; $$;

drop trigger if exists tab_access_audit on public.tab_access;
create trigger tab_access_audit after insert or update or delete on public.tab_access
  for each row execute function public.tab_access_audit();

-- ---- Save from the "Who can see this tab" panel (admins only) -----------------
-- p_roles: the granted roles among manager / viewer / member (admin is always on).
-- p_users: every user granted by name. Only actual changes touch the table.
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
  if p_tab not in ('campaigns', 'hubspot_team_activity') then
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
