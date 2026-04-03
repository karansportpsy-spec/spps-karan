-- ============================================================
-- SPPS — Sport Psychology Practitioner Suite
-- Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor on a fresh project
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Organisations ─────────────────────────────────────────────
create table if not exists organisations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  type          text not null default 'club',
  country       text not null,
  state_province text,
  city          text,
  website_url   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Practitioners ─────────────────────────────────────────────
create table if not exists practitioners (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  first_name            text not null default '',
  last_name             text not null default '',
  role                  text not null default 'sport_psychologist'
                          check (role in ('sport_psychologist','counsellor','admin')),
  avatar_url            text,
  phone                 text,
  bio                   text,
  organisation_id       uuid references organisations(id) on delete set null,
  hipaa_acknowledged    boolean not null default false,
  compliance_completed  boolean not null default false,
  notification_email    boolean not null default true,
  notification_sms      boolean not null default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ── Athletes ──────────────────────────────────────────────────
create table if not exists athletes (
  id                      uuid primary key default uuid_generate_v4(),
  practitioner_id         uuid not null references practitioners(id) on delete cascade,
  first_name              text not null,
  last_name               text not null,
  email                   text,
  phone                   text,
  date_of_birth           date,
  sport                   text not null,
  team                    text,
  position                text,
  status                  text not null default 'active'
                            check (status in ('active','inactive','on_hold')),
  risk_level              text not null default 'low'
                            check (risk_level in ('low','moderate','high','critical')),
  avatar_url              text,
  notes                   text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ── Sessions ──────────────────────────────────────────────────
create table if not exists sessions (
  id                  uuid primary key default uuid_generate_v4(),
  practitioner_id     uuid not null references practitioners(id) on delete cascade,
  athlete_id          uuid not null references athletes(id) on delete cascade,
  session_type        text not null default 'individual'
                        check (session_type in ('individual','group','crisis','assessment','follow_up')),
  status              text not null default 'scheduled'
                        check (status in ('scheduled','completed','cancelled','no_show')),
  scheduled_at        timestamptz not null,
  duration_minutes    integer not null default 50,
  location            text,
  presenting_issues   text[],
  goals               text,
  interventions_used  text[],
  notes               text,
  risk_assessment     text check (risk_assessment in ('low','moderate','high','critical')),
  follow_up_required  boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── Check-Ins ─────────────────────────────────────────────────
create table if not exists check_ins (
  id                uuid primary key default uuid_generate_v4(),
  practitioner_id   uuid not null references practitioners(id) on delete cascade,
  athlete_id        uuid not null references athletes(id) on delete cascade,
  checked_in_at     timestamptz not null default now(),
  mood_score        integer not null check (mood_score between 1 and 10),
  stress_score      integer not null check (stress_score between 1 and 10),
  sleep_score       integer not null check (sleep_score between 1 and 10),
  motivation_score  integer not null check (motivation_score between 1 and 10),
  readiness_score   integer not null check (readiness_score between 1 and 10),
  notes             text,
  flags             text[],
  created_at        timestamptz default now()
);

-- ── Assessments ───────────────────────────────────────────────
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
  created_at       timestamptz default now()
);

-- ── Interventions ─────────────────────────────────────────────
create table if not exists interventions (
  id               uuid primary key default uuid_generate_v4(),
  practitioner_id  uuid not null references practitioners(id) on delete cascade,
  athlete_id       uuid not null references athletes(id) on delete cascade,
  session_id       uuid references sessions(id) on delete set null,
  category         text not null,
  title            text not null,
  description      text,
  protocol         text,
  rating           integer check (rating between 1 and 5),
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── Reports ───────────────────────────────────────────────────
create table if not exists reports (
  id                uuid primary key default uuid_generate_v4(),
  practitioner_id   uuid not null references practitioners(id) on delete cascade,
  athlete_id        uuid references athletes(id) on delete set null,
  report_type       text not null default 'progress'
                      check (report_type in ('progress','assessment_summary','session_summary','crisis','custom')),
  title             text not null,
  content           text not null,
  generated_at      timestamptz not null default now(),
  is_ai_generated   boolean not null default false,
  created_at        timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────
alter table practitioners  enable row level security;
alter table organisations  enable row level security;
alter table athletes       enable row level security;
alter table sessions       enable row level security;
alter table check_ins      enable row level security;
alter table assessments    enable row level security;
alter table interventions  enable row level security;
alter table reports        enable row level security;

-- Practitioners: own row only
create policy "practitioners_own"   on practitioners  for all using (auth.uid() = id);

-- Organisations: readable by all authenticated users
create policy "orgs_read"           on organisations  for select using (auth.role() = 'authenticated');
create policy "orgs_insert"         on organisations  for insert with check (auth.role() = 'authenticated');

-- All practitioner-owned tables: scoped by practitioner_id
create policy "athletes_own"        on athletes       for all using (auth.uid() = practitioner_id);
create policy "sessions_own"        on sessions       for all using (auth.uid() = practitioner_id);
create policy "checkins_own"        on check_ins      for all using (auth.uid() = practitioner_id);
create policy "assessments_own"     on assessments    for all using (auth.uid() = practitioner_id);
create policy "interventions_own"   on interventions  for all using (auth.uid() = practitioner_id);
create policy "reports_own"         on reports        for all using (auth.uid() = practitioner_id);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_athletes_practitioner       on athletes(practitioner_id);
create index if not exists idx_athletes_status             on athletes(status);
create index if not exists idx_athletes_risk               on athletes(risk_level);
create index if not exists idx_sessions_practitioner       on sessions(practitioner_id);
create index if not exists idx_sessions_athlete            on sessions(athlete_id);
create index if not exists idx_sessions_scheduled_at       on sessions(scheduled_at desc);
create index if not exists idx_checkins_practitioner       on check_ins(practitioner_id);
create index if not exists idx_checkins_athlete            on check_ins(athlete_id);
create index if not exists idx_checkins_checked_in_at      on check_ins(checked_in_at desc);
create index if not exists idx_assessments_practitioner    on assessments(practitioner_id);
create index if not exists idx_interventions_practitioner  on interventions(practitioner_id);
create index if not exists idx_reports_practitioner        on reports(practitioner_id);

-- ── Updated-at trigger ────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger trg_practitioners_updated_at
  before update on practitioners for each row execute function update_updated_at();
create or replace trigger trg_athletes_updated_at
  before update on athletes for each row execute function update_updated_at();
create or replace trigger trg_sessions_updated_at
  before update on sessions for each row execute function update_updated_at();
create or replace trigger trg_interventions_updated_at
  before update on interventions for each row execute function update_updated_at();
