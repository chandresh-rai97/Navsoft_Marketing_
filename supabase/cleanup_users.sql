-- ============================================================================
-- Cadence — one-time account cleanup
-- Deletes EVERY account except the two you want to keep:
--     admin@team.com   and   amit@navsoft.in
--
-- Deleting from auth.users revokes login and cascades to profiles/standups and
-- nulls the user's task/blocker references. Run once in the Supabase SQL editor.
--
-- NOTE: amit@navsoft.in only survives this if that account already exists (i.e.
-- someone signed up with it). If it doesn't exist yet, you'll be left with just
-- admin@team.com — have Amit sign up with amit@navsoft.in (or add them from the
-- Supabase dashboard), then they'll appear in the app.
-- ============================================================================

delete from auth.users
where lower(email) not in ('admin@team.com', 'amit@navsoft.in');

-- Show who remains.
select email, created_at from auth.users order by created_at;
