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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.bets enable row level security;

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

create policy "Bets are viewable by owner"
on public.bets for select
using (auth.uid() = user_id);

create policy "Bets can be inserted by owner"
on public.bets for insert
with check (auth.uid() = user_id);
