-- Creates all tables required by billing.js and bookingRoutes.js.
-- Safe to re-run.

begin;

create extension if not exists pgcrypto;

create table if not exists public.token_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  region text not null default 'india',
  currency text not null default 'INR',
  balance_tokens integer not null default 0 check (balance_tokens >= 0),
  lifetime_credited integer not null default 0,
  lifetime_debited integer not null default 0,
  last_credited_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.token_wallets enable row level security;

drop policy if exists "wallet_self_read" on public.token_wallets;
create policy "wallet_self_read" on public.token_wallets
  for select using (auth.uid() = user_id);

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid not null references public.token_wallets(user_id) on delete cascade,
  direction text not null check (direction in ('credit', 'debit')),
  reason text not null,
  quantity integer not null check (quantity > 0),
  idempotency_key text not null unique,
  payment_order_id uuid,
  session_booking_id uuid,
  related_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.token_ledger enable row level security;

drop policy if exists "ledger_self_read" on public.token_ledger;
create policy "ledger_self_read" on public.token_ledger
  for select using (auth.uid() = wallet_user_id);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete restrict,
  practitioner_user_id uuid references auth.users(id) on delete set null,
  relationship_id uuid,
  provider text not null check (provider in ('stripe', 'razorpay')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'expired')),
  product_type text not null check (product_type in ('token_pack', 'session_unlock')),
  product_code text not null,
  quantity integer not null default 1 check (quantity >= 1),
  currency text not null,
  amount_minor integer not null check (amount_minor > 0),
  tokens_to_credit integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  provider_order_id text,
  checkout_url text,
  checkout_payload jsonb not null default '{}'::jsonb,
  provider_payment_id text,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payment_orders_athlete_idx on public.payment_orders(athlete_user_id);
create index if not exists payment_orders_provider_ref_idx on public.payment_orders(provider, provider_order_id);

alter table public.payment_orders enable row level security;

drop policy if exists "order_athlete_read" on public.payment_orders;
create policy "order_athlete_read" on public.payment_orders
  for select using (auth.uid() = athlete_user_id);

drop policy if exists "order_practitioner_read" on public.payment_orders;
create policy "order_practitioner_read" on public.payment_orders
  for select using (auth.uid() = practitioner_user_id);

alter table public.token_ledger
  drop constraint if exists token_ledger_payment_order_fk;

alter table public.token_ledger
  add constraint token_ledger_payment_order_fk
  foreign key (payment_order_id) references public.payment_orders(id) on delete set null;

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'razorpay')),
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.practitioner_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'razorpay')),
  provider_account_id text,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'pending_kyc', 'active', 'restricted', 'disabled')),
  bank_account_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.practitioner_payout_accounts enable row level security;

drop policy if exists "payout_account_self_read" on public.practitioner_payout_accounts;
create policy "payout_account_self_read" on public.practitioner_payout_accounts
  for select using (auth.uid() = practitioner_user_id);

create table if not exists public.practitioner_athlete_relationships (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'archived', 'suspended')),
  linked_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_reason text,
  unique (practitioner_user_id, athlete_user_id)
);

create index if not exists par_practitioner_idx on public.practitioner_athlete_relationships(practitioner_user_id, status);

alter table public.practitioner_athlete_relationships enable row level security;

drop policy if exists "relationship_practitioner_read" on public.practitioner_athlete_relationships;
create policy "relationship_practitioner_read" on public.practitioner_athlete_relationships
  for select using (auth.uid() = practitioner_user_id);

drop policy if exists "relationship_athlete_read" on public.practitioner_athlete_relationships;
create policy "relationship_athlete_read" on public.practitioner_athlete_relationships
  for select using (auth.uid() = athlete_user_id);

alter table public.payment_orders
  drop constraint if exists payment_orders_relationship_fk;

alter table public.payment_orders
  add constraint payment_orders_relationship_fk
  foreign key (relationship_id) references public.practitioner_athlete_relationships(id) on delete set null;

create table if not exists public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  room_provider text not null default 'daily.co',
  room_url text,
  room_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.session_bookings (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid references public.practitioner_athlete_relationships(id) on delete set null,
  athlete_user_id uuid not null references auth.users(id) on delete restrict,
  practitioner_user_id uuid not null references auth.users(id) on delete restrict,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  video_room_id uuid references public.video_rooms(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),
  token_cost integer not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists session_bookings_athlete_idx on public.session_bookings(athlete_user_id);
create index if not exists session_bookings_practitioner_idx on public.session_bookings(practitioner_user_id);

alter table public.session_bookings enable row level security;

drop policy if exists "booking_parties_read" on public.session_bookings;
create policy "booking_parties_read" on public.session_bookings
  for select using (auth.uid() = athlete_user_id or auth.uid() = practitioner_user_id);

alter table public.token_ledger
  drop constraint if exists token_ledger_session_booking_fk;

alter table public.token_ledger
  add constraint token_ledger_session_booking_fk
  foreign key (session_booking_id) references public.session_bookings(id) on delete set null;

create table if not exists public.session_booking_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid references public.practitioner_athlete_relationships(id) on delete set null,
  requested_start timestamptz,
  requested_end timestamptz,
  note text,
  token_quote integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sbr_practitioner_idx on public.session_booking_requests(practitioner_user_id, status);

alter table public.session_booking_requests enable row level security;

drop policy if exists "sbr_athlete_read" on public.session_booking_requests;
create policy "sbr_athlete_read" on public.session_booking_requests
  for select using (auth.uid() = athlete_user_id);

drop policy if exists "sbr_practitioner_read" on public.session_booking_requests;
create policy "sbr_practitioner_read" on public.session_booking_requests
  for select using (auth.uid() = practitioner_user_id);

create table if not exists public.practitioner_availability_slots (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  unique (practitioner_user_id, day_of_week, start_minute, end_minute)
);

alter table public.practitioner_availability_slots enable row level security;

drop policy if exists "availability_practitioner_manage" on public.practitioner_availability_slots;
create policy "availability_practitioner_manage" on public.practitioner_availability_slots
  for all using (auth.uid() = practitioner_user_id);

drop policy if exists "availability_athlete_read" on public.practitioner_availability_slots;
create policy "availability_athlete_read" on public.practitioner_availability_slots
  for select using (true);

create or replace function public.touch_session_booking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_session_booking_updated_at on public.session_bookings;

create trigger trg_session_booking_updated_at
before update on public.session_bookings
for each row
execute function public.touch_session_booking_updated_at();

commit;
