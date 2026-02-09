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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
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

create policy "Bets are viewable by owner"
on public.bets for select
using (auth.uid() = user_id);

create policy "Bets can be inserted by owner"
on public.bets for insert
with check (auth.uid() = user_id);
