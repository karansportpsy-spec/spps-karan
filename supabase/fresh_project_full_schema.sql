-- ============================================================
-- SPPS Fresh Project Bootstrap Schema
-- Project: dual practitioner-athlete sport psychology suite
-- Target: fresh Supabase project + backend-compatible database
-- Safe to run on a brand-new project.
-- ============================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Core enums
-- ------------------------------------------------------------

do $$
begin
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

-- ------------------------------------------------------------
-- Identity / org
-- ------------------------------------------------------------

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'club',
  country text not null default 'IN',
  state_province text,
  city text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('practitioner', 'athlete', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('practitioner', 'athlete', 'admin')),
  email citext not null unique,
  display_name text,
  timezone text not null default 'Asia/Kolkata',
  country_code text not null default 'IN',
  locale text not null default 'en-IN',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
$$;

create table if not exists public.practitioners (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'sport_psychologist'
    check (role in ('sport_psychologist', 'counsellor', 'admin')),
  professional_title text,
  avatar_url text,
  phone text,
  bio text,
  organisation_id uuid references public.organisations(id) on delete set null,
  hipaa_acknowledged boolean not null default false,
  compliance_completed boolean not null default false,
  notification_email boolean not null default true,
  notification_sms boolean not null default false,
  primary_currency text not null default 'INR',
  payout_region text not null default 'india',
  specializations text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practitioner_profiles (
  user_id uuid primary key references public.practitioners(id) on delete cascade,
  professional_title text,
  specializations text[] not null default '{}'::text[],
  bio text,
  years_of_practice integer,
  primary_currency text not null default 'INR',
  payout_region text not null default 'india',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Athletes and portal
-- ------------------------------------------------------------

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid references public.practitioners(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email citext,
  phone text,
  date_of_birth date,
  sport text not null default '',
  team text,
  position text,
  uid_code text unique,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'on_hold', 'unverified', 'linked', 'discontinued')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'moderate', 'high', 'critical')),
  avatar_url text,
  notes text,
  timezone text not null default 'Asia/Kolkata',
  language text not null default 'en',
  emergency_contact_name text,
  emergency_contact_phone text,
  is_portal_activated boolean not null default false,
  portal_activated_at timestamptz,
  portal_activation_email_sent_at timestamptz,
  portal_user_id uuid unique references auth.users(id) on delete set null,
  portal_last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Merged table: supports legacy portal code + new profile metadata.
create table if not exists public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  practitioner_id uuid references public.practitioners(id) on delete cascade,
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  email citext,
  display_name text,
  first_name text not null default '',
  last_name text not null default '',
  sport text,
  team text,
  date_of_birth date,
  phone text,
  emergency_contact jsonb not null default '{}'::jsonb,
  portal_enabled boolean not null default false,
  portal_enabled_at timestamptz,
  last_active_at timestamptz,
  notification_email boolean not null default true,
  notification_push boolean not null default true,
  timezone text not null default 'Asia/Kolkata',
  language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_role text not null default 'athlete'
    check (submitted_by_role in ('athlete', 'practitioner')),
  source text not null default 'athlete_portal'
    check (source in ('athlete_portal', 'practitioner_intake')),
  intake_status text not null default 'submitted'
    check (intake_status in ('pending', 'submitted', 'reviewed')),
  signed_by text,
  signed_at timestamptz,
  guardian_name text,
  guardian_relationship text,
  guardian_email text,
  guardian_phone text,
  intake_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practitioner_id, athlete_id, source)
);

