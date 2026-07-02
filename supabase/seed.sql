-- ============================================================================
-- Cadence — demo seed data
-- Creates 6 sign-in-able accounts + a full sample dataset so the app is useful
-- the moment you open it. Run AFTER 0001_init.sql, in the Supabase SQL editor.
--
-- All demo accounts share the password:  cadence123
--   admin@team.com     (admin)      manager@team.com  (manager)
--   neha@team.com      (member)     amit@team.com     (member)
--   vithika@team.com   (member)     viewer@team.com   (viewer)
--
-- Safe to re-run: it no-ops if any projects already exist.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Helper that mints an email/password auth user (+ identity). The
-- on_auth_user_created trigger turns each into a public.profiles row.
create or replace function public._seed_user(p_email text, p_name text, p_pw text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid::text, uid,
    jsonb_build_object('sub', uid::text, 'email', p_email), 'email', now(), now(), now()
  );
  return uid;
end; $$;

do $$
declare
  pw text := 'cadence123';
  admin_id uuid; mgr_id uuid; m1 uuid; m2 uuid; m3 uuid; vwr uuid;
  p_seo uuid; p_email uuid; p_abm uuid;
  obj_id uuid; kr1 uuid; kr2 uuid; kr3 uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid; t9 uuid; t10 uuid;
  tdy date := current_date;
