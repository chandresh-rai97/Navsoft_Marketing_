-- ============================================================================
-- Cadence — OKR & Daily Task Tracker
-- Schema + Row Level Security + helper functions + triggers
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

-- profiles: one row per auth user (single team for now; team_id is future-proofing)
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text        not null default '',
  email              text        not null,
  role               text        not null default 'member'
                       check (role in ('admin','manager','member','viewer')),
  team_id            uuid,
  timezone           text        not null default 'Asia/Kolkata',
  notification_prefs jsonb       not null default '{}'::jsonb,
  active             boolean      not null default true,
  created_at         timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- projects: the horizontal "workstream" axis. User-defined and unlimited.
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  description   text        not null default '',
  lead_user_id  uuid        references public.profiles(id) on delete set null,
  status        text        not null default 'active' check (status in ('active','archived')),
  color         text        not null default '#0f7b6c',
  created_at    timestamptz not null default now()
);

-- objectives: the qualitative quarterly goal
create table if not exists public.objectives (
  id             uuid primary key default gen_random_uuid(),
  title          text        not null,
  description    text        not null default '',
  owner_user_id  uuid        references public.profiles(id) on delete set null,
  team_id        uuid,
  quarter        text        not null default '',
  created_at     timestamptz not null default now()
);

-- key_results: measured, scored, never checked off. The vertical axis.
create table if not exists public.key_results (
  id              uuid primary key default gen_random_uuid(),
  objective_id    uuid        not null references public.objectives(id) on delete cascade,
  title           text        not null,
  owner_user_id   uuid        references public.profiles(id) on delete set null,
  metric_unit     text        not null default '',
  start_value     numeric     not null default 0,
  target_value    numeric     not null default 100,
  current_value   numeric     not null default 0,
  confidence      text        not null default 'on_track'
                    check (confidence in ('on_track','at_risk','off_track')),
  kr_type         text        not null default 'committed' check (kr_type in ('committed','stretch')),
  final_score     numeric,
  retro_notes     text        not null default '',
  last_checkin_at timestamptz,
  checkin_history jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- tasks: the centre of the app
create table if not exists public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  title                 text        not null,
  description           text        not null default '',
  assignee_user_id      uuid        references public.profiles(id) on delete set null,
  project_id            uuid        references public.projects(id) on delete set null,
  key_result_id         uuid        references public.key_results(id) on delete set null,
  status                text        not null default 'not_started'
                          check (status in ('not_started','in_progress','blocked',
                                            'done_pending_acceptance','done','carried_forward','cancelled')),
  due_date              date        not null default current_date,
  original_due_date     date        not null default current_date,  -- set once, never overwritten
  planned_for_date      date        not null default current_date,
  due_date_change_count int         not null default 0,
  due_date_history      jsonb       not null default '[]'::jsonb,
  carry_forward_count   int         not null default 0,
  carry_forward_history jsonb       not null default '[]'::jsonb,
  definition_of_done    jsonb       not null default '[]'::jsonb,
  acceptance_required   boolean     not null default false,
  accepted_by_user_id   uuid        references public.profiles(id) on delete set null,
  reopened_count        int         not null default 0,
  recurrence            text        not null default 'none' check (recurrence in ('none','daily','weekly','custom')),
  recurrence_config     jsonb,
  completed_at          timestamptz,
  completed_by_user_id  uuid        references public.profiles(id) on delete set null,
  cancelled_reason      text,
  client_facing         boolean     not null default false,
  created_at            timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_user_id);
create index if not exists tasks_project_idx  on public.tasks (project_id);
create index if not exists tasks_kr_idx        on public.tasks (key_result_id);
create index if not exists tasks_status_idx    on public.tasks (status);

