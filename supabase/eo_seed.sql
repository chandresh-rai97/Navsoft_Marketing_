-- ============================================================================
-- OPTIONAL — Efforts vs Outcome template seed.
-- Populates the exact metric rows from Marketing_Effort_Outcome_Tracker.xlsx for
-- any project named Social Media / Email Marketing / SEO / Performance Marketing
-- (case-insensitive). Also loads the template's Social Media sample data (Aug &
-- Sep 2026) so the traffic-light colours are visible immediately.
-- Skips a channel that has no matching project or that already has metrics.
-- Run in the Supabase SQL editor AFTER 0011_efforts_outcome.sql. Safe to re-run.
-- ============================================================================
do $$
declare
  pid uuid;
  r record;
  -- (name, unit, direction, carry) rows per channel, in order
  social  text[][] := array[
    ['effort','Posts published','#','higher','t'],['effort','Reels / short videos','#','higher','t'],
    ['effort','Stories','#','higher','t'],['effort','Carousels','#','higher','t'],
    ['effort','Community engagements (replies/DMs)','#','higher','t'],
    ['outcome','Accounts reached','#','higher','t'],['outcome','Profile views','#','higher','t'],
    ['outcome','Engagement rate','%','higher','f'],['outcome','New followers','#','higher','t'],
    ['outcome','Link clicks','#','higher','t'],['outcome','Saves / shares','#','higher','t']];
  email   text[][] := array[
    ['effort','Campaigns sent','#','higher','t'],['effort','Newsletters','#','higher','t'],
    ['effort','Automated flows built','#','higher','t'],['effort','A/B tests run','#','higher','t'],
    ['effort','List-growth actions','#','higher','t'],
    ['outcome','Emails delivered','#','higher','t'],['outcome','Open rate','%','higher','f'],
    ['outcome','Click-through rate','%','higher','f'],['outcome','Conversions','#','higher','t'],
    ['outcome','Unsubscribe rate','%','lower','f'],['outcome','Revenue','$','higher','t']];
  seo     text[][] := array[
    ['effort','Content pieces published','#','higher','t'],['effort','Pages optimized','#','higher','t'],
    ['effort','Backlinks acquired','#','higher','t'],['effort','Technical fixes shipped','#','higher','t'],
    ['effort','Internal links added','#','higher','t'],
    ['outcome','Organic sessions','#','higher','t'],['outcome','Keywords in top 10','#','higher','t'],
    ['outcome','Impressions','#','higher','t'],['outcome','Avg position','rank','lower','f'],
    ['outcome','Organic conversions','#','higher','t'],['outcome','Domain authority','score','higher','f']];
  perf    text[][] := array[
    ['effort','Campaigns launched','#','higher','t'],['effort','Ad creatives produced','#','higher','t'],
    ['effort','A/B tests run','#','higher','t'],['effort','Landing pages built','#','higher','t'],
    ['effort','Audience segments tested','#','higher','t'],
    ['outcome','Impressions','#','higher','t'],['outcome','Clicks','#','higher','t'],
    ['outcome','CTR','%','higher','f'],['outcome','Conversions','#','higher','t'],
    ['outcome','CPA','$','lower','f'],['outcome','ROAS','x','higher','f']];
  chans text[] := array['Social Media','Email Marketing','SEO','Performance Marketing'];
  ch text; rows text[][]; i int;
begin
  foreach ch in array chans loop
    select id into pid from public.projects where lower(name) = lower(ch) limit 1;
    if pid is null then continue; end if;
    if exists (select 1 from public.eo_metrics where project_id = pid) then continue; end if;
    rows := case ch when 'Social Media' then social when 'Email Marketing' then email
                    when 'SEO' then seo else perf end;
    for i in 1 .. array_length(rows,1) loop
      insert into public.eo_metrics (project_id, section, name, unit, direction, carry, position)
      values (pid, rows[i][1], rows[i][2], rows[i][3], rows[i][4], rows[i][5]='t', i);
    end loop;
  end loop;

  -- Sample Social Media data (Aug & Sep 2026) matching the template, so colours show.
  select id into pid from public.projects where lower(name) = lower('Social Media') limit 1;
  if pid is not null and not exists (select 1 from public.eo_entries where project_id = pid) then
    insert into public.eo_months (project_id, month) values (pid,'2026-08'),(pid,'2026-09')
      on conflict do nothing;
    for r in (
      select name, m, base, ach from (values
        ('Posts published','2026-08',15,13),('Posts published','2026-09',16,15),
        ('Reels / short videos','2026-08',8,6),('Reels / short videos','2026-09',10,9),
        ('Stories','2026-08',20,18),('Stories','2026-09',20,20),
        ('Carousels','2026-08',6,5),('Carousels','2026-09',6,6),
        ('Community engagements (replies/DMs)','2026-08',200,180),('Community engagements (replies/DMs)','2026-09',220,210),
        ('Accounts reached','2026-08',50000,42000),('Accounts reached','2026-09',55000,51000),
        ('Profile views','2026-08',8000,7200),('Profile views','2026-09',8500,8300),
        ('New followers','2026-08',1200,1050),('New followers','2026-09',1300,1280),
        ('Link clicks','2026-08',2500,2100),('Link clicks','2026-09',2700,2600),
        ('Saves / shares','2026-08',900,780),('Saves / shares','2026-09',1000,950)
      ) as v(name, m, base, ach)
    ) loop
      insert into public.eo_entries (project_id, metric_id, month, base_target, achieved, carried_in)
      select pid, em.id, r.m, r.base, r.ach, case when r.m='2026-08' then 0 else null end
      from public.eo_metrics em where em.project_id = pid and em.name = r.name;
    end loop;
    -- the % metric (Engagement rate) uses fractional values
    for r in (select m, base, ach from (values ('2026-08',0.05,0.043),('2026-09',0.052,0.049)) as v(m,base,ach)) loop
      insert into public.eo_entries (project_id, metric_id, month, base_target, achieved, carried_in)
      select pid, em.id, r.m, r.base, r.ach, case when r.m='2026-08' then 0 else null end
      from public.eo_metrics em where em.project_id = pid and em.name = 'Engagement rate';
    end loop;
  end if;
end $$;
