-- ============================================================================
-- Cadence — limit Efforts vs Outcome to exactly four channels:
--   Email Marketing, SEO, Performance Marketing, Social Media.
-- Removes any tracker data on other projects and blocks new ones from appearing.
-- Run in the Supabase SQL editor AFTER 0011. Safe to re-run.
-- ============================================================================

-- Which project counts as an allowed channel (case/space-insensitive on name).
create or replace function public.eo_is_allowed_channel(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid
      and lower(btrim(p.name)) in ('email marketing','seo','performance marketing','social media')
  );
$$;
grant execute on function public.eo_is_allowed_channel(uuid) to authenticated;

-- Remove tracker data that belongs to any other channel.
delete from public.eo_entries e where not public.eo_is_allowed_channel(e.project_id);
delete from public.eo_months  m where not public.eo_is_allowed_channel(m.project_id);
delete from public.eo_metrics t where not public.eo_is_allowed_channel(t.project_id);

-- Block creating a tracker on a non-allowed channel (defense in depth).
create or replace function public.eo_enforce_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.eo_is_allowed_channel(new.project_id) then
    raise exception 'Efforts vs Outcome is limited to the four channels: Email Marketing, SEO, Performance Marketing, Social Media';
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['eo_metrics','eo_months','eo_entries'] loop
    execute format('drop trigger if exists eo_enforce_channel on public.%I', t);
    execute format('create trigger eo_enforce_channel before insert on public.%I for each row execute function public.eo_enforce_channel()', t);
  end loop;
end $$;
