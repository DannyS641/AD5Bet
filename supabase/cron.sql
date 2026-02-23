-- Scheduled job to sync Odds API scores and settle bets.
-- Requires extensions: pg_cron and pg_net.
-- Before running, set database settings:
--   alter database postgres set app.settings.functions_url = 'https://<project-ref>.functions.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service-role-key>';

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_odds_scores_sync()
returns void
language plpgsql
as $$
declare
  functions_url text := current_setting('app.settings.functions_url', true);
  service_role_key text := current_setting('app.settings.service_role_key', true);
begin
  if functions_url is null or service_role_key is null then
    raise exception 'Missing app.settings.functions_url or app.settings.service_role_key';
  end if;

  perform net.http_post(
    url := functions_url || '/odds-scores-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_role_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'sportKey', 'soccer_epl',
      'daysFrom', 1,
      'settle', true
    )
  );
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'odds-scores-sync-15m') then
    perform cron.schedule(
      'odds-scores-sync-15m',
      '*/15 * * * *',
      'select public.run_odds_scores_sync();'
    );
  end if;
end;
$$;
