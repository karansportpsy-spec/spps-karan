begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('athlete', 'practitioner', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'relationship_status_v2') then
    create type relationship_status_v2 as enum ('pending', 'active', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'wallet_entry_direction') then
    create type wallet_entry_direction as enum ('credit', 'debit');
  end if;
  if not exists (select 1 from pg_type where typname = 'wallet_entry_reason') then
    create type wallet_entry_reason as enum (
      'token_purchase',
      'message_send',
      'session_booking',
      'session_refund',
      'manual_adjustment',
      'relationship_archive_credit'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'billing_provider') then
    create type billing_provider as enum ('stripe', 'razorpay');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_order_status_v2') then
    create type payment_order_status_v2 as enum ('created', 'pending', 'paid', 'failed', 'cancelled', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status_v2') then
    create type booking_status_v2 as enum ('pending_payment', 'confirmed', 'completed', 'cancelled', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'message_access_level') then
    create type message_access_level as enum ('read_only', 'active');
  end if;
end $$;

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  email citext not null unique,
  display_name text,
  timezone text not null default 'UTC',
  country_code text not null default 'IN',
  locale text not null default 'en-IN',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists practitioner_profiles (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  professional_title text,
  specializations text[] not null default '{}'::text[],
  bio text,
  years_of_practice integer,
  primary_currency text not null default 'INR',
  payout_region text not null default 'india',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists athlete_profiles (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  sport text,
  team text,
  date_of_birth date,
  phone text,
  emergency_contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists practitioner_athlete_relationships (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references user_profiles(id) on delete cascade,
  athlete_user_id uuid not null references user_profiles(id) on delete cascade,
  status relationship_status_v2 not null default 'pending',
  message_access message_access_level not null default 'active',
  email_verified_at timestamptz,
  linked_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  archived_reason text,
  switched_from_relationship_id uuid references practitioner_athlete_relationships(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practitioner_athlete_distinct check (practitioner_user_id <> athlete_user_id)
);

create unique index if not exists idx_relationships_active_unique
  on practitioner_athlete_relationships(athlete_user_id)
  where status = 'active';

create index if not exists idx_relationships_practitioner_status
  on practitioner_athlete_relationships(practitioner_user_id, status, linked_at desc);

create index if not exists idx_relationships_athlete_status
  on practitioner_athlete_relationships(athlete_user_id, status, linked_at desc);

create table if not exists relationship_archives (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references practitioner_athlete_relationships(id) on delete cascade,
  athlete_user_id uuid not null references user_profiles(id) on delete cascade,
  practitioner_user_id uuid not null references user_profiles(id) on delete cascade,
  archive_reason text,
  archive_snapshot jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now()
);

create table if not exists conversation_threads (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references practitioner_athlete_relationships(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_conversation_threads_relationship
  on conversation_threads(relationship_id);

create table if not exists token_wallets (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  region text not null default 'india',
  currency text not null default 'INR',
  balance_tokens integer not null default 0,
  lifetime_credited integer not null default 0,
  lifetime_debited integer not null default 0,
  last_credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint token_wallets_balance_non_negative check (balance_tokens >= 0)
);

create table if not exists token_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid not null references token_wallets(user_id) on delete cascade,
  direction wallet_entry_direction not null,
  reason wallet_entry_reason not null,
  quantity integer not null check (quantity > 0),
  idempotency_key text not null,
  payment_order_id uuid,
  session_booking_id uuid,
  related_user_id uuid references user_profiles(id) on delete set null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (wallet_user_id, idempotency_key)
);

create index if not exists idx_token_ledger_wallet_created
  on token_ledger(wallet_user_id, created_at desc);

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references user_profiles(id) on delete cascade,
  practitioner_user_id uuid references user_profiles(id) on delete set null,
  relationship_id uuid references practitioner_athlete_relationships(id) on delete set null,
  provider billing_provider not null,
  status payment_order_status_v2 not null default 'created',
  product_type text not null check (product_type in ('token_pack', 'session_unlock')),
  product_code text not null,
  quantity integer not null default 1 check (quantity > 0),
  currency text not null,
  amount_minor integer not null check (amount_minor >= 0),
  tokens_to_credit integer not null default 0 check (tokens_to_credit >= 0),
  provider_order_id text,
  provider_payment_id text,
  checkout_url text,
  checkout_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_payment_orders_provider_order
  on payment_orders(provider, provider_order_id)
  where provider_order_id is not null;

create index if not exists idx_payment_orders_athlete_created
  on payment_orders(athlete_user_id, created_at desc);

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists practitioner_payout_accounts (
  practitioner_user_id uuid primary key references user_profiles(id) on delete cascade,
  provider billing_provider not null,
  provider_account_id text,
  onboarding_status text not null default 'pending',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  bank_account_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists practitioner_availability (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references user_profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_practitioner_availability_active
  on practitioner_availability(practitioner_user_id, day_of_week)
  where is_active = true;

create table if not exists video_rooms (
  id uuid primary key default gen_random_uuid(),
  room_provider text not null default 'external',
  room_url text not null,
  room_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists session_booking_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references user_profiles(id) on delete cascade,
  practitioner_user_id uuid not null references user_profiles(id) on delete cascade,
  relationship_id uuid not null references practitioner_athlete_relationships(id) on delete cascade,
  requested_start timestamptz,
  requested_end timestamptz,
  status booking_status_v2 not null default 'pending_payment',
  note text,
  token_quote integer not null default 10,
  payment_order_id uuid references payment_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_bookings (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references practitioner_athlete_relationships(id) on delete cascade,
  athlete_user_id uuid not null references user_profiles(id) on delete cascade,
  practitioner_user_id uuid not null references user_profiles(id) on delete cascade,
  booking_request_id uuid references session_booking_requests(id) on delete set null,
  payment_order_id uuid references payment_orders(id) on delete set null,
  video_room_id uuid references video_rooms(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'UTC',
  status booking_status_v2 not null default 'confirmed',
  token_cost integer not null default 10,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_bookings_time_order check (scheduled_end > scheduled_start)
);

create index if not exists idx_session_bookings_practitioner_time
  on session_bookings(practitioner_user_id, scheduled_start desc);

create index if not exists idx_session_bookings_athlete_time
  on session_bookings(athlete_user_id, scheduled_start desc);

create or replace function current_app_role()
returns app_role
language sql
stable
as $$
  select role from user_profiles where id = auth.uid()
$$;

create or replace function has_active_relationship(p_practitioner uuid, p_athlete uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from practitioner_athlete_relationships r
    where r.practitioner_user_id = p_practitioner
      and r.athlete_user_id = p_athlete
      and r.status = 'active'
  )
$$;

create or replace function wallet_balance(p_user_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(balance_tokens, 0) from token_wallets where user_id = p_user_id
$$;

alter table user_profiles enable row level security;
alter table practitioner_profiles enable row level security;
alter table athlete_profiles enable row level security;
alter table practitioner_athlete_relationships enable row level security;
alter table relationship_archives enable row level security;
alter table conversation_threads enable row level security;
alter table token_wallets enable row level security;
alter table token_ledger enable row level security;
alter table payment_orders enable row level security;
alter table payment_webhook_events enable row level security;
alter table practitioner_payout_accounts enable row level security;
alter table practitioner_availability enable row level security;
alter table video_rooms enable row level security;
alter table session_booking_requests enable row level security;
alter table session_bookings enable row level security;

create policy "user_profiles_self" on user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "practitioner_profiles_self" on practitioner_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "athlete_profiles_self" on athlete_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "relationships_participants_read" on practitioner_athlete_relationships
  for select using (auth.uid() in (practitioner_user_id, athlete_user_id));

create policy "relationships_practitioner_insert" on practitioner_athlete_relationships
  for insert with check (auth.uid() = practitioner_user_id and current_app_role() = 'practitioner');

create policy "relationships_participants_update" on practitioner_athlete_relationships
  for update using (auth.uid() in (practitioner_user_id, athlete_user_id))
  with check (auth.uid() in (practitioner_user_id, athlete_user_id));

create policy "relationship_archives_participants_read" on relationship_archives
  for select using (auth.uid() in (practitioner_user_id, athlete_user_id));

create policy "conversation_threads_participants" on conversation_threads
  for select using (
    exists (
      select 1
      from practitioner_athlete_relationships r
      where r.id = relationship_id
        and auth.uid() in (r.practitioner_user_id, r.athlete_user_id)
    )
  );

create policy "wallets_owner_only" on token_wallets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "token_ledger_owner_only" on token_ledger
  for select using (auth.uid() = wallet_user_id);

create policy "payment_orders_participants" on payment_orders
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

create policy "payment_orders_athlete_insert" on payment_orders
  for insert with check (auth.uid() = athlete_user_id and current_app_role() = 'athlete');

create policy "payout_accounts_practitioner_only" on practitioner_payout_accounts
  for all using (auth.uid() = practitioner_user_id) with check (auth.uid() = practitioner_user_id);

create policy "availability_read_for_active_relationships" on practitioner_availability
  for select using (
    auth.uid() = practitioner_user_id
    or exists (
      select 1 from practitioner_athlete_relationships r
      where r.practitioner_user_id = practitioner_user_id
        and r.athlete_user_id = auth.uid()
        and r.status = 'active'
    )
  );

create policy "availability_practitioner_manage" on practitioner_availability
  for all using (auth.uid() = practitioner_user_id) with check (auth.uid() = practitioner_user_id);

create policy "session_booking_requests_participants" on session_booking_requests
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

create policy "session_booking_requests_athlete_insert" on session_booking_requests
  for insert with check (auth.uid() = athlete_user_id and current_app_role() = 'athlete');

create policy "session_booking_requests_participants_update" on session_booking_requests
  for update using (auth.uid() in (athlete_user_id, practitioner_user_id))
  with check (auth.uid() in (athlete_user_id, practitioner_user_id));

create policy "session_bookings_participants" on session_bookings
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

create policy "video_rooms_participants" on video_rooms
  for select using (
    exists (
      select 1
      from session_bookings b
      where b.video_room_id = id
        and auth.uid() in (b.athlete_user_id, b.practitioner_user_id)
    )
  );

notify pgrst, 'reload schema';

commit;
