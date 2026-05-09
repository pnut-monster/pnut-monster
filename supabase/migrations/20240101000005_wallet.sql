create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) unique,
  loaded_balance numeric(10,2) not null default 0,
  bonus_balance numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.update_updated_at();

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id),
  type text not null check (type in ('topup', 'bonus', 'debit', 'refund')),
  amount numeric(10,2) not null,
  balance_after numeric(10,2) not null,
  description text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_wallets_user on public.wallets(user_id);
create index idx_wallet_transactions_wallet on public.wallet_transactions(wallet_id);
create index idx_wallet_transactions_created on public.wallet_transactions(created_at desc);

-- Auto-create wallet for new profiles
create or replace function public.handle_new_profile_wallet()
returns trigger as $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_created_wallet
  after insert on public.profiles
  for each row execute function public.handle_new_profile_wallet();

-- Topup wallet function (atomic)
create or replace function public.topup_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_bonus numeric default 0,
  p_reference_id text default null
)
returns jsonb as $$
declare
  v_wallet wallets%rowtype;
  v_new_loaded numeric;
  v_new_bonus numeric;
begin
  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    raise exception 'Wallet not found for user %', p_user_id;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;
  v_new_bonus := v_wallet.bonus_balance + p_bonus;

  update wallets set loaded_balance = v_new_loaded, bonus_balance = v_new_bonus where id = v_wallet.id;

  -- Log topup transaction
  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_new_bonus, 'Wallet top-up', p_reference_id);

  -- Log bonus if any
  if p_bonus > 0 then
    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (v_wallet.id, 'bonus', p_bonus, v_new_loaded + v_new_bonus, 'Top-up bonus', p_reference_id);
  end if;

  return jsonb_build_object(
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_new_bonus,
    'total_balance', v_new_loaded + v_new_bonus
  );
end;
$$ language plpgsql security definer;