create table if not exists public.practitioner_athlete_links (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  status text not null default 'active'
    check (status in ('pending', 'active', 'archived_by_practitioner', 'archived_by_athlete')),
  linked_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_practitioner_athlete_links_active
  on public.practitioner_athlete_links(practitioner_id, athlete_id)
  where status = 'active';

create table if not exists public.practitioner_athlete_relationships (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  athlete_record_id uuid references public.athletes(id) on delete cascade,
  legacy_link_id uuid unique references public.practitioner_athlete_links(id) on delete set null,
  status relationship_status_v2 not null default 'pending',
  message_access message_access_level not null default 'active',
  email_verified_at timestamptz,
  linked_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  archived_reason text,
  switched_from_relationship_id uuid references public.practitioner_athlete_relationships(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practitioner_athlete_relationships_distinct check (practitioner_user_id <> athlete_user_id)
);

create unique index if not exists idx_relationships_active_unique
  on public.practitioner_athlete_relationships(athlete_user_id)
  where status = 'active';

create index if not exists idx_relationships_practitioner_status
  on public.practitioner_athlete_relationships(practitioner_user_id, status, linked_at desc);

create index if not exists idx_relationships_athlete_status
  on public.practitioner_athlete_relationships(athlete_user_id, status, linked_at desc);

create table if not exists public.relationship_archives (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.practitioner_athlete_relationships(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  archive_reason text,
  archive_snapshot jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now()
);

create table if not exists public.athlete_invites (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  email citext not null,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  accepted_at timestamptz,
  email_sent_at timestamptz,
  email_send_attempts integer not null default 0,
  email_last_error text,
  email_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_athlete_invites_token on public.athlete_invites(token);
create index if not exists idx_athlete_invites_practitioner on public.athlete_invites(practitioner_id);
create index if not exists idx_athlete_invites_athlete_open
  on public.athlete_invites(athlete_id)
  where accepted_at is null;

-- ------------------------------------------------------------
-- Conversations / messaging
-- ------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  practitioner_unread integer not null default 0,
  athlete_unread integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practitioner_id, athlete_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  conversation_key text,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('practitioner', 'athlete', 'admin')),
  receiver_id uuid not null references auth.users(id) on delete cascade,
  receiver_role text not null check (receiver_role in ('practitioner', 'athlete', 'admin')),
  body text not null check (char_length(trim(body)) > 0),
  content text generated always as (body) stored,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_key on public.messages(conversation_key, created_at desc);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_receiver_unread on public.messages(receiver_id, is_read, created_at desc);

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid references public.practitioners(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete cascade,
  title text,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Clinical / performance data
-- ------------------------------------------------------------

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_type text not null default 'individual'
    check (session_type in ('individual', 'group', 'crisis', 'assessment', 'follow_up')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 50,
  location text,
  presenting_issues text[],
  goals text,
  interventions_used text[],
  notes text,
  risk_assessment text check (risk_assessment in ('low', 'moderate', 'high', 'critical')),
  follow_up_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  mood_score integer check (mood_score between 1 and 10),
  stress_score integer check (stress_score between 1 and 10),
  sleep_score integer check (sleep_score between 1 and 10),
  motivation_score integer check (motivation_score between 1 and 10),
  readiness_score integer check (readiness_score between 1 and 10),
  notes text,
  flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  tool text not null,
  administered_at timestamptz not null default now(),
  scores jsonb not null default '{}'::jsonb,
  total_score numeric,
  interpretation text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.psychophysiology (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  record_type text not null default 'manual',
  session_context text,
  hrv jsonb not null default '{}'::jsonb,
  vitals jsonb not null default '{}'::jsonb,
  emg jsonb not null default '[]'::jsonb,
  eeg jsonb not null default '{}'::jsonb,
  gsr jsonb not null default '{}'::jsonb,
  wearable_data jsonb not null default '{}'::jsonb,
  device_used text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.neurocognitive (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  platform text,
  test_date date,
  comparison_group text,
  context text,
  senaptec_scores jsonb not null default '{}'::jsonb,
  custom_metrics jsonb not null default '[]'::jsonb,
  notes text,
  raw_report_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_profiles (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  domain_id text not null,
  scores jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.custom_assessments (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  tool_name text not null,
  tool_version text,
  source text,
  administered_at date not null,
  scales jsonb not null default '[]'::jsonb,
  total_score numeric,
  overall_interpretation text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  category text not null,
  title text not null,
  description text,
  protocol text,
  rating integer check (rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intervention_programs (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  title text not null,
  description text,
  category text,
  duration_weeks integer,
  is_template boolean not null default false,
  milestones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intervention_tasks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.intervention_programs(id) on delete cascade,
  title text not null,
  description text,
  task_type text not null,
  content_url text,
  content_text text,
  week_number integer,
  day_of_week integer,
  duration_minutes integer,
  is_mandatory boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_interventions (
  id uuid primary key default gen_random_uuid(),
  intervention_program_id uuid not null references public.intervention_programs(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_date date,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'paused')),
  completion_percentage numeric(5,2) not null default 0 check (completion_percentage >= 0 and completion_percentage <= 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_programs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.intervention_programs(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('pending', 'active', 'paused', 'completed', 'cancelled')),
  notes text,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intervention_progress (
  id uuid primary key default gen_random_uuid(),
  athlete_intervention_id uuid not null references public.athlete_interventions(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  progress_note text,
  progress_percentage numeric(5,2) not null check (progress_percentage >= 0 and progress_percentage <= 100),
  status text not null check (status in ('in_progress', 'completed', 'blocked')),
  created_at timestamptz not null default now()
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  athlete_program_id uuid references public.athlete_programs(id) on delete cascade,
  athlete_intervention_id uuid references public.athlete_interventions(id) on delete cascade,
  intervention_task_id uuid references public.intervention_tasks(id) on delete cascade,
  status text not null default 'completed' check (status in ('completed', 'skipped', 'partial')),
  reflection text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_daily_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  log_date date not null,
  sleep_hours numeric(4,1),
  sleep_quality integer,
  sleep_notes text,
  training_done boolean not null default false,
  rpe integer,
  training_type text,
  training_minutes integer,
  training_notes text,
  nutrition_quality integer,
  water_litres numeric(4,1),
  nutrition_notes text,
  commitment integer,
  communication integer,
  concentration integer,
  confidence integer,
  control integer,
  five_cs_notes text,
  mood_score integer,
  energy_score integer,
  stress_score integer,
  readiness_score integer,
  general_notes text,
  flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, log_date)
);

create table if not exists public.athlete_session_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  request_type text not null check (request_type in ('session_booking', 'progress_review', 'help_support', 'intervention_feedback', 'goal_update', 'crisis')),
  title text not null,
  description text,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'crisis')),
  preferred_date date,
  preferred_time text,
  status text not null default 'pending' check (status in ('pending', 'seen', 'accepted', 'declined', 'completed')),
  practitioner_response text,
  responded_at timestamptz,
  linked_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  request_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_reports (
  id uuid primary key default gen_random_uuid(),
  report_id uuid,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  duration_hours integer not null default 24,
  is_viewed boolean not null default false,
  viewed_at timestamptz,
  view_count integer not null default 0,
  report_title text,
  report_type text,
  report_content text,
  report_data jsonb not null default '{}'::jsonb,
  is_revoked boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  report_type text not null default 'progress' check (report_type in ('progress', 'assessment_summary', 'session_summary', 'crisis', 'custom')),
  title text not null,
  content text not null,
  generated_at timestamptz not null default now(),
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_reports_report_id_fkey'
  ) then
    alter table public.shared_reports
      add constraint shared_reports_report_id_fkey
      foreign key (report_id)
      references public.reports(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.consent_forms (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  form_type text not null check (char_length(trim(form_type)) >= 2),
  status text not null default 'signed' check (status in ('pending', 'signed', 'expired', 'uploaded')),
  signed_by text not null,
  signed_at timestamptz,
  signed_timestamp timestamptz,
  valid_until timestamptz,
  notes text,
  guardian_name text,
  guardian_relationship text,
  guardian_email text,
  guardian_phone text,
  form_data jsonb not null default '{}'::jsonb,
  digital_signature text,
  signature_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.injury_records (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  injury_name text not null default 'Injury',
  injury_type text,
  body_part text not null default 'Unspecified',
  severity text default 'moderate',
  mechanism text,
  date_of_injury timestamptz not null default now(),
  injury_date date not null default current_date,
  sport_context text,
  training_days_missed integer not null default 0,
  psych_referral boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psych_readiness (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  injury_record_id uuid references public.injury_records(id) on delete set null,
  acl_rsi_scores jsonb not null default '{}'::jsonb,
  acl_rsi_total numeric not null default 0,
  tsk_scores jsonb not null default '{}'::jsonb,
  tsk_total numeric not null default 0,
  sirsi_scores jsonb not null default '{}'::jsonb,
  sirsi_total numeric not null default 0,
  overall_readiness numeric not null default 0,
  ready_to_return boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.injury_psychology_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  injury_record_id uuid references public.injury_records(id) on delete set null,
  mood_score integer check (mood_score between 1 and 10),
  stress_score integer check (stress_score between 1 and 10),
  confidence_score integer check (confidence_score between 1 and 10),
  pain_acceptance_score integer check (pain_acceptance_score between 1 and 10),
  reflection text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  mood_score integer check (mood_score between 1 and 10),
  stress_score integer check (stress_score between 1 and 10),
  sleep_hours numeric(4,1),
  readiness_score integer check (readiness_score between 1 and 10),
  reflection text,
  created_at timestamptz not null default now()
);

create table if not exists public.case_formulations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  summary text,
  daily_log_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_bundles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  mental_health_assessment_id uuid references public.assessments(id) on delete set null,
  psychophysiology_id uuid references public.psychophysiology(id) on delete set null,
  neurocognitive_id uuid references public.neurocognitive(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_documents (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size_kb integer,
  storage_path text,
  document_category text not null default 'other',
  extracted_text text,
  ai_summary text,
  ai_key_findings text[] not null default '{}'::text[],
  ai_flags text[] not null default '{}'::text[],
  ai_recommendations text,
  ai_confidence integer not null default 0,
  practitioner_notes text,
  uploaded_at timestamptz not null default now(),
  analysed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_competitions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  name text not null,
  competition_date date,
  result text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_journals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  title text,
  content text not null,
  entry_date date not null default current_date,
  mood_score integer,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_notifications (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  athlete_auth_id uuid references auth.users(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_sessions (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  title text,
  session_date timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Commerce / payments / booking
-- ------------------------------------------------------------

create table if not exists public.token_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid not null references public.token_wallets(user_id) on delete cascade,
  direction wallet_entry_direction not null,
  reason wallet_entry_reason not null,
  quantity integer not null check (quantity > 0),
  idempotency_key text not null,
  payment_order_id uuid,
  session_booking_id uuid,
  related_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (wallet_user_id, idempotency_key)
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  practitioner_user_id uuid references auth.users(id) on delete set null,
  relationship_id uuid references public.practitioner_athlete_relationships(id) on delete set null,
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

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.practitioner_payout_accounts (
  practitioner_user_id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.practitioner_availability (
  id uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  room_provider text not null default 'external',
  room_url text not null,
  room_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.session_booking_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid not null references public.practitioner_athlete_relationships(id) on delete cascade,
  requested_start timestamptz,
  requested_end timestamptz,
  status booking_status_v2 not null default 'pending_payment',
  note text,
  token_quote integer not null default 10,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_bookings (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.practitioner_athlete_relationships(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  booking_request_id uuid references public.session_booking_requests(id) on delete set null,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  video_room_id uuid references public.video_rooms(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status booking_status_v2 not null default 'confirmed',
  token_cost integer not null default 10,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_bookings_time_order check (scheduled_end > scheduled_start)
);

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  diagnosis_label text not null check (char_length(trim(diagnosis_label)) between 2 and 160),
  dsm_reference text,
  icd_code text not null check (char_length(trim(icd_code)) between 2 and 32),
  notes text not null default '',
  severity_level text not null
    check (severity_level in ('mild', 'moderate', 'severe', 'critical')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinical_access_logs (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  action text not null
    check (action in ('unlock_success', 'unlock_failed', 'view', 'create', 'edit', 'archive', 'icd_search')),
  meta jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists public.clinical_access_settings (
  practitioner_id uuid primary key references public.practitioners(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinical_audit_anonymous (
  id uuid primary key default gen_random_uuid(),
  hashed_practitioner_id text not null,
  action_type text not null
    check (action_type in ('unlock_success', 'unlock_failed', 'view', 'create', 'edit', 'archive', 'icd_search')),
  meta jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists public.clinical_icd_reference (
  code text primary key,
  title text not null,
  category text,
  keywords text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.clinical_icd_reference (code, title, category, keywords)
values
  ('6A70', 'Generalized anxiety disorder', 'Anxiety or fear-related disorders', array['anxiety', 'gad', 'worry']),
  ('6A71', 'Panic disorder', 'Anxiety or fear-related disorders', array['panic', 'panic attack', 'anxiety']),
  ('6A73', 'Social anxiety disorder', 'Anxiety or fear-related disorders', array['social anxiety', 'performance anxiety', 'fear']),
  ('6B00', 'Single episode depressive disorder', 'Mood disorders', array['depression', 'low mood']),
  ('6B01', 'Recurrent depressive disorder', 'Mood disorders', array['depression', 'recurrent']),
  ('6B04', 'Dysthymic disorder', 'Mood disorders', array['persistent depression', 'dysthymia']),
  ('6B40', 'Post traumatic stress disorder', 'Disorders specifically associated with stress', array['ptsd', 'trauma']),
  ('6B41', 'Complex post traumatic stress disorder', 'Disorders specifically associated with stress', array['cptsd', 'complex trauma']),
  ('6B60', 'Adjustment disorder', 'Disorders specifically associated with stress', array['adjustment', 'transition']),
  ('6B81', 'Anorexia nervosa', 'Feeding or eating disorders', array['eating disorder', 'anorexia']),
  ('6B82', 'Bulimia nervosa', 'Feeding or eating disorders', array['eating disorder', 'bulimia']),
  ('6C40', 'Obsessive-compulsive disorder', 'Obsessive-compulsive and related disorders', array['ocd', 'compulsions']),
  ('6D10', 'Attention deficit hyperactivity disorder', 'Disorders of attention', array['adhd', 'attention']),
  ('6D11', 'Developmental learning disorder', 'Neurodevelopmental disorders', array['learning disorder']),
  ('QE84', 'Problems associated with lifestyle', 'Factors influencing health status', array['lifestyle', 'habits']),
  ('QD85', 'Problems associated with family support', 'Factors influencing health status', array['family', 'support']),
  ('QE21.0', 'Problems associated with job and unemployment', 'Factors influencing health status', array['career', 'sport transition', 'employment'])
on conflict (code) do update
set title = excluded.title,
    category = excluded.category,
    keywords = excluded.keywords,
    is_active = true;

drop view if exists public.clinical_owner_usage_summary;

create view public.clinical_owner_usage_summary as
select
  date_trunc('day', timestamp)::date as usage_day,
  action_type,
  count(*)::int as action_count,
  count(distinct hashed_practitioner_id)::int as unique_practitioners
from public.clinical_audit_anonymous
group by 1, 2;

drop view if exists public.clinical_owner_diagnosis_trends;

create view public.clinical_owner_diagnosis_trends as
select
  icd_code,
  severity_level,
  status,
  count(*)::int as record_count
from public.clinical_records
group by 1, 2, 3;

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

create index if not exists idx_athletes_practitioner on public.athletes(practitioner_id);
create index if not exists idx_athletes_status on public.athletes(status);
create index if not exists idx_athletes_portal_user_id on public.athletes(portal_user_id) where portal_user_id is not null;
create index if not exists idx_sessions_practitioner on public.sessions(practitioner_id);
create index if not exists idx_sessions_athlete on public.sessions(athlete_id);
create index if not exists idx_sessions_scheduled_at on public.sessions(scheduled_at desc);
create index if not exists idx_check_ins_athlete on public.check_ins(athlete_id, checked_in_at desc);
create index if not exists idx_assessments_athlete on public.assessments(athlete_id, administered_at desc);
create index if not exists idx_physio_athlete on public.psychophysiology(athlete_id, created_at desc);
create index if not exists idx_neuro_athlete on public.neurocognitive(athlete_id, created_at desc);
create index if not exists idx_profiles_athlete on public.performance_profiles(athlete_id, created_at desc);
create index if not exists idx_custom_assessments_athlete on public.custom_assessments(athlete_id, created_at desc);
create index if not exists idx_programs_practitioner on public.intervention_programs(practitioner_id);
create index if not exists idx_tasks_program on public.intervention_tasks(program_id, week_number, day_of_week, sort_order);
create index if not exists idx_athlete_interventions_athlete on public.athlete_interventions(athlete_id, assigned_at desc);
create index if not exists idx_athlete_programs_athlete on public.athlete_programs(athlete_id, assigned_at desc);
create index if not exists idx_intervention_progress_assignment on public.intervention_progress(athlete_intervention_id, created_at desc);
create index if not exists idx_task_completions_athlete on public.task_completions(athlete_id, completed_at desc);
create index if not exists idx_athlete_daily_logs_athlete on public.athlete_daily_logs(athlete_id, log_date desc);
create index if not exists idx_session_requests_practitioner on public.athlete_session_requests(practitioner_id, created_at desc);
create index if not exists idx_shared_reports_athlete on public.shared_reports(athlete_id, shared_at desc);
create index if not exists idx_injury_records_athlete on public.injury_records(athlete_id, injury_date desc);
create index if not exists idx_psych_readiness_athlete on public.psych_readiness(athlete_id, created_at desc);
create index if not exists idx_injury_psychology_logs_athlete on public.injury_psychology_logs(athlete_id, created_at desc);
create index if not exists idx_daily_logs_athlete_created on public.daily_logs(athlete_id, created_at desc);
create index if not exists idx_case_formulations_athlete on public.case_formulations(athlete_id, created_at desc);
create index if not exists idx_reports_practitioner on public.reports(practitioner_id, generated_at desc);
create index if not exists idx_consent_forms_athlete on public.consent_forms(athlete_id, created_at desc);
create index if not exists idx_athlete_documents_athlete on public.athlete_documents(athlete_id, uploaded_at desc);
create index if not exists idx_notifications_athlete_auth on public.athlete_notifications(athlete_auth_id, created_at desc);
create index if not exists idx_wallet_ledger_wallet_created on public.token_ledger(wallet_user_id, created_at desc);
create index if not exists idx_payment_orders_athlete_created on public.payment_orders(athlete_user_id, created_at desc);
create index if not exists idx_practitioner_availability_active on public.practitioner_availability(practitioner_user_id, day_of_week) where is_active = true;
create index if not exists idx_session_bookings_practitioner_time on public.session_bookings(practitioner_user_id, scheduled_start desc);
create index if not exists idx_session_bookings_athlete_time on public.session_bookings(athlete_user_id, scheduled_start desc);
create index if not exists idx_clinical_records_practitioner_created on public.clinical_records(practitioner_id, created_at desc);
create index if not exists idx_clinical_records_athlete_created on public.clinical_records(athlete_id, created_at desc);
create index if not exists idx_clinical_records_status on public.clinical_records(status, severity_level, created_at desc);
create index if not exists idx_clinical_access_logs_practitioner_timestamp on public.clinical_access_logs(practitioner_id, timestamp desc);
create index if not exists idx_clinical_access_settings_updated on public.clinical_access_settings(updated_at desc);

-- ------------------------------------------------------------
-- Sync helpers / triggers
-- ------------------------------------------------------------

create or replace function public.sync_injury_record_dates()
returns trigger
language plpgsql
as $$
begin
  if new.date_of_injury is null and new.injury_date is not null then
    new.date_of_injury = new.injury_date::timestamptz;
  end if;
  if new.injury_date is null and new.date_of_injury is not null then
    new.injury_date = new.date_of_injury::date;
  end if;
  return new;
end;
$$;

create or replace function public.sync_legacy_link_to_relationship()
returns trigger
language plpgsql
as $$
declare
  v_athlete_user_id uuid;
  v_status relationship_status_v2;
begin
  select portal_user_id into v_athlete_user_id
  from public.athletes
  where id = new.athlete_id;

  if v_athlete_user_id is null then
    return new;
  end if;

  v_status :=
    case
      when new.status = 'active' then 'active'::relationship_status_v2
      when new.status = 'pending' then 'pending'::relationship_status_v2
      else 'archived'::relationship_status_v2
    end;

  insert into public.practitioner_athlete_relationships(
    practitioner_user_id,
    athlete_user_id,
    athlete_record_id,
    legacy_link_id,
    status,
    linked_at,
    activated_at,
    archived_at,
    archived_reason
  )
  values (
    new.practitioner_id,
    v_athlete_user_id,
    new.athlete_id,
    new.id,
    v_status,
    new.linked_at,
    case when v_status = 'active' then coalesce(new.linked_at, now()) else null end,
    new.archived_at,
    new.archived_reason
  )
  on conflict (legacy_link_id) do update
    set status = excluded.status,
        linked_at = excluded.linked_at,
        activated_at = coalesce(excluded.activated_at, public.practitioner_athlete_relationships.activated_at),
        archived_at = excluded.archived_at,
        archived_reason = excluded.archived_reason,
        updated_at = now();

  return new;
end;
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_athlete_id uuid;
  v_practitioner_id uuid;
  v_display_name text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', new.raw_app_meta_data->>'role', 'practitioner');
  v_display_name := trim(coalesce(new.raw_user_meta_data->>'first_name', '') || ' ' || coalesce(new.raw_user_meta_data->>'last_name', ''));

  insert into public.user_roles(user_id, role)
  values (new.id, case when v_role in ('athlete', 'practitioner', 'admin') then v_role else 'practitioner' end)
  on conflict (user_id) do update set role = excluded.role;

  insert into public.user_profiles(id, role, email, display_name)
  values (
    new.id,
    case when v_role in ('athlete', 'practitioner', 'admin') then v_role else 'practitioner' end,
    new.email,
    nullif(v_display_name, '')
  )
  on conflict (id) do update
    set role = excluded.role,
        email = excluded.email,
        display_name = coalesce(excluded.display_name, public.user_profiles.display_name),
        updated_at = now();

  if v_role = 'practitioner' then
    insert into public.practitioners(id, email, first_name, last_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'first_name', ''),
      coalesce(new.raw_user_meta_data->>'last_name', '')
    )
    on conflict (id) do update
      set email = excluded.email,
          updated_at = now();

    insert into public.practitioner_profiles(user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  if v_role = 'athlete' then
    v_athlete_id := nullif(new.raw_user_meta_data->>'athlete_id', '')::uuid;
    v_practitioner_id := nullif(new.raw_user_meta_data->>'practitioner_id', '')::uuid;

    if v_athlete_id is not null then
      update public.athletes
         set portal_user_id = new.id,
             is_portal_activated = true,
             portal_activated_at = coalesce(portal_activated_at, now()),
             email = coalesce(email, new.email),
             updated_at = now()
       where id = v_athlete_id;

      insert into public.athlete_profiles(
        user_id,
        practitioner_id,
        athlete_id,
        email,
        display_name,
        first_name,
        last_name,
        sport,
        portal_enabled,
        portal_enabled_at
      )
      select
        new.id,
        coalesce(v_practitioner_id, a.practitioner_id),
        a.id,
        coalesce(new.email, a.email),
        nullif(v_display_name, ''),
        a.first_name,
        a.last_name,
        a.sport,
        true,
        now()
      from public.athletes a
      where a.id = v_athlete_id
      on conflict (athlete_id) do update
        set user_id = excluded.user_id,
            practitioner_id = excluded.practitioner_id,
            email = excluded.email,
            display_name = coalesce(excluded.display_name, public.athlete_profiles.display_name),
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            sport = excluded.sport,
            portal_enabled = true,
            portal_enabled_at = coalesce(public.athlete_profiles.portal_enabled_at, now()),
            updated_at = now();

      update public.task_completions
         set athlete_auth_id = new.id
       where athlete_id = v_athlete_id and athlete_auth_id is null;

      update public.athlete_daily_logs
         set athlete_auth_id = new.id
       where athlete_id = v_athlete_id and athlete_auth_id is null;

      update public.athlete_session_requests
         set athlete_auth_id = new.id
       where athlete_id = v_athlete_id and athlete_auth_id is null;

      update public.shared_reports
         set athlete_auth_id = new.id
       where athlete_id = v_athlete_id and athlete_auth_id is null;

      update public.athlete_notifications
         set athlete_auth_id = new.id
       where athlete_id = v_athlete_id and athlete_auth_id is null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_organisations_updated_at on public.organisations;
create trigger trg_organisations_updated_at before update on public.organisations for each row execute function public.update_updated_at();
drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioners_updated_at on public.practitioners;
create trigger trg_practitioners_updated_at before update on public.practitioners for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioner_profiles_updated_at on public.practitioner_profiles;
create trigger trg_practitioner_profiles_updated_at before update on public.practitioner_profiles for each row execute function public.update_updated_at();
drop trigger if exists trg_athletes_updated_at on public.athletes;
create trigger trg_athletes_updated_at before update on public.athletes for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_profiles_updated_at on public.athlete_profiles;
create trigger trg_athlete_profiles_updated_at before update on public.athlete_profiles for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioner_athlete_links_updated_at on public.practitioner_athlete_links;
create trigger trg_practitioner_athlete_links_updated_at before update on public.practitioner_athlete_links for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioner_athlete_links_sync on public.practitioner_athlete_links;
create trigger trg_practitioner_athlete_links_sync after insert or update on public.practitioner_athlete_links for each row execute function public.sync_legacy_link_to_relationship();
drop trigger if exists trg_athlete_invites_updated_at on public.athlete_invites;
create trigger trg_athlete_invites_updated_at before update on public.athlete_invites for each row execute function public.update_updated_at();
drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at before update on public.conversations for each row execute function public.update_updated_at();
drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at before update on public.sessions for each row execute function public.update_updated_at();
drop trigger if exists trg_psychophysiology_updated_at on public.psychophysiology;
create trigger trg_psychophysiology_updated_at before update on public.psychophysiology for each row execute function public.update_updated_at();
drop trigger if exists trg_neurocognitive_updated_at on public.neurocognitive;
create trigger trg_neurocognitive_updated_at before update on public.neurocognitive for each row execute function public.update_updated_at();
drop trigger if exists trg_interventions_updated_at on public.interventions;
create trigger trg_interventions_updated_at before update on public.interventions for each row execute function public.update_updated_at();
drop trigger if exists trg_intervention_programs_updated_at on public.intervention_programs;
create trigger trg_intervention_programs_updated_at before update on public.intervention_programs for each row execute function public.update_updated_at();
drop trigger if exists trg_intervention_tasks_updated_at on public.intervention_tasks;
create trigger trg_intervention_tasks_updated_at before update on public.intervention_tasks for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_interventions_updated_at on public.athlete_interventions;
create trigger trg_athlete_interventions_updated_at before update on public.athlete_interventions for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_programs_updated_at on public.athlete_programs;
create trigger trg_athlete_programs_updated_at before update on public.athlete_programs for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_daily_logs_updated_at on public.athlete_daily_logs;
create trigger trg_athlete_daily_logs_updated_at before update on public.athlete_daily_logs for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_session_requests_updated_at on public.athlete_session_requests;
create trigger trg_athlete_session_requests_updated_at before update on public.athlete_session_requests for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_requests_updated_at on public.athlete_requests;
create trigger trg_athlete_requests_updated_at before update on public.athlete_requests for each row execute function public.update_updated_at();
drop trigger if exists trg_consent_forms_updated_at on public.consent_forms;
create trigger trg_consent_forms_updated_at before update on public.consent_forms for each row execute function public.update_updated_at();
drop trigger if exists trg_injury_records_updated_at on public.injury_records;
create trigger trg_injury_records_updated_at before update on public.injury_records for each row execute function public.update_updated_at();
drop trigger if exists trg_injury_records_sync_dates on public.injury_records;
create trigger trg_injury_records_sync_dates before insert or update on public.injury_records for each row execute function public.sync_injury_record_dates();
drop trigger if exists trg_psych_readiness_updated_at on public.psych_readiness;
create trigger trg_psych_readiness_updated_at before update on public.psych_readiness for each row execute function public.update_updated_at();
drop trigger if exists trg_injury_psychology_logs_updated_at on public.injury_psychology_logs;
create trigger trg_injury_psychology_logs_updated_at before update on public.injury_psychology_logs for each row execute function public.update_updated_at();
drop trigger if exists trg_case_formulations_updated_at on public.case_formulations;
create trigger trg_case_formulations_updated_at before update on public.case_formulations for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_documents_updated_at on public.athlete_documents;
create trigger trg_athlete_documents_updated_at before update on public.athlete_documents for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_competitions_updated_at on public.athlete_competitions;
create trigger trg_athlete_competitions_updated_at before update on public.athlete_competitions for each row execute function public.update_updated_at();
drop trigger if exists trg_athlete_journals_updated_at on public.athlete_journals;
create trigger trg_athlete_journals_updated_at before update on public.athlete_journals for each row execute function public.update_updated_at();
drop trigger if exists trg_lab_sessions_updated_at on public.lab_sessions;
create trigger trg_lab_sessions_updated_at before update on public.lab_sessions for each row execute function public.update_updated_at();
drop trigger if exists trg_token_wallets_updated_at on public.token_wallets;
create trigger trg_token_wallets_updated_at before update on public.token_wallets for each row execute function public.update_updated_at();
drop trigger if exists trg_payment_orders_updated_at on public.payment_orders;
create trigger trg_payment_orders_updated_at before update on public.payment_orders for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioner_payout_accounts_updated_at on public.practitioner_payout_accounts;
create trigger trg_practitioner_payout_accounts_updated_at before update on public.practitioner_payout_accounts for each row execute function public.update_updated_at();
drop trigger if exists trg_practitioner_availability_updated_at on public.practitioner_availability;
create trigger trg_practitioner_availability_updated_at before update on public.practitioner_availability for each row execute function public.update_updated_at();
drop trigger if exists trg_session_booking_requests_updated_at on public.session_booking_requests;
create trigger trg_session_booking_requests_updated_at before update on public.session_booking_requests for each row execute function public.update_updated_at();
drop trigger if exists trg_session_bookings_updated_at on public.session_bookings;
create trigger trg_session_bookings_updated_at before update on public.session_bookings for each row execute function public.update_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();

-- ------------------------------------------------------------
-- RPC / helper functions
-- ------------------------------------------------------------

create or replace function public.get_daily_log_summary(p_athlete_id uuid)
returns jsonb
language sql
stable
as $$
with logs as (
  select *
  from public.daily_logs
  where athlete_id = p_athlete_id
),
recent as (
  select *
  from logs
  order by created_at desc
  limit 14
)
select jsonb_build_object(
  'athlete_id', p_athlete_id,
  'total_logs', coalesce((select count(*) from logs), 0),
  'last_log_at', (select max(created_at) from logs),
  'avg_mood', coalesce((select round(avg(mood_score)::numeric, 2) from logs where mood_score is not null), 0),
  'avg_stress', coalesce((select round(avg(stress_score)::numeric, 2) from logs where stress_score is not null), 0),
  'avg_readiness', coalesce((select round(avg(readiness_score)::numeric, 2) from logs where readiness_score is not null), 0),
  'avg_sleep_hours', coalesce((select round(avg(sleep_hours)::numeric, 2) from logs where sleep_hours is not null), 0),
  'recent_logs', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'mood_score', mood_score,
        'stress_score', stress_score,
        'sleep_hours', sleep_hours,
        'readiness_score', readiness_score,
        'reflection', reflection
      )
      order by created_at desc
    )
    from recent
  ), '[]'::jsonb)
);
$$;

create or replace function public.practitioner_dashboard_summary()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with me as (
  select auth.uid() as practitioner_id
),
active_links as (
  select jsonb_agg(
    jsonb_build_object(
      'link_id', l.id,
      'linked_at', l.linked_at,
      'athlete_id', a.id,
      'athlete_first_name', a.first_name,
      'athlete_last_name', a.last_name,
      'athlete_email', coalesce(a.email, ''),
      'athlete_sport', a.sport,
      'athlete_uid', a.uid_code,
      'conversation_id', c.id,
      'practitioner_unread', coalesce(c.practitioner_unread, 0),
      'last_message_at', c.last_message_at,
      'last_message_preview', null
    )
    order by l.linked_at desc
  ) as items
  from me
  join public.practitioner_athlete_links l on l.practitioner_id = me.practitioner_id and l.status = 'active'
  join public.athletes a on a.id = l.athlete_id
  left join public.conversations c on c.practitioner_id = l.practitioner_id and c.athlete_id = l.athlete_id
),
archived_links as (
  select jsonb_agg(
    jsonb_build_object(
      'link_id', l.id,
      'status', l.status,
      'linked_at', l.linked_at,
      'archived_at', l.archived_at,
      'archived_reason', l.archived_reason,
      'athlete_id', a.id,
      'athlete_first_name', a.first_name,
      'athlete_last_name', a.last_name,
      'athlete_email', coalesce(a.email, '')
    )
    order by l.archived_at desc nulls last
  ) as items
  from me
  join public.practitioner_athlete_links l on l.practitioner_id = me.practitioner_id and l.status <> 'active'
  join public.athletes a on a.id = l.athlete_id
),
unread_messages as (
  select count(*)::int as count
  from me
  join public.messages m on m.receiver_id = me.practitioner_id and m.receiver_role = 'practitioner' and m.is_read = false
)
select jsonb_build_object(
  'ok', true,
  'active_links', coalesce((select items from active_links), '[]'::jsonb),
  'archived_links', coalesce((select items from archived_links), '[]'::jsonb),
  'unread_messages', coalesce((select count from unread_messages), 0),
  'unread_notifications', 0
);
$$;

create or replace function public.athlete_portal_summary()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with athlete_self as (
  select
    a.id,
    coalesce(a.email, u.email::text, '') as email,
    a.first_name,
    a.last_name,
    case
      when exists (
        select 1 from public.practitioner_athlete_links l
        where l.athlete_id = a.id and l.status = 'active'
      ) then 'linked'
      when a.status in ('inactive', 'on_hold', 'discontinued') then 'discontinued'
      else 'unverified'
    end as status,
    a.uid_code,
    a.sport,
    a.timezone,
    a.language
  from public.athletes a
  left join auth.users u on u.id = a.portal_user_id
  where a.portal_user_id = auth.uid()
  limit 1
),
active_links as (
  select jsonb_agg(
    jsonb_build_object(
      'link_id', l.id,
      'status', 'active',
      'linked_at', l.linked_at,
      'archived_at', l.archived_at,
      'practitioner_id', p.id,
      'practitioner_first_name', p.first_name,
      'practitioner_last_name', p.last_name,
      'practitioner_email', p.email,
      'practitioner_avatar', p.avatar_url,
      'conversation_id', c.id,
      'athlete_unread', coalesce(c.athlete_unread, 0),
      'last_message_at', c.last_message_at,
      'last_message_preview', null
    )
    order by l.linked_at desc
  ) as items
  from athlete_self a
  join public.practitioner_athlete_links l on l.athlete_id = a.id and l.status = 'active'
  join public.practitioners p on p.id = l.practitioner_id
  left join public.conversations c on c.practitioner_id = l.practitioner_id and c.athlete_id = l.athlete_id
),
archived_links as (
  select jsonb_agg(
    jsonb_build_object(
      'link_id', l.id,
      'status', l.status,
      'linked_at', l.linked_at,
      'archived_at', l.archived_at,
      'practitioner_id', p.id,
      'practitioner_first_name', p.first_name,
      'practitioner_last_name', p.last_name,
      'practitioner_email', p.email
    )
    order by l.archived_at desc nulls last
  ) as items
  from athlete_self a
  join public.practitioner_athlete_links l on l.athlete_id = a.id and l.status <> 'active'
  join public.practitioners p on p.id = l.practitioner_id
)
select jsonb_build_object(
  'ok', true,
  'athlete', (
    select jsonb_build_object(
      'id', id,
      'email', email,
      'first_name', first_name,
      'last_name', last_name,
      'status', status,
      'uid_code', uid_code,
      'sport', sport,
      'timezone', timezone,
      'language', language
    )
    from athlete_self
  ),
  'active_links', coalesce((select items from active_links), '[]'::jsonb),
  'archived_links', coalesce((select items from archived_links), '[]'::jsonb),
  'unread_notifications', 0
);
$$;

create or replace function public.get_invite_email_context(p_invite_id uuid)
returns table (
  invite_id uuid,
  token uuid,
  email text,
  expires_at timestamptz,
  practitioner_id uuid,
  practitioner_name text,
  practitioner_email text,
  athlete_id uuid,
  athlete_first_name text,
  athlete_last_name text,
  athlete_sport text
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.token,
    i.email::text,
    i.expires_at,
    i.practitioner_id,
    trim(p.first_name || ' ' || p.last_name),
    p.email::text,
    a.id,
    a.first_name,
    a.last_name,
    a.sport
  from public.athlete_invites i
  join public.practitioners p on p.id = i.practitioner_id
  join public.athletes a on a.id = i.athlete_id
  where i.id = p_invite_id
  limit 1
$$;

create or replace function public.mark_invite_email_sent(
  p_invite_id uuid,
  p_provider text,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.athlete_invites
     set email_sent_at = case when p_error is null then now() else email_sent_at end,
         email_send_attempts = email_send_attempts + 1,
         email_last_error = p_error,
         email_provider = case when p_error is null then p_provider else email_provider end,
         updated_at = now()
   where id = p_invite_id
$$;

-- ------------------------------------------------------------
-- Storage bucket for athlete documents
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('athlete-documents', 'athlete-documents', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.practitioners enable row level security;
alter table public.practitioner_profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.practitioner_athlete_links enable row level security;
alter table public.practitioner_athlete_relationships enable row level security;
alter table public.relationship_archives enable row level security;
alter table public.athlete_invites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_chat_sessions enable row level security;
alter table public.sessions enable row level security;
alter table public.check_ins enable row level security;
alter table public.assessments enable row level security;
alter table public.psychophysiology enable row level security;
alter table public.neurocognitive enable row level security;
alter table public.performance_profiles enable row level security;
alter table public.custom_assessments enable row level security;
alter table public.interventions enable row level security;
alter table public.intervention_programs enable row level security;
alter table public.intervention_tasks enable row level security;
alter table public.athlete_interventions enable row level security;
alter table public.athlete_programs enable row level security;
alter table public.intervention_progress enable row level security;
alter table public.task_completions enable row level security;
alter table public.athlete_daily_logs enable row level security;
alter table public.athlete_session_requests enable row level security;
alter table public.athlete_requests enable row level security;
alter table public.shared_reports enable row level security;
alter table public.reports enable row level security;
alter table public.consent_forms enable row level security;
alter table public.injury_records enable row level security;
alter table public.psych_readiness enable row level security;
alter table public.injury_psychology_logs enable row level security;
alter table public.daily_logs enable row level security;
alter table public.case_formulations enable row level security;
alter table public.assessment_bundles enable row level security;
alter table public.athlete_documents enable row level security;
alter table public.athlete_competitions enable row level security;
alter table public.athlete_journals enable row level security;
alter table public.athlete_notifications enable row level security;
alter table public.lab_sessions enable row level security;
alter table public.token_wallets enable row level security;
alter table public.token_ledger enable row level security;
alter table public.payment_orders enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.practitioner_payout_accounts enable row level security;
alter table public.practitioner_availability enable row level security;
alter table public.video_rooms enable row level security;
alter table public.session_booking_requests enable row level security;
alter table public.session_bookings enable row level security;
alter table public.clinical_records enable row level security;
alter table public.clinical_access_logs enable row level security;
alter table public.clinical_access_settings enable row level security;
alter table public.clinical_audit_anonymous enable row level security;
alter table public.clinical_icd_reference enable row level security;

drop policy if exists organisations_read on public.organisations;
create policy organisations_read on public.organisations
  for select to authenticated using (true);

drop policy if exists user_roles_self on public.user_roles;
create policy user_roles_self on public.user_roles
  for select using (auth.uid() = user_id);

drop policy if exists user_profiles_self on public.user_profiles;
create policy user_profiles_self on public.user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists practitioners_self on public.practitioners;
create policy practitioners_self on public.practitioners
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists practitioner_profiles_self on public.practitioner_profiles;
create policy practitioner_profiles_self on public.practitioner_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists athletes_participant_access on public.athletes;
create policy athletes_participant_access on public.athletes
  for all using (auth.uid() = practitioner_id or auth.uid() = portal_user_id)
  with check (auth.uid() = practitioner_id or auth.uid() = portal_user_id);

drop policy if exists athlete_profiles_participant_access on public.athlete_profiles;
create policy athlete_profiles_participant_access on public.athlete_profiles
  for all using (auth.uid() = practitioner_id or auth.uid() = user_id)
  with check (auth.uid() = practitioner_id or auth.uid() = user_id);

drop policy if exists practitioner_athlete_links_participant_select on public.practitioner_athlete_links;
create policy practitioner_athlete_links_participant_select on public.practitioner_athlete_links
  for select using (
    auth.uid() = practitioner_id
    or exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.portal_user_id = auth.uid()
    )
  );

drop policy if exists practitioner_athlete_links_practitioner_write on public.practitioner_athlete_links;
create policy practitioner_athlete_links_practitioner_write on public.practitioner_athlete_links
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists practitioner_athlete_relationships_participants on public.practitioner_athlete_relationships;
create policy practitioner_athlete_relationships_participants on public.practitioner_athlete_relationships
  for select using (auth.uid() in (practitioner_user_id, athlete_user_id));

drop policy if exists practitioner_athlete_relationships_practitioner_insert on public.practitioner_athlete_relationships;
create policy practitioner_athlete_relationships_practitioner_insert on public.practitioner_athlete_relationships
  for insert with check (auth.uid() = practitioner_user_id);

drop policy if exists practitioner_athlete_relationships_participant_update on public.practitioner_athlete_relationships;
create policy practitioner_athlete_relationships_participant_update on public.practitioner_athlete_relationships
  for update using (auth.uid() in (practitioner_user_id, athlete_user_id))
  with check (auth.uid() in (practitioner_user_id, athlete_user_id));

drop policy if exists relationship_archives_participants on public.relationship_archives;
create policy relationship_archives_participants on public.relationship_archives
  for select using (auth.uid() in (practitioner_user_id, athlete_user_id));

drop policy if exists athlete_invites_practitioner_all on public.athlete_invites;
create policy athlete_invites_practitioner_all on public.athlete_invites
  for all using (practitioner_id = auth.uid())
  with check (practitioner_id = auth.uid());

drop policy if exists athlete_invites_read_by_token on public.athlete_invites;
create policy athlete_invites_read_by_token on public.athlete_invites
  for select to anon, authenticated
  using (accepted_at is null and expires_at > now());

drop policy if exists athlete_invites_accept_by_token on public.athlete_invites;
create policy athlete_invites_accept_by_token on public.athlete_invites
  for update to anon, authenticated
  using (accepted_at is null and expires_at > now())
  with check (accepted_at is not null);

drop policy if exists conversations_participant_select on public.conversations;
create policy conversations_participant_select on public.conversations
  for select using (
    auth.uid() = practitioner_id
    or exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.portal_user_id = auth.uid()
    )
  );

drop policy if exists conversations_practitioner_write on public.conversations;
create policy conversations_practitioner_write on public.conversations
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists messages_sender_insert on public.messages;
create policy messages_sender_insert on public.messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists messages_receiver_update on public.messages;
create policy messages_receiver_update on public.messages
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

drop policy if exists practitioner_owned_sessions on public.sessions;
create policy practitioner_owned_sessions on public.sessions
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists practitioner_owned_check_ins on public.check_ins;
create policy practitioner_owned_check_ins on public.check_ins
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists assessments_owner_access on public.assessments;
create policy assessments_owner_access on public.assessments
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists assessments_practitioner_write on public.assessments;
create policy assessments_practitioner_write on public.assessments
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists psychophysiology_owner_access on public.psychophysiology;
create policy psychophysiology_owner_access on public.psychophysiology
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists psychophysiology_practitioner_write on public.psychophysiology;
create policy psychophysiology_practitioner_write on public.psychophysiology
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists neurocognitive_owner_access on public.neurocognitive;
create policy neurocognitive_owner_access on public.neurocognitive
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists neurocognitive_practitioner_write on public.neurocognitive;
create policy neurocognitive_practitioner_write on public.neurocognitive
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists performance_profiles_owner on public.performance_profiles;
create policy performance_profiles_owner on public.performance_profiles
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists custom_assessments_owner on public.custom_assessments;
create policy custom_assessments_owner on public.custom_assessments
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists interventions_owner on public.interventions;
create policy interventions_owner on public.interventions
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists intervention_programs_owner on public.intervention_programs;
create policy intervention_programs_owner on public.intervention_programs
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists intervention_tasks_by_program on public.intervention_tasks;
create policy intervention_tasks_by_program on public.intervention_tasks
  for all using (
    exists (
      select 1 from public.intervention_programs p
      where p.id = program_id and p.practitioner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.intervention_programs p
      where p.id = program_id and p.practitioner_id = auth.uid()
    )
  );

drop policy if exists athlete_interventions_owner_access on public.athlete_interventions;
create policy athlete_interventions_owner_access on public.athlete_interventions
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists athlete_interventions_practitioner_write on public.athlete_interventions;
create policy athlete_interventions_practitioner_write on public.athlete_interventions
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists athlete_programs_owner_access on public.athlete_programs;
create policy athlete_programs_owner_access on public.athlete_programs
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists athlete_programs_practitioner_write on public.athlete_programs;
create policy athlete_programs_practitioner_write on public.athlete_programs
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists intervention_progress_owner_access on public.intervention_progress;
create policy intervention_progress_owner_access on public.intervention_progress
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists intervention_progress_insert_access on public.intervention_progress;
create policy intervention_progress_insert_access on public.intervention_progress
  for insert with check (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists task_completions_owner_access on public.task_completions;
create policy task_completions_owner_access on public.task_completions
  for select using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists task_completions_athlete_insert on public.task_completions;
create policy task_completions_athlete_insert on public.task_completions
  for insert with check (auth.uid() = athlete_auth_id);

drop policy if exists athlete_daily_logs_owner_access on public.athlete_daily_logs;
create policy athlete_daily_logs_owner_access on public.athlete_daily_logs
  for select using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists athlete_daily_logs_insert_access on public.athlete_daily_logs;
create policy athlete_daily_logs_insert_access on public.athlete_daily_logs
  for insert with check (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists athlete_daily_logs_update_access on public.athlete_daily_logs;
create policy athlete_daily_logs_update_access on public.athlete_daily_logs
  for update using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  )
  with check (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists athlete_session_requests_owner_access on public.athlete_session_requests;
create policy athlete_session_requests_owner_access on public.athlete_session_requests
  for select using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists athlete_session_requests_insert_access on public.athlete_session_requests;
create policy athlete_session_requests_insert_access on public.athlete_session_requests
  for insert with check (auth.uid() = athlete_auth_id);

drop policy if exists athlete_session_requests_update_access on public.athlete_session_requests;
create policy athlete_session_requests_update_access on public.athlete_session_requests
  for update using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  )
  with check (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists athlete_requests_owner_access on public.athlete_requests;
create policy athlete_requests_owner_access on public.athlete_requests
  for all using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  )
  with check (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists shared_reports_owner_access on public.shared_reports;
create policy shared_reports_owner_access on public.shared_reports
  for select using (
    auth.uid() = practitioner_id
    or auth.uid() = athlete_auth_id
  );

drop policy if exists shared_reports_practitioner_write on public.shared_reports;
create policy shared_reports_practitioner_write on public.shared_reports
  for insert with check (auth.uid() = practitioner_id);

drop policy if exists shared_reports_revoke_access on public.shared_reports;
create policy shared_reports_revoke_access on public.shared_reports
  for update using (auth.uid() = practitioner_id or auth.uid() = athlete_auth_id)
  with check (auth.uid() = practitioner_id or auth.uid() = athlete_auth_id);

drop policy if exists reports_owner_access on public.reports;
create policy reports_owner_access on public.reports
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.shared_reports sr where sr.report_id = id and sr.athlete_auth_id = auth.uid() and sr.is_revoked = false and sr.expires_at > now())
  );

drop policy if exists reports_practitioner_write on public.reports;
create policy reports_practitioner_write on public.reports
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists consent_forms_owner_access on public.consent_forms;
create policy consent_forms_owner_access on public.consent_forms
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists consent_forms_practitioner_write on public.consent_forms;
create policy consent_forms_practitioner_write on public.consent_forms
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists injury_records_owner_access on public.injury_records;
create policy injury_records_owner_access on public.injury_records
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists injury_records_practitioner_write on public.injury_records;
create policy injury_records_practitioner_write on public.injury_records
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists psych_readiness_owner_access on public.psych_readiness;
create policy psych_readiness_owner_access on public.psych_readiness
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists psych_readiness_practitioner_write on public.psych_readiness;
create policy psych_readiness_practitioner_write on public.psych_readiness
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists injury_psychology_logs_owner_access on public.injury_psychology_logs;
create policy injury_psychology_logs_owner_access on public.injury_psychology_logs
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists injury_psychology_logs_write on public.injury_psychology_logs;
create policy injury_psychology_logs_write on public.injury_psychology_logs
  for all using (auth.uid() = practitioner_id or auth.uid() = (select portal_user_id from public.athletes a where a.id = athlete_id))
  with check (auth.uid() = practitioner_id or auth.uid() = (select portal_user_id from public.athletes a where a.id = athlete_id));

drop policy if exists daily_logs_owner_access on public.daily_logs;
create policy daily_logs_owner_access on public.daily_logs
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists daily_logs_write_access on public.daily_logs;
create policy daily_logs_write_access on public.daily_logs
  for insert with check (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists case_formulations_owner on public.case_formulations;
create policy case_formulations_owner on public.case_formulations
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists assessment_bundles_owner on public.assessment_bundles;
create policy assessment_bundles_owner on public.assessment_bundles
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists athlete_documents_owner_access on public.athlete_documents;
create policy athlete_documents_owner_access on public.athlete_documents
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists athlete_documents_practitioner_write on public.athlete_documents;
create policy athlete_documents_practitioner_write on public.athlete_documents
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists athlete_competitions_owner_access on public.athlete_competitions;
create policy athlete_competitions_owner_access on public.athlete_competitions
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists athlete_competitions_write on public.athlete_competitions;
create policy athlete_competitions_write on public.athlete_competitions
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists athlete_journals_owner_access on public.athlete_journals;
create policy athlete_journals_owner_access on public.athlete_journals
  for select using (
    auth.uid() = athlete_auth_id
    or auth.uid() = practitioner_id
  );

drop policy if exists athlete_journals_insert_access on public.athlete_journals;
create policy athlete_journals_insert_access on public.athlete_journals
  for insert with check (auth.uid() = athlete_auth_id);

drop policy if exists athlete_journals_update_access on public.athlete_journals;
create policy athlete_journals_update_access on public.athlete_journals
  for update using (auth.uid() = athlete_auth_id or auth.uid() = practitioner_id)
  with check (auth.uid() = athlete_auth_id or auth.uid() = practitioner_id);

drop policy if exists athlete_notifications_owner_access on public.athlete_notifications;
create policy athlete_notifications_owner_access on public.athlete_notifications
  for select using (auth.uid() = athlete_auth_id or auth.uid() = practitioner_id);

drop policy if exists athlete_notifications_write on public.athlete_notifications;
create policy athlete_notifications_write on public.athlete_notifications
  for all using (auth.uid() = practitioner_id or auth.uid() = athlete_auth_id)
  with check (auth.uid() = practitioner_id or auth.uid() = athlete_auth_id);

drop policy if exists lab_sessions_owner_access on public.lab_sessions;
create policy lab_sessions_owner_access on public.lab_sessions
  for select using (
    auth.uid() = practitioner_id
    or exists (select 1 from public.athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
  );

drop policy if exists lab_sessions_write on public.lab_sessions;
create policy lab_sessions_write on public.lab_sessions
  for all using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists token_wallets_owner on public.token_wallets;
create policy token_wallets_owner on public.token_wallets
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists token_ledger_owner on public.token_ledger;
create policy token_ledger_owner on public.token_ledger
  for select using (auth.uid() = wallet_user_id);

drop policy if exists payment_orders_participants on public.payment_orders;
create policy payment_orders_participants on public.payment_orders
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

drop policy if exists payment_orders_athlete_insert on public.payment_orders;
create policy payment_orders_athlete_insert on public.payment_orders
  for insert with check (auth.uid() = athlete_user_id);

drop policy if exists practitioner_payout_accounts_owner on public.practitioner_payout_accounts;
create policy practitioner_payout_accounts_owner on public.practitioner_payout_accounts
  for all using (auth.uid() = practitioner_user_id)
  with check (auth.uid() = practitioner_user_id);

drop policy if exists practitioner_availability_access on public.practitioner_availability;
create policy practitioner_availability_access on public.practitioner_availability
  for select using (
    auth.uid() = practitioner_user_id
    or exists (
      select 1 from public.practitioner_athlete_relationships r
      where r.practitioner_user_id = practitioner_user_id
        and r.athlete_user_id = auth.uid()
        and r.status = 'active'
    )
  );

drop policy if exists practitioner_availability_practitioner_manage on public.practitioner_availability;
create policy practitioner_availability_practitioner_manage on public.practitioner_availability
  for all using (auth.uid() = practitioner_user_id)
  with check (auth.uid() = practitioner_user_id);

drop policy if exists session_booking_requests_participants on public.session_booking_requests;
create policy session_booking_requests_participants on public.session_booking_requests
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

drop policy if exists session_booking_requests_athlete_insert on public.session_booking_requests;
create policy session_booking_requests_athlete_insert on public.session_booking_requests
  for insert with check (auth.uid() = athlete_user_id);

drop policy if exists session_booking_requests_participants_update on public.session_booking_requests;
create policy session_booking_requests_participants_update on public.session_booking_requests
  for update using (auth.uid() in (athlete_user_id, practitioner_user_id))
  with check (auth.uid() in (athlete_user_id, practitioner_user_id));

drop policy if exists session_bookings_participants on public.session_bookings;
create policy session_bookings_participants on public.session_bookings
  for select using (auth.uid() in (athlete_user_id, practitioner_user_id));

drop policy if exists clinical_records_practitioner_access on public.clinical_records;
create policy clinical_records_practitioner_access on public.clinical_records
  for select using (
    auth.uid() = practitioner_id
    and exists (
      select 1
      from public.practitioner_athlete_links pal
      where pal.practitioner_id = clinical_records.practitioner_id
        and pal.athlete_id = clinical_records.athlete_id
        and pal.status = 'active'
    )
  );

drop policy if exists clinical_records_practitioner_insert on public.clinical_records;
create policy clinical_records_practitioner_insert on public.clinical_records
  for insert with check (
    auth.uid() = practitioner_id
    and exists (
      select 1
      from public.practitioner_athlete_links pal
      where pal.practitioner_id = clinical_records.practitioner_id
        and pal.athlete_id = clinical_records.athlete_id
        and pal.status = 'active'
    )
  );

drop policy if exists clinical_records_practitioner_update on public.clinical_records;
create policy clinical_records_practitioner_update on public.clinical_records
  for update using (
    auth.uid() = practitioner_id
    and exists (
      select 1
      from public.practitioner_athlete_links pal
      where pal.practitioner_id = clinical_records.practitioner_id
        and pal.athlete_id = clinical_records.athlete_id
        and pal.status = 'active'
    )
  )
  with check (
    auth.uid() = practitioner_id
    and exists (
      select 1
      from public.practitioner_athlete_links pal
      where pal.practitioner_id = clinical_records.practitioner_id
        and pal.athlete_id = clinical_records.athlete_id
        and pal.status = 'active'
    )
  );

drop policy if exists clinical_access_logs_practitioner_select on public.clinical_access_logs;
create policy clinical_access_logs_practitioner_select on public.clinical_access_logs
  for select using (auth.uid() = practitioner_id);

drop policy if exists clinical_access_logs_practitioner_insert on public.clinical_access_logs;
create policy clinical_access_logs_practitioner_insert on public.clinical_access_logs
  for insert with check (auth.uid() = practitioner_id);

drop policy if exists clinical_access_settings_practitioner_select on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_select on public.clinical_access_settings
  for select using (auth.uid() = practitioner_id);

drop policy if exists clinical_access_settings_practitioner_insert on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_insert on public.clinical_access_settings
  for insert with check (auth.uid() = practitioner_id);

drop policy if exists clinical_access_settings_practitioner_update on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_update on public.clinical_access_settings
  for update using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists clinical_icd_reference_practitioner_select on public.clinical_icd_reference;
create policy clinical_icd_reference_practitioner_select on public.clinical_icd_reference
  for select using (public.current_user_role() = 'practitioner');

drop policy if exists video_rooms_participants on public.video_rooms;
create policy video_rooms_participants on public.video_rooms
  for select using (
    exists (
      select 1
      from public.session_bookings b
      where b.video_room_id = id
        and auth.uid() in (b.athlete_user_id, b.practitioner_user_id)
    )
  );

-- Storage RLS
drop policy if exists athlete_documents_storage_read on storage.objects;
create policy athlete_documents_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'athlete-documents');

drop policy if exists athlete_documents_storage_insert on storage.objects;
create policy athlete_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'athlete-documents');

drop policy if exists athlete_documents_storage_update on storage.objects;
create policy athlete_documents_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'athlete-documents')
  with check (bucket_id = 'athlete-documents');

drop policy if exists athlete_documents_storage_delete on storage.objects;
create policy athlete_documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'athlete-documents');

-- ------------------------------------------------------------
-- Grants / cache refresh
-- ------------------------------------------------------------

revoke all on function public.get_invite_email_context(uuid) from public, anon;
grant execute on function public.get_invite_email_context(uuid) to authenticated, service_role;

revoke all on function public.mark_invite_email_sent(uuid, text, text) from public, anon;
grant execute on function public.mark_invite_email_sent(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
