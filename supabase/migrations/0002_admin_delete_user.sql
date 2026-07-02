-- ============================================================================
-- Cadence — admin "delete user"
-- Adds an admin-only way to remove a team member completely (revokes login).
-- Run this in the Supabase SQL editor AFTER 0001_init.sql.
-- ============================================================================

-- Deleting the auth.users row is what actually revokes access. It cascades to
-- public.profiles (and standups) via the FKs, and nulls out the user's
-- references on tasks/blockers. Runs as SECURITY DEFINER so an admin can do it
-- from the browser without the service key — but the function itself checks
-- that the caller is an admin, so only admins can ever trigger a deletion.
create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can delete users';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  delete from auth.users where id = target;  -- cascades to profiles
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Defense in depth: even a direct delete against the profiles table is
-- admins-only (managers/members/viewers cannot remove anyone).
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (coalesce(public.my_role(), '') = 'admin');
