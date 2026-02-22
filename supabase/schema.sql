-- Core tables for AD5BET

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users on delete cascade,
  balance numeric default 0,
  updated_at timestamptz default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  reference text unique not null,
  amount numeric not null,
  currency text not null default 'NGN',
  provider text not null default 'paystack',
  status text not null default 'success',
  created_at timestamptz default now()
);

create table if not exists public.auto_topup_settings (
  user_id uuid primary key references auth.users on delete cascade,
  enabled boolean not null default false,
  threshold numeric not null default 10000,
  topup_amount numeric not null default 10000,
  currency text not null default 'NGN',
  authorization_email text,
  authorization_reference text,
  authorization_code text,
  authorization_status text not null default 'none',
  authorization_created_at timestamptz,
  authorization_active_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_status text,
  last_charge_reference text,
  cooldown_minutes int not null default 60,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.auto_topup_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  reference text unique not null,
  amount numeric not null,
  currency text not null default 'NGN',
  provider text not null default 'paystack',
  status text not null default 'processing',
  initiated_at timestamptz default now(),
  completed_at timestamptz,
  error text
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  amount numeric not null,
  currency text not null default 'NGN',
  bank_name text not null,
  bank_code text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create table if not exists public.jackpots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pick_count int not null,
  entry_fee numeric not null,
  currency text not null default 'NGN',
  prize_pool numeric not null,
  status text not null default 'open',
  opens_at timestamptz default now(),
  closes_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists public.jackpot_events (
  id uuid primary key default gen_random_uuid(),
  jackpot_id uuid references public.jackpots on delete cascade,
  event_id text not null,
  home_team text not null,
  away_team text not null,
  start_time timestamptz not null,
  market text not null default '1X2',
  outcomes text[] not null default array['home','draw','away'],
  created_at timestamptz default now(),
  unique (jackpot_id, event_id)
);

create table if not exists public.jackpot_entries (
  id uuid primary key default gen_random_uuid(),
  jackpot_id uuid references public.jackpots on delete cascade,
  user_id uuid references auth.users on delete cascade,
  selections jsonb not null,
  entry_fee numeric not null,
  status text not null default 'pending',
  correct_count int,
  created_at timestamptz default now()
);

create table if not exists public.jackpot_results (
  id uuid primary key default gen_random_uuid(),
  jackpot_id uuid references public.jackpots on delete cascade,
  results jsonb not null,
  settled_at timestamptz default now(),
  unique (jackpot_id)
);

create table if not exists public.jackpot_payouts (
  id uuid primary key default gen_random_uuid(),
  jackpot_id uuid references public.jackpots on delete cascade,
  entry_id uuid references public.jackpot_entries on delete cascade,
  user_id uuid references auth.users on delete cascade,
  amount numeric not null,
  created_at timestamptz default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  stake numeric not null,
  total_odds numeric not null,
  potential_win numeric not null,
  selections jsonb not null,
  currency text not null default 'NGN',
  status text not null default 'pending',
  result text,
  payout numeric default 0,
  is_live boolean not null default false,
  created_at timestamptz default now(),
  settled_at timestamptz
);

create table if not exists public.bet_legs (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid references public.bets on delete cascade,
  user_id uuid references auth.users on delete cascade,
  selection_id text,
  event_id text not null,
  sport_key text,
  league text,
  home_team text,
  away_team text,
  market text not null,
  outcome text not null,
  odds numeric not null,
  point numeric,
  commence_time timestamptz,
  status text not null default 'pending',
  settled_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.event_results (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  sport_key text,
  sport_title text,
  home_team text,
  away_team text,
  commence_time timestamptz,
  completed boolean default false,
  home_score int,
  away_score int,
  last_update timestamptz,
  source text not null default 'odds-api',
  raw jsonb,
  created_at timestamptz default now()
);

alter table public.bets add column if not exists currency text not null default 'NGN';
alter table public.bets add column if not exists result text;
alter table public.bets add column if not exists payout numeric default 0;
alter table public.bets add column if not exists is_live boolean not null default false;
alter table public.bets add column if not exists settled_at timestamptz;

-- Ensure profile & wallet are created for each new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.credit_wallet_from_payment(
  p_user_id uuid,
  p_reference text,
  p_amount numeric,
  p_currency text
)
returns numeric
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  next_balance numeric;
begin
  if p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
  values (p_user_id, p_reference, p_amount, p_currency, 'paystack', 'success')
  on conflict (reference) do nothing;

  if not found then
    select balance into next_balance from public.wallets where user_id = p_user_id;
    return coalesce(next_balance, 0);
  end if;

  update public.wallets
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into next_balance;

  if next_balance is null then
    insert into public.wallets (user_id, balance)
    values (p_user_id, p_amount)
    on conflict (user_id) do update
      set balance = wallets.balance + excluded.balance,
          updated_at = now()
    returning balance into next_balance;
  end if;

  return next_balance;
end;
$$;

create or replace function public.upsert_auto_topup_settings(
  p_enabled boolean,
  p_threshold numeric,
  p_topup_amount numeric,
  p_currency text default 'NGN'
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_settings public.auto_topup_settings%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_threshold is null or p_threshold <= 0 then
    raise exception 'Invalid threshold';
  end if;

  if p_topup_amount is null or p_topup_amount <= 0 then
    raise exception 'Invalid topup amount';
  end if;

  insert into public.auto_topup_settings (
    user_id,
    enabled,
    threshold,
    topup_amount,
    currency,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_enabled, false),
    p_threshold,
    p_topup_amount,
    coalesce(p_currency, 'NGN'),
    now()
  )
  on conflict (user_id) do update
    set enabled = excluded.enabled,
        threshold = excluded.threshold,
        topup_amount = excluded.topup_amount,
        currency = excluded.currency,
        updated_at = now()
  returning * into v_settings;

  return json_build_object(
    'enabled', v_settings.enabled,
    'threshold', v_settings.threshold,
    'topup_amount', v_settings.topup_amount,
    'currency', v_settings.currency,
    'authorization_status', v_settings.authorization_status,
    'authorization_reference', v_settings.authorization_reference,
    'authorization_active_at', v_settings.authorization_active_at,
    'last_attempt_status', v_settings.last_attempt_status
  );
end;
$$;

create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_bank_name text,
  p_bank_code text,
  p_account_number text,
  p_account_name text
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_balance numeric;
  v_request_id uuid;
begin
  if p_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if auth.role() <> 'service_role' and auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;

  if p_amount < 100 then
    raise exception 'Minimum withdrawal is 100';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    v_balance := 0;
  end if;

  if v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.wallets
  set balance = v_balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.withdrawal_requests (
    user_id,
    amount,
    currency,
    bank_name,
    bank_code,
    account_number,
    account_name,
    status
  )
  values (
    p_user_id,
    p_amount,
    p_currency,
    p_bank_name,
    p_bank_code,
    p_account_number,
    p_account_name,
    'pending'
  )
  returning id into v_request_id;

  insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
  values (
    p_user_id,
    'withdrawal-' || v_request_id::text,
    -p_amount,
    p_currency,
    'withdrawal',
    'pending'
  )
  on conflict (reference) do nothing;

  return json_build_object('request_id', v_request_id, 'balance', v_balance);
end;
$$;

create or replace function public.place_jackpot_entry(
  p_jackpot_id uuid,
  p_selections jsonb
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_entry_fee numeric;
  v_balance numeric;
  v_pick_count int;
  v_selection_count int;
  v_event_count int;
  v_invalid_count int;
  v_entry_id uuid;
  v_reference text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select pick_count, entry_fee
  into v_pick_count, v_entry_fee
  from public.jackpots
  where id = p_jackpot_id and status = 'open'
    and (opens_at is null or opens_at <= now())
    and closes_at > now()
  for update;

  if v_pick_count is null then
    raise exception 'Jackpot not available';
  end if;

  select count(*) into v_selection_count from jsonb_object_keys(p_selections);
  if v_selection_count <> v_pick_count then
    raise exception 'Selections must contain % picks', v_pick_count;
  end if;

  select count(*) into v_event_count
  from public.jackpot_events
  where jackpot_id = p_jackpot_id
    and event_id in (select key from jsonb_object_keys(p_selections) as keys(key));

  if v_event_count <> v_selection_count then
    raise exception 'Selections contain invalid events';
  end if;

  select count(*) into v_invalid_count
  from jsonb_each_text(p_selections) s
  left join public.jackpot_events e
    on e.jackpot_id = p_jackpot_id and e.event_id = s.key
  where not (s.value = any (e.outcomes));

  if v_invalid_count > 0 then
    raise exception 'Selections contain invalid outcomes';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = v_user_id
  for update;

  if v_balance is null then
    v_balance := 0;
  end if;

  if v_balance < v_entry_fee then
    raise exception 'Insufficient balance';
  end if;

  update public.wallets
  set balance = v_balance - v_entry_fee,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.jackpot_entries (jackpot_id, user_id, selections, entry_fee)
  values (p_jackpot_id, v_user_id, p_selections, v_entry_fee)
  returning id into v_entry_id;

  v_reference := 'jackpot-entry-' || v_entry_id::text;
  insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
  values (v_user_id, v_reference, -v_entry_fee, 'NGN', 'jackpot', 'success')
  on conflict (reference) do nothing;

  return json_build_object('entry_id', v_entry_id, 'balance', v_balance - v_entry_fee);
end;
$$;

create or replace function public.place_bet(
  p_user_id uuid,
  p_stake numeric,
  p_currency text default 'NGN',
  p_selections jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_balance numeric;
  v_total_odds numeric := 1;
  v_potential_win numeric := 0;
  v_bet_id uuid;
  v_selection jsonb;
  v_count int;
  v_now timestamptz := now();
  v_commence timestamptz;
  v_odds numeric;
  v_is_live boolean := false;
  v_reference text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  if p_user_id is null then
    raise exception 'Missing user';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'Invalid stake';
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    raise exception 'Invalid selections';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_selections);
  if v_count = 0 then
    raise exception 'No selections';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    v_balance := 0;
  end if;

  if v_balance < p_stake then
    raise exception 'Insufficient balance';
  end if;

  for v_selection in select * from jsonb_array_elements(p_selections)
  loop
    v_odds := nullif(v_selection->>'odds', '')::numeric;
    if v_odds is null or v_odds <= 1 then
      raise exception 'Invalid odds';
    end if;
    v_total_odds := v_total_odds * v_odds;
    v_commence := nullif(v_selection->>'commenceTime', '')::timestamptz;
    if v_commence is not null and v_commence <= v_now then
      v_is_live := true;
    end if;
  end loop;

  v_total_odds := round(v_total_odds, 2);
  v_potential_win := round(p_stake * v_total_odds, 2);

  insert into public.bets (
    user_id,
    stake,
    total_odds,
    potential_win,
    selections,
    status,
    currency,
    is_live
  )
  values (
    p_user_id,
    p_stake,
    v_total_odds,
    v_potential_win,
    p_selections,
    'pending',
    coalesce(p_currency, 'NGN'),
    v_is_live
  )
  returning id into v_bet_id;

  insert into public.bet_legs (
    bet_id,
    user_id,
    selection_id,
    event_id,
    sport_key,
    league,
    home_team,
    away_team,
    market,
    outcome,
    odds,
    point,
    commence_time
  )
  select
    v_bet_id,
    p_user_id,
    item->>'id',
    item->>'eventId',
    item->>'sportKey',
    item->>'league',
    item->>'homeTeam',
    item->>'awayTeam',
    item->>'market',
    item->>'outcome',
    (item->>'odds')::numeric,
    nullif(item->>'point', '')::numeric,
    nullif(item->>'commenceTime', '')::timestamptz
  from jsonb_array_elements(p_selections) as item;

  update public.wallets
  set balance = v_balance - p_stake,
      updated_at = now()
  where user_id = p_user_id;

  v_reference := 'bet-' || v_bet_id::text;
  insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
  values (p_user_id, v_reference, -p_stake, coalesce(p_currency, 'NGN'), 'bet', 'success')
  on conflict (reference) do nothing;

  return json_build_object('bet_id', v_bet_id, 'balance', v_balance - p_stake);
end;
$$;

create or replace function public.evaluate_bet_leg(
  p_market text,
  p_outcome text,
  p_point numeric,
  p_home_team text,
  p_away_team text,
  p_home_score int,
  p_away_score int
)
returns text
language plpgsql
as $$
declare
  v_outcome text;
  v_home_win boolean;
  v_away_win boolean;
  v_draw boolean;
  v_total int;
begin
  if p_home_score is null or p_away_score is null then
    return 'pending';
  end if;

  v_outcome := lower(coalesce(p_outcome, ''));
  v_home_win := p_home_score > p_away_score;
  v_away_win := p_away_score > p_home_score;
  v_draw := p_home_score = p_away_score;
  v_total := p_home_score + p_away_score;

  if p_market in ('h2h', 'h2h_3_way') then
    if v_draw then
      return case when v_outcome in ('draw', 'x') then 'won' else 'lost' end;
    elsif v_home_win then
      return case
        when v_outcome in ('1', 'home') or v_outcome = lower(coalesce(p_home_team, '')) then 'won'
        else 'lost'
      end;
    else
      return case
        when v_outcome in ('2', 'away') or v_outcome = lower(coalesce(p_away_team, '')) then 'won'
        else 'lost'
      end;
    end if;
  end if;

  if p_market = 'draw_no_bet' then
    if v_draw then
      return 'push';
    elsif v_home_win then
      return case
        when v_outcome in ('home') or v_outcome = lower(coalesce(p_home_team, '')) then 'won'
        else 'lost'
      end;
    else
      return case
        when v_outcome in ('away') or v_outcome = lower(coalesce(p_away_team, '')) then 'won'
        else 'lost'
      end;
    end if;
  end if;

  if p_market in ('totals', 'alternate_totals') then
    if p_point is null then
      return 'void';
    end if;
    if v_total > p_point then
      return case when v_outcome like 'over %' then 'won' else 'lost' end;
    elsif v_total < p_point then
      return case when v_outcome like 'under %' then 'won' else 'lost' end;
    else
      return 'push';
    end if;
  end if;

  if p_market = 'btts' then
    if p_home_score > 0 and p_away_score > 0 then
      return case when v_outcome in ('yes', 'y') then 'won' else 'lost' end;
    else
      return case when v_outcome in ('no', 'n') then 'won' else 'lost' end;
    end if;
  end if;

  if p_market = 'spreads' then
    if p_point is null then
      return 'void';
    end if;
    if v_outcome in ('home') or v_outcome = lower(coalesce(p_home_team, '')) then
      if (p_home_score + p_point) > p_away_score then
        return 'won';
      elsif (p_home_score + p_point) < p_away_score then
        return 'lost';
      else
        return 'push';
      end if;
    elsif v_outcome in ('away') or v_outcome = lower(coalesce(p_away_team, '')) then
      if (p_away_score + p_point) > p_home_score then
        return 'won';
      elsif (p_away_score + p_point) < p_home_score then
        return 'lost';
      else
        return 'push';
      end if;
    end if;
  end if;

  return 'void';
end;
$$;

create or replace function public.settle_open_bets(
  p_event_ids text[] default null
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role text;
  v_updated_legs int := 0;
  v_settled_bets int := 0;
  v_now timestamptz := now();
  v_bet record;
  v_lost int;
  v_pending int;
  v_won int;
  v_void int;
  v_win_odds numeric;
  v_payout numeric;
  v_updated int;
  v_tx_id uuid;
  v_reference text;
begin
  v_role := auth.role();
  if v_role <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  update public.bet_legs l
  set status = public.evaluate_bet_leg(
        l.market,
        l.outcome,
        l.point,
        l.home_team,
        l.away_team,
        r.home_score,
        r.away_score
      ),
      settled_at = v_now
  from public.event_results r
  where l.status = 'pending'
    and r.event_id = l.event_id
    and r.completed = true
    and (p_event_ids is null or l.event_id = any(p_event_ids));

  get diagnostics v_updated_legs = row_count;

  for v_bet in
    select b.id, b.user_id, b.stake, b.currency
    from public.bets b
    where b.status in ('pending', 'open')
      and not exists (
        select 1 from public.bet_legs l
        where l.bet_id = b.id and l.status = 'pending'
      )
  loop
    select
      sum(case when status = 'lost' then 1 else 0 end),
      sum(case when status = 'pending' then 1 else 0 end),
      sum(case when status = 'won' then 1 else 0 end),
      sum(case when status in ('void', 'push') then 1 else 0 end),
      exp(sum(ln(case when status = 'won' then odds else 1 end)))::numeric
    into v_lost, v_pending, v_won, v_void, v_win_odds
    from public.bet_legs
    where bet_id = v_bet.id;

    v_lost := coalesce(v_lost, 0);
    v_won := coalesce(v_won, 0);
    v_void := coalesce(v_void, 0);
    v_win_odds := coalesce(v_win_odds, 1);

    if v_lost > 0 then
      v_payout := 0;
      update public.bets
      set status = 'lost', result = 'lost', payout = v_payout, settled_at = v_now
      where id = v_bet.id and status in ('pending', 'open');
    elsif v_won = 0 and v_void > 0 then
      v_payout := v_bet.stake;
      update public.bets
      set status = 'void', result = 'void', payout = v_payout, settled_at = v_now
      where id = v_bet.id and status in ('pending', 'open');
    else
      v_payout := round(v_bet.stake * v_win_odds, 2);
      update public.bets
      set status = 'won', result = 'won', payout = v_payout, settled_at = v_now
      where id = v_bet.id and status in ('pending', 'open');
    end if;

    get diagnostics v_updated = row_count;

    if v_updated > 0 and v_payout > 0 then
      v_reference := 'bet-payout-' || v_bet.id::text;
      insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
      values (v_bet.user_id, v_reference, v_payout, coalesce(v_bet.currency, 'NGN'), 'bet', 'success')
      on conflict (reference) do nothing
      returning id into v_tx_id;

      if v_tx_id is not null then
        update public.wallets
        set balance = coalesce(balance, 0) + v_payout,
            updated_at = now()
        where user_id = v_bet.user_id;
      end if;
    end if;

    v_settled_bets := v_settled_bets + 1;
  end loop;

  return json_build_object('updated_legs', v_updated_legs, 'settled_bets', v_settled_bets);
end;
$$;

create or replace function public.settle_jackpot(
  p_jackpot_id uuid,
  p_results jsonb
)
returns json
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role text;
  v_pick_count int;
  v_prize_pool numeric;
  v_winners int;
  v_payout numeric;
  v_entry record;
  v_correct int;
  v_reference text;
begin
  v_role := auth.role();
  if v_role <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select pick_count, prize_pool
  into v_pick_count, v_prize_pool
  from public.jackpots
  where id = p_jackpot_id
  for update;

  if v_pick_count is null then
    raise exception 'Jackpot not found';
  end if;

  insert into public.jackpot_results (jackpot_id, results)
  values (p_jackpot_id, p_results)
  on conflict (jackpot_id) do update
    set results = excluded.results,
        settled_at = now();

  v_winners := 0;

  for v_entry in
    select id, user_id, selections
    from public.jackpot_entries
    where jackpot_id = p_jackpot_id
  loop
    select count(*) into v_correct
    from jsonb_each_text(v_entry.selections) s
    join jsonb_each_text(p_results) r on r.key = s.key and r.value = s.value;

    if v_correct = v_pick_count then
      v_winners := v_winners + 1;
      update public.jackpot_entries
      set status = 'won',
          correct_count = v_correct
      where id = v_entry.id;
    else
      update public.jackpot_entries
      set status = 'lost',
          correct_count = v_correct
      where id = v_entry.id;
    end if;
  end loop;

  if v_winners > 0 then
    v_payout := v_prize_pool / v_winners;

    for v_entry in
      select id, user_id
      from public.jackpot_entries
      where jackpot_id = p_jackpot_id and status = 'won'
    loop
      insert into public.jackpot_payouts (jackpot_id, entry_id, user_id, amount)
      values (p_jackpot_id, v_entry.id, v_entry.user_id, v_payout)
      on conflict do nothing;

      update public.wallets
      set balance = coalesce(balance, 0) + v_payout,
          updated_at = now()
      where user_id = v_entry.user_id;

      v_reference := 'jackpot-payout-' || v_entry.id::text;
      insert into public.wallet_transactions (user_id, reference, amount, currency, provider, status)
      values (v_entry.user_id, v_reference, v_payout, 'NGN', 'jackpot', 'success')
      on conflict (reference) do nothing;
    end loop;
  end if;

  update public.jackpots
  set status = 'settled'
  where id = p_jackpot_id;

  return json_build_object('winners', v_winners, 'payout', coalesce(v_payout, 0));
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.auto_topup_settings enable row level security;
alter table public.auto_topup_attempts enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.jackpots enable row level security;
alter table public.jackpot_events enable row level security;
alter table public.jackpot_entries enable row level security;
alter table public.jackpot_results enable row level security;
alter table public.jackpot_payouts enable row level security;
alter table public.bets enable row level security;
alter table public.bet_legs enable row level security;
alter table public.event_results enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles can be updated by owner" on public.profiles;
drop policy if exists "Wallets are viewable by owner" on public.wallets;
drop policy if exists "Wallets can be updated by owner" on public.wallets;
drop policy if exists "Wallets can be inserted by owner" on public.wallets;
drop policy if exists "Wallet transactions are viewable by owner" on public.wallet_transactions;
drop policy if exists "Wallet transactions can be inserted by service role" on public.wallet_transactions;
drop policy if exists "Auto topup settings are viewable by owner" on public.auto_topup_settings;
drop policy if exists "Auto topup attempts are viewable by owner" on public.auto_topup_attempts;
drop policy if exists "Withdrawal requests are viewable by owner" on public.withdrawal_requests;
drop policy if exists "Withdrawal requests can be inserted by owner" on public.withdrawal_requests;
drop policy if exists "Jackpots are viewable by all" on public.jackpots;
drop policy if exists "Jackpot events are viewable by all" on public.jackpot_events;
drop policy if exists "Jackpot results are viewable by all" on public.jackpot_results;
drop policy if exists "Jackpot entries are viewable by owner" on public.jackpot_entries;
drop policy if exists "Jackpot entries can be inserted by owner" on public.jackpot_entries;
drop policy if exists "Jackpot payouts are viewable by owner" on public.jackpot_payouts;
drop policy if exists "Bets are viewable by owner" on public.bets;
drop policy if exists "Bets can be inserted by owner" on public.bets;
drop policy if exists "Bets can be inserted by service role" on public.bets;
drop policy if exists "Bets can be updated by service role" on public.bets;
drop policy if exists "Bet legs are viewable by owner" on public.bet_legs;
drop policy if exists "Bet legs can be inserted by service role" on public.bet_legs;
drop policy if exists "Bet legs can be updated by service role" on public.bet_legs;
drop policy if exists "Event results are viewable by all" on public.event_results;

create policy "Profiles are viewable by owner"
on public.profiles for select
using (auth.uid() = id);

create policy "Profiles can be updated by owner"
on public.profiles for update
using (auth.uid() = id);

create policy "Wallets are viewable by owner"
on public.wallets for select
using (auth.uid() = user_id);

create policy "Wallets can be inserted by owner"
on public.wallets for insert
with check (auth.uid() = user_id);

create policy "Wallets can be updated by service role"
on public.wallets for update
using (auth.role() = 'service_role');

create policy "Wallet transactions are viewable by owner"
on public.wallet_transactions for select
using (auth.uid() = user_id);

create policy "Wallet transactions can be inserted by service role"
on public.wallet_transactions for insert
with check (auth.role() = 'service_role');

create policy "Auto topup settings are viewable by owner"
on public.auto_topup_settings for select
using (auth.uid() = user_id);

create policy "Auto topup attempts are viewable by owner"
on public.auto_topup_attempts for select
using (auth.uid() = user_id);

create policy "Withdrawal requests are viewable by owner"
on public.withdrawal_requests for select
using (auth.uid() = user_id);

create policy "Withdrawal requests can be inserted by owner"
on public.withdrawal_requests for insert
with check (auth.uid() = user_id);

create policy "Jackpots are viewable by all"
on public.jackpots for select
using (true);

create policy "Jackpot events are viewable by all"
on public.jackpot_events for select
using (true);

create policy "Jackpot results are viewable by all"
on public.jackpot_results for select
using (true);

create policy "Jackpot entries are viewable by owner"
on public.jackpot_entries for select
using (auth.uid() = user_id);

create policy "Jackpot entries can be inserted by owner"
on public.jackpot_entries for insert
with check (auth.uid() = user_id);

create policy "Jackpot payouts are viewable by owner"
on public.jackpot_payouts for select
using (auth.uid() = user_id);

create policy "Bets are viewable by owner"
on public.bets for select
using (auth.uid() = user_id);

create policy "Bets can be inserted by service role"
on public.bets for insert
with check (auth.role() = 'service_role');

create policy "Bets can be updated by service role"
on public.bets for update
using (auth.role() = 'service_role');

create policy "Bet legs are viewable by owner"
on public.bet_legs for select
using (auth.uid() = user_id);

create policy "Bet legs can be inserted by service role"
on public.bet_legs for insert
with check (auth.role() = 'service_role');

create policy "Bet legs can be updated by service role"
on public.bet_legs for update
using (auth.role() = 'service_role');

create policy "Event results are viewable by all"
on public.event_results for select
using (true);

create index if not exists jackpot_events_jackpot_id_idx on public.jackpot_events (jackpot_id);
create index if not exists jackpot_entries_jackpot_id_idx on public.jackpot_entries (jackpot_id);
create index if not exists jackpot_entries_user_id_idx on public.jackpot_entries (user_id);
create index if not exists withdrawal_requests_user_id_idx on public.withdrawal_requests (user_id);
create index if not exists auto_topup_attempts_user_id_idx on public.auto_topup_attempts (user_id);
create index if not exists auto_topup_attempts_status_idx on public.auto_topup_attempts (status);
create index if not exists bets_user_id_idx on public.bets (user_id);
create index if not exists bets_status_idx on public.bets (status);
create index if not exists bet_legs_bet_id_idx on public.bet_legs (bet_id);
create index if not exists bet_legs_event_id_idx on public.bet_legs (event_id);
create index if not exists bet_legs_user_id_idx on public.bet_legs (user_id);
create index if not exists event_results_event_id_idx on public.event_results (event_id);

