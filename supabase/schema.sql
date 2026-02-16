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
  status text default 'pending',
  created_at timestamptz default now()
);

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

create or replace function public.place_jackpot_entry(
  p_jackpot_id uuid,
  p_selections jsonb
)
returns json
language plpgsql
security definer
set search_path = public
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

create or replace function public.settle_jackpot(
  p_jackpot_id uuid,
  p_results jsonb
)
returns json
language plpgsql
security definer
set search_path = public
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
alter table public.jackpots enable row level security;
alter table public.jackpot_events enable row level security;
alter table public.jackpot_entries enable row level security;
alter table public.jackpot_results enable row level security;
alter table public.jackpot_payouts enable row level security;
alter table public.bets enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles can be updated by owner" on public.profiles;
drop policy if exists "Wallets are viewable by owner" on public.wallets;
drop policy if exists "Wallets can be updated by owner" on public.wallets;
drop policy if exists "Wallets can be inserted by owner" on public.wallets;
drop policy if exists "Wallet transactions are viewable by owner" on public.wallet_transactions;
drop policy if exists "Jackpots are viewable by all" on public.jackpots;
drop policy if exists "Jackpot events are viewable by all" on public.jackpot_events;
drop policy if exists "Jackpot results are viewable by all" on public.jackpot_results;
drop policy if exists "Jackpot entries are viewable by owner" on public.jackpot_entries;
drop policy if exists "Jackpot entries can be inserted by owner" on public.jackpot_entries;
drop policy if exists "Jackpot payouts are viewable by owner" on public.jackpot_payouts;
drop policy if exists "Bets are viewable by owner" on public.bets;
drop policy if exists "Bets can be inserted by owner" on public.bets;

create policy "Profiles are viewable by owner"
on public.profiles for select
using (auth.uid() = id);

create policy "Profiles can be updated by owner"
on public.profiles for update
using (auth.uid() = id);

create policy "Wallets are viewable by owner"
on public.wallets for select
using (auth.uid() = user_id);

create policy "Wallets can be updated by owner"
on public.wallets for update
using (auth.uid() = user_id);

create policy "Wallets can be inserted by owner"
on public.wallets for insert
with check (auth.uid() = user_id);

create policy "Wallet transactions are viewable by owner"
on public.wallet_transactions for select
using (auth.uid() = user_id);

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

create policy "Bets can be inserted by owner"
on public.bets for insert
with check (auth.uid() = user_id);

create index if not exists jackpot_events_jackpot_id_idx on public.jackpot_events (jackpot_id);
create index if not exists jackpot_entries_jackpot_id_idx on public.jackpot_entries (jackpot_id);
create index if not exists jackpot_entries_user_id_idx on public.jackpot_entries (user_id);