-- blockers: first-class, with an owner and an age
create table if not exists public.blockers (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid        references public.tasks(id) on delete set null,
  raised_by_user_id  uuid        references public.profiles(id) on delete set null,
  description        text        not null,
  owner_user_id      uuid        references public.profiles(id) on delete set null,
  status             text        not null default 'open' check (status in ('open','resolved')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

-- standup_entries: the daily check
create table if not exists public.standup_entries (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.profiles(id) on delete cascade,
  date                        date not null default current_date,
  yesterday_completed_task_ids jsonb not null default '[]'::jsonb,
  today_task_ids              jsonb not null default '[]'::jsonb,
  blockers_text               text  not null default '',
  submitted_at                timestamptz not null default now(),
  unique (user_id, date)
);

-- weekly_priorities: optional weekly commitment layer
create table if not exists public.weekly_priorities (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  owner_user_id  uuid references public.profiles(id) on delete set null,
  key_result_id  uuid references public.key_results(id) on delete set null,
  week           text not null,
  created_at     timestamptz not null default now()
);

-- audit_log: every status change, reassignment, due-date change
create table if not exists public.audit_log (
  id                  uuid primary key default gen_random_uuid(),
  entity_type         text not null,
  entity_id           uuid,
  action              text not null,
  changed_by_user_id  uuid references public.profiles(id) on delete set null,
  old_value           jsonb,
  new_value           jsonb,
  ts                  timestamptz not null default now()
);
create index if not exists audit_entity_idx on public.audit_log (entity_type, entity_id);

-- app_meta: singleton bookkeeping (last carry-forward sweep)
create table if not exists public.app_meta (
  id         int primary key default 1 check (id = 1),
  last_sweep date
);
insert into public.app_meta (id, last_sweep) values (1, null) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS  (SECURITY DEFINER → bypass RLS, so no policy recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','manager') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_viewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'viewer' from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.my_role()     to authenticated;
grant execute on function public.is_manager()  to authenticated;
grant execute on function public.is_viewer()   to authenticated;

-- New auth user → profile. First ever user becomes admin; everyone else a member.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cnt int;
  assigned_role text;
begin
  select count(*) into cnt from public.profiles;
  assigned_role := case when cnt = 0 then 'admin' else 'member' end;
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    new.email,
    assigned_role,
    true
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may edit their own profile but not escalate their role / active flag.
create or replace function public.guard_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new; -- SQL-editor / service context, or a manager: allow.
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only a manager or admin can change a role';
  end if;
  if new.active is distinct from old.active then
    raise exception 'Only a manager or admin can change active status';
  end if;
  return new;
end; $$;

drop trigger if exists guard_profile_change on public.profiles;
create trigger guard_profile_change
  before update on public.profiles
  for each row execute function public.guard_profile_change();

-- The core loop: roll unfinished, past-planned tasks forward to today. Runs
-- once per calendar day (idempotent), called on app boot. SECURITY DEFINER so
-- one member's login can sweep the whole team without tripping RLS.
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
   where status not in ('done','cancelled')
     and planned_for_date is not null
     and planned_for_date < p_today;

  insert into public.app_meta (id, last_sweep) values (1, p_today)
    on conflict (id) do update set last_sweep = excluded.last_sweep;
end; $$;

grant execute on function public.carry_forward_sweep(date) to authenticated;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.objectives        enable row level security;
alter table public.key_results       enable row level security;
alter table public.tasks             enable row level security;
alter table public.blockers          enable row level security;
alter table public.standup_entries   enable row level security;
alter table public.weekly_priorities enable row level security;
alter table public.audit_log         enable row level security;
alter table public.app_meta          enable row level security;

-- profiles: everyone in the team can read; self or manager can write.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid() or public.is_manager());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_manager()) with check (id = auth.uid() or public.is_manager());

-- projects: read all; managers/admins write.
create policy projects_select on public.projects for select to authenticated using (true);
create policy projects_write  on public.projects for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- objectives: read all; managers/admins write.
create policy objectives_select on public.objectives for select to authenticated using (true);
create policy objectives_write  on public.objectives for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- key_results: read all; managers/admins OR the KR owner may write (owner does check-ins).
create policy kr_select on public.key_results for select to authenticated using (true);
create policy kr_insert on public.key_results for insert to authenticated with check (public.is_manager());
create policy kr_update on public.key_results for update to authenticated
  using (public.is_manager() or owner_user_id = auth.uid())
  with check (public.is_manager() or owner_user_id = auth.uid());
create policy kr_delete on public.key_results for delete to authenticated using (public.is_manager());

-- tasks: read all; assignee OR manager OR the task's KR owner may write.
create policy tasks_select on public.tasks for select to authenticated using (true);
create policy tasks_insert on public.tasks for insert to authenticated
  with check (not public.is_viewer() and (public.is_manager() or assignee_user_id = auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (
    not public.is_viewer() and (
      public.is_manager()
      or assignee_user_id = auth.uid()
      or exists (select 1 from public.key_results k where k.id = tasks.key_result_id and k.owner_user_id = auth.uid())
    )
  )
  with check (not public.is_viewer());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_manager());

-- blockers: read all; raiser/owner/manager write (non-viewers only).
create policy blockers_select on public.blockers for select to authenticated using (true);
create policy blockers_insert on public.blockers for insert to authenticated
  with check (not public.is_viewer() and (raised_by_user_id = auth.uid() or public.is_manager()));
create policy blockers_update on public.blockers for update to authenticated
  using (not public.is_viewer() and (public.is_manager() or raised_by_user_id = auth.uid() or owner_user_id = auth.uid()))
  with check (not public.is_viewer());
create policy blockers_delete on public.blockers for delete to authenticated using (public.is_manager());

-- standups: read all (facilitation board); own row write, managers may edit any.
create policy standups_select on public.standup_entries for select to authenticated using (true);
create policy standups_insert on public.standup_entries for insert to authenticated with check (user_id = auth.uid());
create policy standups_update on public.standup_entries for update to authenticated using (user_id = auth.uid() or public.is_manager()) with check (user_id = auth.uid() or public.is_manager());
create policy standups_delete on public.standup_entries for delete to authenticated using (user_id = auth.uid() or public.is_manager());

-- weekly priorities: read all; owner or manager write.
create policy wp_select on public.weekly_priorities for select to authenticated using (true);
create policy wp_write  on public.weekly_priorities for all to authenticated
  using (not public.is_viewer() and (owner_user_id = auth.uid() or public.is_manager()))
  with check (not public.is_viewer() and (owner_user_id = auth.uid() or public.is_manager()));

-- audit log: managers/admins read; any authenticated non-viewer may append.
create policy audit_select on public.audit_log for select to authenticated using (public.is_manager());
create policy audit_insert on public.audit_log for insert to authenticated with check (not public.is_viewer());

-- app_meta: read only for clients; writes happen through the SECURITY DEFINER sweep.
create policy app_meta_select on public.app_meta for select to authenticated using (true);
