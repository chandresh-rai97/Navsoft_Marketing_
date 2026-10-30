-- ============================================================================
-- Cadence — schedule the HubSpot sync once a day at 9:00 AM IST.
-- pg_cron runs in UTC: 9:00 IST = 03:30 UTC → '30 3 * * *'.
-- Run in the Supabase SQL editor AFTER migration 0016 and after deploying the
-- `hubspot-sync` Edge Function. Safe to re-run (replaces the job).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'hubspot-sync-daily';

select cron.schedule(
  'hubspot-sync-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://uhfwmbzdvafimmaamqem.supabase.co/functions/v1/hubspot-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'hubspot_sync_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
