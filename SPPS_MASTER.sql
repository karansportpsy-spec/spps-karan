-- ================================================================
-- SPPS — Sport Psychology Practitioner Suite
-- MASTER MIGRATION — Single clean script for existing database
-- Safe to run on a database that already has tables/columns/policies
-- Uses IF NOT EXISTS, OR REPLACE, DROP IF EXISTS throughout
-- ================================================================

-- ── EXTENSIONS ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ================================================================
-- SECTION 1: TABLES (all use CREATE TABLE IF NOT EXISTS)
-- ================================================================

-- ── ORGANISATIONS ────────────────────────────────────────────────
create table if not exists organisations (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  type             text not null default 'High Performance Centre'
                     check (type in (
                       'High Performance Centre (HPC)',
                       'National Federation',
                       'State Sports Authority',
                       'University / College',
                       'Private Academy',
                       'Hospital / Clinic',
                       'Research Institution',
                       'Other'
                     )),
  country          text not null default 'India',
  state_province   text,
  city             text,
  website_url      text,
  sport_disciplines  text[]  default '{}',
  athletes_served    integer,
  verification_code  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── PRACTITIONERS ─────────────────────────────────────────────────
create table if not exists practitioners (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  first_name      text not null default '',
  last_name       text not null default '',
  role            text not null default 'sport_psychologist',
  mobile          text,
  avatar_url      text,
  organisation_id uuid references organisations(id) on delete set null,
  -- Profile setup fields
  professional_role    text,
  organisation_name    text,
  organisation_type    text,
  specialisation_areas text[]  default '{}',
  years_of_practice    integer check (years_of_practice >= 0),
  highest_qualification     text,
  professional_registration text,
  preferred_session_mode    text default 'in_person'
                              check (preferred_session_mode in ('in_person','virtual','hybrid')),
  phone  text,
  bio    text,
  -- Compliance gates (4 steps)
  hipaa_acknowledged         boolean not null default false,
  hipaa_acknowledged_at      timestamptz,
  user_agreement_accepted    boolean not null default false,
  user_agreement_accepted_at timestamptz,
  terms_accepted             boolean not null default false,
  terms_accepted_at          timestamptz,
  data_privacy_accepted      boolean not null default false,
  data_privacy_accepted_at   timestamptz,
  analytics_consent          boolean not null default false,
  compliance_completed       boolean not null default false,
  -- Profile completion flag
  profile_completed          boolean not null default false,
  -- Notification preferences
  notification_email  boolean not null default true,
  notification_sms    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Fix role constraint to include all roles used by the app
alter table practitioners drop constraint if exists practitioners_role_check;
alter table practitioners add constraint practitioners_role_check
  check (role in (
    'sport_psychologist','counsellor','psychometrist',
    'researcher','student_intern','admin'
  ));

-- Add any columns that may be missing (safe on existing tables)
alter table practitioners add column if not exists professional_role    text;
alter table practitioners add column if not exists organisation_name    text;
alter table practitioners add column if not exists organisation_type    text;
alter table practitioners add column if not exists years_of_practice    integer;
alter table practitioners add column if not exists specialisation_areas text[];
alter table practitioners add column if not exists bio                  text;
alter table practitioners add column if not exists profile_completed    boolean not null default false;
alter table practitioners add column if not exists notification_email   boolean not null default true;
alter table practitioners add column if not exists notification_sms     boolean not null default false;

-- ── ATHLETES ──────────────────────────────────────────────────────
create table if not exists athletes (
  id              uuid primary key default uuid_generate_v4(),
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  first_name      text not null,
  middle_name     text,
  last_name       text not null,
  gender          text check (gender in ('male','female','non_binary','prefer_not_to_say')),
  date_of_birth   date,
  nationality     text default 'Indian',
  state_ut        text,
  city            text,
  email           text,
  phone           text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  id_number       text,
  academy         text,
  coach_name      text,
  sport           text not null,
  secondary_sport text,
  team            text,
  position        text,
  competitive_level text default 'senior'
                    check (competitive_level in ('senior','junior','youth','elite','masters','para')),
  competition_category text check (competition_category in ('mens','womens','mixed_open')),
  classification  text check (classification in ('open_senior','junior_u20','youth_u18','para_athlete','masters')),
  years_training   integer check (years_training >= 0),
  years_competing  integer check (years_competing >= 0),
  personal_best    text,
  next_major_competition text,
  season_goal      text,
  head_coach            text,
  strength_cond_coach   text,
  sports_science_lead   text,
  prior_psych_support   text default 'no'
                          check (prior_psych_support in ('yes_ongoing','yes_previously','no')),
  prior_support_details    text,
  presenting_concerns      text,
  mental_health_history    text[]  default '{}',
  substance_use  text default 'none'
                   check (substance_use in ('none','supplements_only','social_alcohol','other')),
  preferred_session_modality text default 'in_person'
                                check (preferred_session_modality in ('in_person','virtual','hybrid')),
  medical_conditions     text,
  current_medications    text,
  previous_injuries      text,
  additional_medical_notes text,
  status      text not null default 'active'
                check (status in ('active','inactive','on_hold')),
  risk_level  text not null default 'low'
                check (risk_level in ('low','moderate','high','critical')),
  avatar_url  text,
  notes       text,
  uid_code    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- uid_code column and constraints
alter table athletes add column if not exists uid_code text;

-- Backfill uid_code for existing athletes
update athletes
set uid_code = 'WMP-' || to_char(coalesce(created_at, now()), 'YYYY') || '-' ||
               upper(substring(md5(id::text || coalesce(created_at::text, '')) for 6))
where uid_code is null or uid_code = '';

-- Make uid_code not null and unique
alter table athletes alter column uid_code set not null;
alter table athletes drop constraint if exists athletes_uid_code_key;
alter table athletes add constraint athletes_uid_code_key unique (uid_code);

-- Add other missing athlete columns
alter table athletes add column if not exists age_group text;

-- ── ATHLETE CONSENT FORMS ─────────────────────────────────────────
create table if not exists athlete_consent_forms (
  id               uuid primary key default uuid_generate_v4(),
  athlete_id       uuid not null references athletes(id) on delete cascade,
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  consent_signed     boolean not null default false,
  consent_date       date,
  consent_file_url   text,
  declaration_read_form      boolean not null default false,
  declaration_gives_consent  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── PARENTAL / GUARDIAN RELEASES ──────────────────────────────────
create table if not exists parental_guardian_releases (
  id               uuid primary key default uuid_generate_v4(),
  athlete_id       uuid not null references athletes(id) on delete cascade,
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  guardian_full_name  text not null,
  relationship        text not null,
  guardian_mobile     text not null,
  guardian_email      text,
  guardian_address    text not null,
  decl_is_legal_guardian          boolean not null default false,
  decl_consents_data_processing   boolean not null default false,
  decl_consents_retention_7yr     boolean not null default false,
  decl_understands_withdrawal     boolean not null default false,
  consent_date       date not null default current_date,
  release_file_url   text,
  created_at  timestamptz not null default now()
);

-- ── SESSIONS ──────────────────────────────────────────────────────
create table if not exists sessions (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  session_type     text not null default 'individual'
                     check (session_type in ('individual','group','crisis','assessment','follow_up')),
  status           text not null default 'scheduled'
                     check (status in ('scheduled','completed','cancelled','no_show')),
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  location         text,
  presenting_issues text[],
  goals            text,
  interventions_used text[],
  notes            text,
  risk_assessment  text check (risk_assessment in ('low','moderate','high','critical')),
  follow_up_required boolean not null default false,
  homework         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table sessions add column if not exists homework text;

-- ── CHECK-INS ─────────────────────────────────────────────────────
create table if not exists check_ins (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  checked_in_at    timestamptz not null default now(),
  mood_score       integer not null check (mood_score between 1 and 10),
  stress_score     integer not null check (stress_score between 1 and 10),
  sleep_score      integer not null check (sleep_score between 1 and 10),
  motivation_score integer not null check (motivation_score between 1 and 10),
  readiness_score  integer not null check (readiness_score between 1 and 10),
  fatigue_score    integer check (fatigue_score between 1 and 10),
  energy_score     integer check (energy_score between 1 and 10),
  soreness_score   integer check (soreness_score between 1 and 10),
  notes   text,
  flags   text[],
  status  text not null default 'submitted'
            check (status in ('submitted','flagged','reviewed')),
  created_at  timestamptz not null default now()
);

alter table check_ins add column if not exists energy_score   integer check (energy_score between 1 and 10);
alter table check_ins add column if not exists soreness_score integer check (soreness_score between 1 and 10);

-- ── ASSESSMENTS ───────────────────────────────────────────────────
create table if not exists assessments (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  tool             text not null,
  administered_at  timestamptz not null default now(),
  scores           jsonb not null default '{}',
  total_score      numeric,
  interpretation   text,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table assessments drop constraint if exists assessments_tool_check;
alter table assessments add constraint assessments_tool_check
  check (tool in ('APAS','PSAS','SCES','TRPS','MFAS','CFAS','Custom'));

-- ── ASSESSMENT ITEMS (reference data) ────────────────────────────
create table if not exists assessment_items (
  id           uuid primary key default uuid_generate_v4(),
  tool         text not null,
  item_number  integer not null,
  item_text    text not null,
  subscale     text,
  reverse_scored boolean not null default false,
  unique(tool, item_number)
);

-- ── ASSESSMENT RESPONSES ──────────────────────────────────────────
create table if not exists assessment_responses (
  id             uuid primary key default uuid_generate_v4(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  item_id        uuid not null references assessment_items(id) on delete cascade,
  response_value integer not null,
  created_at     timestamptz not null default now()
);

-- ── INTERVENTIONS ─────────────────────────────────────────────────
create table if not exists interventions (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  session_id       uuid references sessions(id) on delete set null,
  category         text not null
                     check (category in (
                       'Cognitive Restructuring','Relaxation','Imagery','Goal Setting',
                       'Mindfulness','Confidence Building','Team Cohesion',
                       'Crisis Protocol','Other'
                     )),
  title            text not null,
  description      text,
  protocol         text,
  rating           integer check (rating between 1 and 5),
  outcome          text,
  status           text default 'active',
  notes            text,
  intervention_date date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table interventions add column if not exists outcome text;
alter table interventions add column if not exists status  text default 'active';
alter table interventions add column if not exists intervention_date date not null default current_date;

-- ── REPORTS ───────────────────────────────────────────────────────
create table if not exists reports (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid references athletes(id) on delete set null,
  report_type      text not null
                     check (report_type in (
                       'progress','assessment_summary','session_summary','crisis','custom'
                     )),
  title            text not null,
  content          text not null,
  generated_at     timestamptz not null default now(),
  is_ai_generated  boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ── PHI AUDIT LOG ─────────────────────────────────────────────────
create table if not exists phi_audit_log (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  data_type        text not null,
  data_reference   uuid,
  recipient_name   text not null,
  recipient_role   text not null,
  authorised_under text,
  share_method     text not null default 'in_app_notification'
                     check (share_method in (
                       'in_app_notification','secure_email',
                       'printed_report','verbal_with_consent'
                     )),
  shared_at   timestamptz not null default now(),
  ip_address  text
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────
create table if not exists notifications (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  type  text not null
          check (type in (
            'checkin_flagged','assessment_due','session_reminder',
            'compliance_renewal','ai_insight_ready','report_exported',
            'athlete_added','risk_flag'
          )),
  title    text not null,
  message  text not null,
  is_read  boolean not null default false,
  related_entity_type  text,
  related_entity_id    uuid,
  created_at  timestamptz not null default now()
);

-- ── PSYCHOPHYSIOLOGY ──────────────────────────────────────────────
create table if not exists psychophysiology (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  session_context  text default 'resting',
  hrv              jsonb default '{}',
  vitals           jsonb default '{}',
  emg              jsonb default '[]',
  eeg              jsonb default '{}',
  gsr              jsonb default '{}',
  device_used      text,
  notes            text,
  created_at       timestamptz default now()
);

-- ── NEUROCOGNITIVE ────────────────────────────────────────────────
create table if not exists neurocognitive (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  platform         text not null,
  test_date        date,
  comparison_group text,
  context          text default 'baseline',
  senaptec_scores  jsonb,
  custom_metrics   jsonb,
  notes            text,
  raw_report_notes text,
  created_at       timestamptz default now()
);

-- ── CUSTOM ASSESSMENTS ────────────────────────────────────────────
create table if not exists custom_assessments (
  id                   uuid primary key default uuid_generate_v4(),
  athlete_id           uuid not null references athletes(id) on delete cascade,
  practitioner_id      uuid not null references practitioners(id) on delete cascade,
  name                 text not null,
  tool_source          text,
  administered_at      date not null default current_date,
  sub_scales           jsonb not null default '[]',
  overall_notes        text,
  practitioner_summary text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── CONSENT FORMS ─────────────────────────────────────────────────
create table if not exists consent_forms (
  id                    uuid primary key default gen_random_uuid(),
  practitioner_id       uuid not null references auth.users(id) on delete cascade,
  athlete_id            uuid not null references athletes(id) on delete cascade,
  form_type             text not null check (form_type in (
                          'consent_confidentiality','parental_release',
                          'photo_media','emergency_medical'
                        )),
  status                text not null default 'pending'
                          check (status in ('pending','signed','expired','uploaded')),
  signed_by             text not null default '',
  signed_at             timestamptz,
  valid_until           timestamptz,
  guardian_name         text,
  guardian_relationship text,
  guardian_email        text,
  guardian_phone        text,
  notes                 text,
  file_url              text,
  form_data             jsonb default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── INJURY RECORDS ────────────────────────────────────────────────
create table if not exists injury_records (
  id                  uuid primary key default gen_random_uuid(),
  practitioner_id     uuid not null references auth.users(id) on delete cascade,
  athlete_id          uuid not null references athletes(id) on delete cascade,
  diagnosis_text      text not null,
  osiics_code_1       text,
  osiics_diagnosis_1  text,
  osiics_body_part_1  text,
  osiics_injury_type_1 text,
  osiics_medical_system_1 text,
  osiics_pathology_1  text,
  osiics_code_2       text,
  osiics_diagnosis_2  text,
  osiics_body_part_2  text,
  osiics_injury_type_2 text,
  mechanism           text not null default 'Unknown',
  context             text not null default 'unknown'
                        check (context in ('training','match','gym','rehab','unknown')),
  date_of_injury      timestamptz not null,
  date_of_return      timestamptz,
  missed_days         integer,
  missed_matches      integer,
  severity            text not null default 'moderate'
                        check (severity in ('minimal','mild','moderate','severe','career_threatening')),
  status              text not null default 'acute'
                        check (status in ('acute','subacute','chronic','recovered','reinjury')),
  psych_referral_needed boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── PSYCH READINESS ───────────────────────────────────────────────
create table if not exists psych_readiness (
  id                  uuid primary key default gen_random_uuid(),
  practitioner_id     uuid not null references auth.users(id) on delete cascade,
  athlete_id          uuid not null references athletes(id) on delete cascade,
  injury_id           uuid references injury_records(id) on delete set null,
  assessed_at         timestamptz not null default now(),
  acl_rsi_scores      jsonb not null default '{}',
  acl_rsi_total       integer not null default 0,
  tsk_scores          jsonb not null default '{}',
  tsk_total           integer not null default 0,
  sirsi_scores        jsonb not null default '{}',
  sirsi_total         integer not null default 0,
  overall_readiness   integer not null default 0,
  ready_to_return     boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now()
);

-- ── ATHLETE DOCUMENTS ─────────────────────────────────────────────
create table if not exists athlete_documents (
  id                  uuid primary key default gen_random_uuid(),
  practitioner_id     uuid not null references auth.users(id) on delete cascade,
  athlete_id          uuid not null references athletes(id) on delete cascade,
  file_name           text not null,
  file_type           text not null,
  file_size_kb        integer,
  storage_path        text,
  document_category   text not null default 'other'
                        check (document_category in (
                          'medical_report','psychological_assessment','physiotherapy_report',
                          'coach_report','performance_data','competition_results',
                          'training_log','referral_letter','consent_form',
                          'correspondence','session_notes','nutrition_report',
                          'injury_report','other'
                        )),
  extracted_text      text,
  ai_summary          text,
  ai_key_findings     jsonb default '[]',
  ai_flags            jsonb default '[]',
  ai_recommendations  text,
  ai_confidence       integer default 0,
  practitioner_notes  text,
  uploaded_at         timestamptz not null default now(),
  analysed_at         timestamptz,
  created_at          timestamptz not null default now()
);

alter table athlete_documents add column if not exists analysed_at timestamptz;

-- ── LAB SESSIONS ──────────────────────────────────────────────────
create table if not exists public.lab_sessions (
  id               uuid default gen_random_uuid() primary key,
  practitioner_id  uuid not null references auth.users(id) on delete cascade,
  athlete_id       uuid not null references public.athletes(id) on delete cascade,
  technology       text not null check (technology in (
    'eeg_eego','fnirs_nirsport','fnirs_brite23','tdcs_soterix',
    'vr_rezzil','cantab','eye_eyelink','motion_optitrack',
    'gps_catapult','cognitive_neurotracker'
  )),
  session_date     date not null default current_date,
  duration_minutes integer,
  protocol         text,
  scores           jsonb not null default '{}',
  flags            text[] not null default '{}',
  notes            text,
  consent_given    boolean not null default false,
  import_source    text,
  created_at       timestamptz not null default now()
);

-- Update lab_sessions technology constraint to include all values
alter table public.lab_sessions drop constraint if exists lab_sessions_technology_check;
alter table public.lab_sessions add constraint lab_sessions_technology_check
  check (technology in (
    'eeg_eego','fnirs_nirsport','fnirs_brite23','tdcs_soterix',
    'vr_rezzil','cantab','eye_eyelink','motion_optitrack',
    'gps_catapult','cognitive_neurotracker'
  ));

alter table lab_sessions add column if not exists consent_given boolean not null default false;
alter table lab_sessions add column if not exists import_source text;

-- ── PERFORMANCE PROFILES ──────────────────────────────────────────
create table if not exists public.performance_profiles (
  id               uuid default gen_random_uuid() primary key,
  practitioner_id  uuid not null references auth.users(id) on delete cascade,
  athlete_id       uuid not null references public.athletes(id) on delete cascade,
  domain_id        text not null,
  scores           jsonb not null default '{}',
  notes            text,
  created_at       timestamptz not null default now()
);

-- ================================================================
-- SECTION 2: STORAGE BUCKET
-- ================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-documents',
  'athlete-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/json'
  ]
)
on conflict (id) do nothing;

-- ================================================================
-- SECTION 3: FUNCTIONS
-- ================================================================

-- Auto-update updated_at timestamp
create or replace function spps_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-compute compliance_completed from the 4 gate fields
create or replace function spps_sync_compliance_completed()
returns trigger language plpgsql as $$
begin
  new.compliance_completed := (
    new.hipaa_acknowledged      = true and
    new.user_agreement_accepted = true and
    new.terms_accepted          = true and
    new.data_privacy_accepted   = true
  );
  return new;
end;
$$;

-- Auto-flag check-ins that exceed stress/fatigue thresholds
create or replace function spps_auto_flag_checkin()
returns trigger language plpgsql as $$
begin
  if (
    new.stress_score >= 7 or
    (new.fatigue_score is not null and new.fatigue_score <= 3) or
    (new.soreness_score is not null and new.soreness_score >= 7) or
    new.mood_score <= 3
  ) then
    new.status = 'flagged';
  else
    new.status = 'submitted';
  end if;
  return new;
end;
$$;

-- Auto-assign WMP UID to new athletes
create or replace function public.assign_athlete_uid()
returns trigger language plpgsql as $$
declare
  candidate text;
  attempts  int := 0;
begin
  if new.uid_code is not null and new.uid_code <> '' then
    return new;
  end if;
  loop
    candidate := 'WMP-' || to_char(now(), 'YYYY') || '-' ||
                 upper(substring(md5(gen_random_uuid()::text) for 6));
    if not exists (select 1 from public.athletes where uid_code = candidate) then
      new.uid_code := candidate;
      return new;
    end if;
    attempts := attempts + 1;
    if attempts >= 10 then
      new.uid_code := 'WMP-' || to_char(now(), 'YYYY') || '-' ||
                      upper(substring(md5(gen_random_uuid()::text) for 8));
      return new;
    end if;
  end loop;
end;
$$;

-- Auto-expire consent forms past valid_until
create or replace function expire_consent_forms()
returns void language plpgsql as $$
begin
  update consent_forms
  set status = 'expired', updated_at = now()
  where status = 'signed'
    and valid_until is not null
    and valid_until < now();
end;
$$;

-- set_updated_at alias for tables using that name
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── AUTO-CREATE PRACTITIONERS ROW ON SIGNUP ─────────────────────
-- Runs as postgres (SECURITY DEFINER) — bypasses RLS completely.
-- This is the ONLY reliable way to create the practitioners row
-- because the client may not have a session yet at signup time
-- (especially when email confirmation is enabled in Supabase).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.practitioners (
    id, email, first_name, last_name, role,
    hipaa_acknowledged, compliance_completed, profile_completed,
    notification_email, notification_sms
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name',  ''),
    coalesce(new.raw_user_meta_data->>'role', 'sport_psychologist'),
    false, false, false, true, false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ================================================================
-- SECTION 4: TRIGGERS
-- ================================================================

-- updated_at triggers
drop trigger if exists trg_organisations_updated_at   on organisations;
drop trigger if exists trg_practitioners_updated_at   on practitioners;
drop trigger if exists trg_athletes_updated_at         on athletes;
drop trigger if exists trg_sessions_updated_at         on sessions;
drop trigger if exists trg_interventions_updated_at    on interventions;

create trigger trg_organisations_updated_at
  before update on organisations
  for each row execute function spps_set_updated_at();

create trigger trg_practitioners_updated_at
  before update on practitioners
  for each row execute function spps_set_updated_at();

create trigger trg_athletes_updated_at
  before update on athletes
  for each row execute function spps_set_updated_at();

create trigger trg_sessions_updated_at
  before update on sessions
  for each row execute function spps_set_updated_at();

create trigger trg_interventions_updated_at
  before update on interventions
  for each row execute function spps_set_updated_at();

-- Compliance auto-compute trigger
drop trigger if exists trg_practitioners_compliance on practitioners;
create trigger trg_practitioners_compliance
  before insert or update on practitioners
  for each row execute function spps_sync_compliance_completed();

-- Check-in auto-flag trigger
drop trigger if exists trg_checkin_auto_flag on check_ins;
create trigger trg_checkin_auto_flag
  before insert on check_ins
  for each row execute function spps_auto_flag_checkin();

-- Athlete UID auto-assign trigger
drop trigger if exists trg_assign_athlete_uid on public.athletes;
create trigger trg_assign_athlete_uid
  before insert on public.athletes
  for each row execute function public.assign_athlete_uid();

-- Custom assessments updated_at
drop trigger if exists trg_custom_assessments_updated on custom_assessments;
create trigger trg_custom_assessments_updated
  before update on custom_assessments
  for each row execute function set_updated_at();

-- ── NEW USER TRIGGER (the critical fix for signup) ───────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- ================================================================

-- Enable RLS on all tables
alter table organisations              enable row level security;
alter table practitioners              enable row level security;
alter table athletes                   enable row level security;
alter table athlete_consent_forms      enable row level security;
alter table parental_guardian_releases enable row level security;
alter table sessions                   enable row level security;
alter table check_ins                  enable row level security;
alter table assessments                enable row level security;
alter table assessment_items           enable row level security;
alter table assessment_responses       enable row level security;
alter table interventions              enable row level security;
alter table reports                    enable row level security;
alter table phi_audit_log              enable row level security;
alter table notifications              enable row level security;
alter table psychophysiology           enable row level security;
alter table neurocognitive             enable row level security;
alter table custom_assessments         enable row level security;
alter table consent_forms              enable row level security;
alter table injury_records             enable row level security;
alter table psych_readiness            enable row level security;
alter table athlete_documents          enable row level security;
alter table public.lab_sessions        enable row level security;
alter table public.performance_profiles enable row level security;

-- ── PRACTITIONERS: drop every known policy, recreate clean ────────
drop policy if exists "practitioners_all"                    on public.practitioners;
drop policy if exists "practitioners_select_own"             on public.practitioners;
drop policy if exists "practitioners_insert_own"             on public.practitioners;
drop policy if exists "practitioners_update_own"             on public.practitioners;
drop policy if exists "practitioners can update own profile" on public.practitioners;
drop policy if exists "practitioners can insert own profile" on public.practitioners;
drop policy if exists "Users can view own practitioner"      on public.practitioners;
drop policy if exists "Users can insert own practitioner"    on public.practitioners;
drop policy if exists "Users can update own practitioner"    on public.practitioners;
drop policy if exists "Enable read access for own data"      on public.practitioners;
drop policy if exists "Enable insert for own data"           on public.practitioners;
drop policy if exists "Enable update for own data"           on public.practitioners;
drop policy if exists "Enable insert for authenticated users only" on public.practitioners;

-- Three explicit policies (FOR ALL silently blocks upserts in Supabase)
create policy "practitioners_select_own"
  on public.practitioners for select
  using (auth.uid() = id);

create policy "practitioners_insert_own"
  on public.practitioners for insert
  with check (auth.uid() = id);

create policy "practitioners_update_own"
  on public.practitioners for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── ALL OTHER TABLES ──────────────────────────────────────────────
create policy "orgs_select" on organisations for select
  using (auth.role() = 'authenticated');
create policy "orgs_insert" on organisations for insert
  with check (auth.role() = 'authenticated');
create policy "orgs_update" on organisations for update
  using (auth.role() = 'authenticated');

create policy "assessment_items_select" on assessment_items for select
  using (auth.role() = 'authenticated');

create policy "athletes_own" on athletes for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "athlete_consent_forms_own" on athlete_consent_forms for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "parental_guardian_releases_own" on parental_guardian_releases for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "sessions_own" on sessions for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "check_ins_own" on check_ins for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "assessments_own" on assessments for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "assessment_responses_own" on assessment_responses for all
  using (exists (
    select 1 from assessments a
    where a.id = assessment_responses.assessment_id
      and a.practitioner_id = auth.uid()
  ))
  with check (exists (
    select 1 from assessments a
    where a.id = assessment_responses.assessment_id
      and a.practitioner_id = auth.uid()
  ));

create policy "interventions_own" on interventions for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "reports_own" on reports for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "phi_audit_log_own" on phi_audit_log for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "notifications_own" on notifications for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "physio_own" on psychophysiology for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

create policy "neuro_own" on neurocognitive for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists "custom_assessments_own"    on custom_assessments;
drop policy if exists "custom_assessments_insert" on custom_assessments;
drop policy if exists "custom_assessments_update" on custom_assessments;
drop policy if exists "custom_assessments_delete" on custom_assessments;
create policy "custom_assessments_own" on custom_assessments for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists "Practitioner manages own consent forms" on consent_forms;
create policy "Practitioner manages own consent forms" on consent_forms for all
  using (auth.uid() = practitioner_id);

drop policy if exists "Practitioner manages own injury records" on injury_records;
create policy "Practitioner manages own injury records" on injury_records for all
  using (auth.uid() = practitioner_id);

drop policy if exists "Practitioner manages own psych readiness" on psych_readiness;
create policy "Practitioner manages own psych readiness" on psych_readiness for all
  using (auth.uid() = practitioner_id);

drop policy if exists "Practitioners manage own athlete documents" on athlete_documents;
create policy "Practitioners manage own athlete documents" on athlete_documents for all
  using (auth.uid() = practitioner_id)
  with check (auth.uid() = practitioner_id);

drop policy if exists "practitioners see own lab sessions" on public.lab_sessions;
create policy "practitioners see own lab sessions" on public.lab_sessions for all
  using (practitioner_id = auth.uid())
  with check (practitioner_id = auth.uid());

create policy "own profiles" on public.performance_profiles for all
  using (practitioner_id = auth.uid())
  with check (practitioner_id = auth.uid());

-- Storage policy
drop policy if exists "Practitioners manage own athlete documents storage" on storage.objects;
create policy "Practitioners manage own athlete documents storage"
  on storage.objects for all
  using (
    bucket_id = 'athlete-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ================================================================
-- SECTION 6: INDEXES
-- ================================================================

create index if not exists idx_athletes_practitioner    on athletes(practitioner_id);
create index if not exists idx_athletes_first_name      on athletes(first_name);
create index if not exists idx_athletes_status          on athletes(status);
create index if not exists idx_athletes_risk_level      on athletes(risk_level);
create index if not exists idx_athletes_sport           on athletes(sport);
create index if not exists idx_athletes_name_trgm       on athletes
  using gin ((first_name || ' ' || last_name) gin_trgm_ops);

create index if not exists idx_sessions_practitioner    on sessions(practitioner_id);
create index if not exists idx_sessions_athlete         on sessions(athlete_id);
create index if not exists idx_sessions_scheduled_at    on sessions(scheduled_at desc);
create index if not exists idx_sessions_status          on sessions(status);

create index if not exists idx_checkins_practitioner    on check_ins(practitioner_id);
create index if not exists idx_checkins_athlete         on check_ins(athlete_id);
create index if not exists idx_checkins_checked_in_at   on check_ins(checked_in_at desc);
create index if not exists idx_checkins_status          on check_ins(status);

create index if not exists idx_assessments_practitioner on assessments(practitioner_id);
create index if not exists idx_assessments_athlete      on assessments(athlete_id);
create index if not exists idx_assessments_tool         on assessments(tool);
create index if not exists idx_assessments_admin_at     on assessments(administered_at desc);

create index if not exists idx_assessment_items_tool    on assessment_items(tool);
create index if not exists idx_responses_assessment     on assessment_responses(assessment_id);

create index if not exists idx_interventions_practitioner on interventions(practitioner_id);
create index if not exists idx_interventions_athlete      on interventions(athlete_id);
create index if not exists idx_interventions_category     on interventions(category);
create index if not exists idx_interventions_created_at   on interventions(created_at desc);

create index if not exists idx_reports_practitioner     on reports(practitioner_id);
create index if not exists idx_reports_athlete          on reports(athlete_id);
create index if not exists idx_reports_created_at       on reports(created_at desc);

create index if not exists idx_phi_practitioner         on phi_audit_log(practitioner_id);
create index if not exists idx_phi_athlete              on phi_audit_log(athlete_id);

create index if not exists idx_notifications_practitioner on notifications(practitioner_id);
create index if not exists idx_notifications_unread       on notifications(practitioner_id, is_read)
  where is_read = false;

create index if not exists idx_consent_athlete          on athlete_consent_forms(athlete_id);
create index if not exists idx_parental_athlete         on parental_guardian_releases(athlete_id);

create index if not exists consent_forms_practitioner_idx on consent_forms(practitioner_id);
create index if not exists consent_forms_athlete_idx      on consent_forms(athlete_id);
create index if not exists consent_forms_status_idx       on consent_forms(status);

create index if not exists injury_records_practitioner_idx on injury_records(practitioner_id);
create index if not exists injury_records_athlete_idx      on injury_records(athlete_id);
create index if not exists injury_records_date_idx         on injury_records(date_of_injury desc);
create index if not exists injury_records_osiics_idx       on injury_records(osiics_code_1);

create index if not exists psych_readiness_practitioner_idx on psych_readiness(practitioner_id);
create index if not exists psych_readiness_athlete_idx      on psych_readiness(athlete_id);
create index if not exists psych_readiness_injury_idx       on psych_readiness(injury_id);
create index if not exists psych_readiness_date_idx         on psych_readiness(assessed_at desc);

create index if not exists athlete_docs_practitioner_idx on athlete_documents(practitioner_id);
create index if not exists athlete_docs_athlete_idx      on athlete_documents(athlete_id);
create index if not exists athlete_docs_category_idx     on athlete_documents(document_category);

create index if not exists lab_sessions_practitioner_idx on public.lab_sessions(practitioner_id);
create index if not exists lab_sessions_athlete_idx      on public.lab_sessions(athlete_id);
create index if not exists lab_sessions_technology_idx   on public.lab_sessions(technology);
create index if not exists lab_sessions_date_idx         on public.lab_sessions(session_date desc);
create index if not exists lab_sessions_scores_gin       on public.lab_sessions using gin(scores);

create index if not exists idx_custom_assessments_athlete      on custom_assessments(athlete_id);
create index if not exists idx_custom_assessments_practitioner on custom_assessments(practitioner_id);

-- ================================================================
-- SECTION 7: VIEWS
-- ================================================================

create or replace view public.athlete_lab_profiles as
  select distinct on (athlete_id, technology)
    id, practitioner_id, athlete_id, technology,
    session_date, scores, flags, created_at
  from public.lab_sessions
  order by athlete_id, technology, session_date desc, created_at desc;

alter view public.athlete_lab_profiles owner to postgres;
grant select on public.athlete_lab_profiles to authenticated;

-- ================================================================
-- SECTION 8: DATA FIXES — Backfill existing users
-- ================================================================

-- Create practitioners rows for any auth users that don't have one.
-- This fixes all users (Jane Smith, Joe Smith, etc.) who signed up
-- after the old practitioners_all policy was dropped.
insert into public.practitioners (
  id, email, first_name, last_name, role,
  hipaa_acknowledged, compliance_completed, profile_completed,
  notification_email, notification_sms
)
select
  au.id,
  coalesce(au.email, ''),
  coalesce(au.raw_user_meta_data->>'first_name', ''),
  coalesce(au.raw_user_meta_data->>'last_name',  ''),
  coalesce(au.raw_user_meta_data->>'role', 'sport_psychologist'),
  false, false, false, true, false
from auth.users au
where not exists (
  select 1 from public.practitioners p where p.id = au.id
);

-- Backfill profile_completed for practitioners who finished compliance
update public.practitioners
  set profile_completed = true
  where compliance_completed = true
    and (profile_completed is null or profile_completed = false);

-- ================================================================
-- SECTION 9: VERIFICATION
-- ================================================================

-- Run after the script — every row should have has_practitioners_row = true
select
  au.email                       as auth_email,
  (p.id is not null)             as has_practitioners_row,
  coalesce(p.first_name, '?')    as first_name,
  coalesce(p.last_name, '?')     as last_name,
  p.compliance_completed,
  p.profile_completed
from auth.users au
left join public.practitioners p on p.id = au.id
order by au.created_at desc;

