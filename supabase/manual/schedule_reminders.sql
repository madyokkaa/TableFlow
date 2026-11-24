-- Schedules the Telegram one-hour reminders (GET /api/cron/reminders) every
-- 10 minutes from inside Supabase: pg_cron fires, pg_net makes the HTTPS
-- call. Vercel Cron on the Hobby plan only runs once a day, too rarely.
--
-- NOT a migration: the URL and the secret differ between the test and the
-- production project, so run this by hand in each project's SQL editor
-- (Dashboard -> SQL Editor), test project first. See docs/telegram-bot.md.
--
-- Before running, replace the two placeholders below:
--   <SITE_URL>     the deployment for THIS project, e.g. https://... (no trailing slash)
--   <CRON_SECRET>  the same value as CRON_SECRET in that deployment's Vercel env

-- 1. Extensions (Dashboard -> Database -> Extensions does the same).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Keep the address and the secret in Vault, not in the job text.
--    Re-running: delete the old ones first, or use vault.update_secret.
select vault.create_secret('<SITE_URL>/api/cron/reminders', 'tableflow_reminders_url', 'Reminder route for pg_cron');
select vault.create_secret('<CRON_SECRET>', 'tableflow_cron_secret', 'CRON_SECRET of the Vercel deployment');

-- 3. The job: every 10 minutes, GET the route with the bearer secret.
select cron.schedule(
  'tableflow-reminders',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tableflow_reminders_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tableflow_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- ---------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------
-- Is it scheduled?
--   select jobid, jobname, schedule, active from cron.job where jobname = 'tableflow-reminders';
-- Did the last runs fire? (status 'succeeded' = the HTTP call was queued)
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'tableflow-reminders')
--   order by start_time desc limit 10;
-- What did the route answer? (expect 200 and {"sent": N}; 401 = wrong secret)
--   select status_code, content, created from net._http_response order by created desc limit 10;

-- ---------------------------------------------------------------------
-- Turning it off / changing it
-- ---------------------------------------------------------------------
--   select cron.unschedule('tableflow-reminders');
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'tableflow_cron_secret'), '<NEW_CRON_SECRET>');