begin
  if exists (select 1 from public.projects) then
    raise notice 'Seed skipped — data already present.';
    return;
  end if;

  -- People (admin first so the trigger makes them the org admin) --------------
  admin_id := public._seed_user('admin@team.com',   'Priya (Admin)',   pw);
  mgr_id   := public._seed_user('manager@team.com', 'Rohan (Manager)', pw);
  m1       := public._seed_user('neha@team.com',    'Neha',            pw);
  m2       := public._seed_user('amit@team.com',    'Amit',            pw);
  m3       := public._seed_user('vithika@team.com', 'Vithika',         pw);
  vwr      := public._seed_user('viewer@team.com',  'Client (Viewer)', pw);

  update public.profiles set role = 'manager' where id = mgr_id;
  update public.profiles set role = 'viewer'  where id = vwr;

  -- Projects (the workstream axis) -------------------------------------------
  p_seo   := gen_random_uuid();
  p_email := gen_random_uuid();
  p_abm   := gen_random_uuid();
  insert into public.projects (id, name, description, lead_user_id, status, color) values
    (p_seo,   'SEO',   'Organic growth workstream',    m1, 'active', '#0f7b6c'),
    (p_email, 'Email', 'Lifecycle + nurture email',     m3, 'active', '#2f6db3'),
    (p_abm,   'ABM',   'Account-based outreach',        m2, 'active', '#6b4fa3');

  -- Objective + Key Results (the goal axis) ----------------------------------
  obj_id := gen_random_uuid();
  insert into public.objectives (id, title, description, owner_user_id, quarter) values
    (obj_id, 'Build a repeatable pipeline engine',
     'Turn marketing effort into predictable qualified pipeline this quarter.',
     admin_id, '2026-Q3');

  kr1 := gen_random_uuid(); kr2 := gen_random_uuid(); kr3 := gen_random_uuid();
  insert into public.key_results
    (id, objective_id, title, owner_user_id, metric_unit, start_value, target_value,
     current_value, confidence, kr_type, last_checkin_at, checkin_history) values
    (kr1, obj_id, 'Grow organic signups 200 → 500', m1, 'signups', 200, 500, 320,
      'on_track', 'committed', (tdy - 3)::timestamptz + interval '9 hours',
      '[{"week":"2026-W25","value":250,"confidence":"on_track"},{"week":"2026-W26","value":290,"confidence":"on_track"},{"week":"2026-W27","value":320,"confidence":"on_track"}]'::jsonb),
    (kr2, obj_id, 'Book 40 sales-qualified meetings', m2, 'meetings', 0, 40, 12,
      'at_risk', 'committed', (tdy - 8)::timestamptz + interval '9 hours',
      '[{"week":"2026-W25","value":4,"confidence":"on_track"},{"week":"2026-W26","value":8,"confidence":"at_risk"},{"week":"2026-W27","value":12,"confidence":"at_risk"}]'::jsonb),
    (kr3, obj_id, 'Lift email reply rate 3% → 8%', m3, '%', 3, 8, 5,
      'on_track', 'stretch', (tdy - 2)::timestamptz + interval '9 hours',
      '[{"week":"2026-W26","value":4,"confidence":"on_track"},{"week":"2026-W27","value":5,"confidence":"on_track"}]'::jsonb);

  -- Tasks (the centre of the app) --------------------------------------------
  t1:=gen_random_uuid(); t2:=gen_random_uuid(); t3:=gen_random_uuid(); t4:=gen_random_uuid(); t5:=gen_random_uuid();
  t6:=gen_random_uuid(); t7:=gen_random_uuid(); t8:=gen_random_uuid(); t9:=gen_random_uuid(); t10:=gen_random_uuid();

  insert into public.tasks
    (id, title, assignee_user_id, project_id, key_result_id, status, due_date, original_due_date,
     planned_for_date, due_date_change_count, due_date_history, carry_forward_count, carry_forward_history,
     definition_of_done, acceptance_required, completed_at, completed_by_user_id, client_facing)
  values
    (t1, 'Publish 3 pillar pages targeting head terms', m1, p_seo, kr1, 'in_progress', tdy, tdy - 2, tdy,
      1, jsonb_build_array(jsonb_build_object('old_date',(tdy-2)::text,'new_date',tdy::text,'changed_by',m1::text,'at',now(),'reason','waiting on design')),
      0, '[]'::jsonb, '[]'::jsonb, false, null, null, false),
    (t2, 'Fix crawl errors flagged in Search Console', m1, p_seo, kr1, 'carried_forward', tdy - 1, tdy - 1, tdy,
      0, '[]'::jsonb, 4, jsonb_build_array((tdy-3)::text,(tdy-2)::text,(tdy-1)::text, tdy::text),
      '[]'::jsonb, false, null, null, false),
    (t3, 'Ship internal-linking update to top 20 posts', m1, p_seo, kr1, 'done', tdy - 3, tdy - 3, tdy - 3,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, false, (tdy-3)::timestamptz + interval '15 hours', m1, false),
    (t4, 'Build ABM target list (200 accounts)', m2, p_abm, kr2, 'blocked', tdy, tdy, tdy,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, true, null, null, false),
    (t5, 'Send 40 personalised LinkedIn intros', m2, p_abm, kr2, 'in_progress', tdy + 1, tdy + 1, tdy + 1,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, true, null, null, false),
    (t6, 'Book demo slots for warm replies', m2, p_abm, kr2, 'done_pending_acceptance', tdy - 1, tdy - 1, tdy - 1,
      0, '[]'::jsonb, 0, '[]'::jsonb,
      '[{"text":"Meeting on calendar","done":true},{"text":"Notes logged in CRM","done":true}]'::jsonb,
      true, null, null, false),
    (t7, 'A/B test 3 subject lines for nurture flow', m3, p_email, kr3, 'in_progress', tdy, tdy, tdy,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, false, null, null, false),
    (t8, 'Rewrite welcome sequence (5 emails)', m3, p_email, kr3, 'not_started', tdy + 2, tdy + 2, tdy + 2,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, false, null, null, false),
    (t9, 'Draft quarterly SEO report for client', m3, p_email, kr3, 'not_started', tdy - 2, tdy - 2, tdy - 2,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, true, null, null, true),
    (t10, 'Segment dormant leads for re-engagement', m1, p_email, kr1, 'not_started', tdy, tdy, tdy,
      0, '[]'::jsonb, 0, '[]'::jsonb, '[]'::jsonb, false, null, null, false);

  -- Blockers -----------------------------------------------------------------
  insert into public.blockers (task_id, raised_by_user_id, description, owner_user_id, status, created_at, resolved_at) values
    (t4, m2, 'Sales hasn''t shared the ICP definition, can''t finalise target accounts.', mgr_id, 'open', (tdy-3)::timestamptz + interval '10 hours', null),
    (null, m3, 'No access to the ESP analytics dashboard.', null, 'open', (tdy-1)::timestamptz + interval '10 hours', null),
    (t1, m1, 'Design assets were late.', admin_id, 'resolved', (tdy-5)::timestamptz + interval '10 hours', (tdy-3)::timestamptz + interval '12 hours');

  -- Today's standups ---------------------------------------------------------
  insert into public.standup_entries (user_id, date, yesterday_completed_task_ids, today_task_ids, blockers_text) values
    (m1, tdy, jsonb_build_array(t3::text), jsonb_build_array(t1::text, t2::text, t10::text), ''),
    (m2, tdy, '[]'::jsonb, jsonb_build_array(t4::text, t5::text), 'Still blocked on ICP.');

  raise notice 'Cadence seed complete. Sign in with any @team.com account, password: cadence123';
end $$;

drop function if exists public._seed_user(text, text, text);
