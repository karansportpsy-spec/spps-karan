-- 20260415_dual_portal_upgrade.sql
-- SPPS dual-portal, chat, progress tracking, transactional assessments, and daily log reflection support.

begin;

create extension if not exists pgcrypto;

-- ---------- Align existing legacy tables to current app schema ----------
-- These ALTERs are safe on both fresh and pre-existing databases.

-- psychophysiology (legacy instances may miss newer JSON columns + device_used)
alter table if exists psychophysiology
  add column if not exists session_context text,
  add column if not exists hrv jsonb not null default '{}'::jsonb,
  add column if not exists vitals jsonb not null default '{}'::jsonb,
  add column if not exists emg jsonb not null default '[]'::jsonb,
  add column if not exists eeg jsonb not null default '{}'::jsonb,
  add column if not exists gsr jsonb not null default '{}'::jsonb,
  add column if not exists wearable_data jsonb not null default '{}'::jsonb,
  add column if not exists device_used text,
  add column if not exists notes text;

-- neurocognitive (legacy instances may miss comparison_group / custom fields)
alter table if exists neurocognitive
  add column if not exists platform text,
  add column if not exists test_date date,
  add column if not exists comparison_group text,
  add column if not exists context text,
  add column if not exists senaptec_scores jsonb not null default '{}'::jsonb,
  add column if not exists custom_metrics jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists raw_report_notes text;

-- intervention programs (older DBs may not have milestones)
alter table if exists intervention_programs
  add column if not exists milestones jsonb not null default '[]'::jsonb;

-- consent forms (older DBs may miss guardian/contact and signature fields)
alter table if exists consent_forms
  add column if not exists guardian_name text,
  add column if not exists guardian_relationship text,
  add column if not exists guardian_email text,
  add column if not exists guardian_phone text,
  add column if not exists form_data jsonb not null default '{}'::jsonb,
  add column if not exists digital_signature text,
  add column if not exists signed_timestamp timestamptz,
  add column if not exists signature_ip inet,
  add column if not exists updated_at timestamptz not null default now();

-- ---------- Athletes portal activation ----------
alter table if exists athletes
  add column if not exists is_portal_activated boolean not null default false,
  add column if not exists portal_activated_at timestamptz,
  add column if not exists portal_activation_email_sent_at timestamptz,
  add column if not exists portal_user_id uuid references auth.users(id) on delete set null,
  add column if not exists portal_last_login_at timestamptz;

create unique index if not exists idx_athletes_portal_user_id on athletes(portal_user_id) where portal_user_id is not null;
create index if not exists idx_athletes_portal_activation on athletes(practitioner_id, is_portal_activated);

-- ---------- Global role map ----------
create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('practitioner', 'athlete', 'admin')),
  created_at timestamptz not null default now()
);

insert into user_roles(user_id, role)
select id, 'practitioner' from practitioners
on conflict (user_id) do nothing;

insert into user_roles(user_id, role)
select portal_user_id, 'athlete' from athletes where portal_user_id is not null
on conflict (user_id) do nothing;

-- ---------- Intervention programs, assignments, progress ----------
create table if not exists intervention_programs (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  title text not null,
  description text,
  duration_weeks integer,
  milestones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists athlete_interventions (
  id uuid primary key default gen_random_uuid(),
  intervention_program_id uuid not null references intervention_programs(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_date date,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'paused')),
  completion_percentage numeric(5,2) not null default 0 check (completion_percentage >= 0 and completion_percentage <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intervention_progress (
  id uuid primary key default gen_random_uuid(),
  athlete_intervention_id uuid not null references athlete_interventions(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  progress_note text,
  progress_percentage numeric(5,2) not null check (progress_percentage >= 0 and progress_percentage <= 100),
  status text not null check (status in ('in_progress', 'completed', 'blocked')),
  created_at timestamptz not null default now()
);

create index if not exists idx_intervention_programs_practitioner on intervention_programs(practitioner_id);
create index if not exists idx_athlete_interventions_athlete on athlete_interventions(athlete_id);
create index if not exists idx_athlete_interventions_practitioner on athlete_interventions(practitioner_id);
create index if not exists idx_intervention_progress_assignment on intervention_progress(athlete_intervention_id, created_at desc);

-- ---------- Real-time chat ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('practitioner', 'athlete', 'admin')),
  receiver_id uuid not null references auth.users(id) on delete cascade,
  receiver_role text not null check (receiver_role in ('practitioner', 'athlete', 'admin')),
  body text not null check (char_length(trim(body)) > 0),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Production compatibility:
-- Some live environments already have an older messages schema using:
--   conversation_id + content
-- This migration normalizes that shape without dropping data.
alter table if exists messages
  add column if not exists conversation_key text,
  add column if not exists receiver_id uuid references auth.users(id) on delete cascade,
  add column if not exists receiver_role text,
  add column if not exists body text,
  add column if not exists read_at timestamptz;

do $$
begin
  -- Backfill body from legacy content column (if present)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'content'
  ) then
    execute $sql$
      update messages
         set body = coalesce(body, content)
       where body is null
         and content is not null
    $sql$;
  end if;

  -- Backfill conversation_key from conversation_id + participants where possible
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'conversation_id'
  ) then
    execute $sql$
      update messages m
         set conversation_key =
               case
                 when a.portal_user_id is not null then
                   least(
                     'practitioner:' || c.practitioner_id::text,
                     'athlete:' || a.portal_user_id::text
                   )
                   || '|'
                   || greatest(
                     'practitioner:' || c.practitioner_id::text,
                     'athlete:' || a.portal_user_id::text
                   )
                 else m.conversation_id::text
               end
        from conversations c
        left join athletes a on a.id = c.athlete_id
       where m.conversation_id = c.id
         and (m.conversation_key is null or m.conversation_key = '')
    $sql$;

    -- Fallback: still populate with conversation_id text when participant join is unavailable.
    execute $sql$
      update messages
         set conversation_key = conversation_id::text
       where (conversation_key is null or conversation_key = '')
         and conversation_id is not null
    $sql$;

    -- Backfill receiver columns from legacy conversations linkage when missing.
    execute $sql$
      update messages m
         set receiver_id =
               case
                 when m.sender_role = 'practitioner' then a.portal_user_id
                 when m.sender_role = 'athlete' then c.practitioner_id
                 when m.sender_role = 'ai_bot' then a.portal_user_id
                 else m.receiver_id
               end,
             receiver_role =
               case
                 when m.sender_role = 'practitioner' then 'athlete'
                 when m.sender_role = 'athlete' then 'practitioner'
                 when m.sender_role = 'ai_bot' then 'athlete'
                 else m.receiver_role
               end
        from conversations c
        left join athletes a on a.id = c.athlete_id
       where m.conversation_id = c.id
         and (m.receiver_id is null or m.receiver_role is null)
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'conversation_key'
  ) then
    execute 'create index if not exists idx_messages_conversation on messages(conversation_key, created_at desc)';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'conversation_id'
  ) then
    execute 'create index if not exists idx_messages_conversation on messages(conversation_id, created_at desc)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'receiver_id'
  ) then
    execute 'create index if not exists idx_messages_receiver_unread on messages(receiver_id, is_read, created_at desc)';
  end if;
end $$;

-- ---------- Injury psychology reflection logs ----------
create table if not exists injury_psychology_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  injury_record_id uuid references injury_records(id) on delete set null,
  mood_score integer check (mood_score between 1 and 10),
  stress_score integer check (stress_score between 1 and 10),
  confidence_score integer check (confidence_score between 1 and 10),
  pain_acceptance_score integer check (pain_acceptance_score between 1 and 10),
  reflection text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_injury_psychology_logs_athlete on injury_psychology_logs(athlete_id, created_at desc);

-- ---------- Daily logs + case formulations ----------
create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  practitioner_id uuid references practitioners(id) on delete set null,
  mood_score integer check (mood_score between 1 and 10),
  stress_score integer check (stress_score between 1 and 10),
  sleep_hours numeric(4,1),
  readiness_score integer check (readiness_score between 1 and 10),
  reflection text,
  created_at timestamptz not null default now()
);

create table if not exists case_formulations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  summary text,
  daily_log_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daily_logs_athlete_created on daily_logs(athlete_id, created_at desc);
create index if not exists idx_case_formulations_athlete on case_formulations(athlete_id, created_at desc);

-- ---------- Transaction bundle support ----------
create table if not exists assessment_bundles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  mental_health_assessment_id uuid references assessments(id) on delete set null,
  psychophysiology_id uuid references psychophysiology(id) on delete set null,
  neurocognitive_id uuid references neurocognitive(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_bundles_athlete on assessment_bundles(athlete_id, created_at desc);

-- ---------- Consent signature fields ----------
alter table if exists consent_forms
  add column if not exists digital_signature text,
  add column if not exists signed_timestamp timestamptz,
  add column if not exists signature_ip inet,
  add column if not exists updated_at timestamptz not null default now();

-- ---------- Updated-at trigger ----------
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_intervention_programs_updated_at on intervention_programs;
create trigger trg_intervention_programs_updated_at
before update on intervention_programs
for each row execute function update_updated_at();

drop trigger if exists trg_athlete_interventions_updated_at on athlete_interventions;
create trigger trg_athlete_interventions_updated_at
before update on athlete_interventions
for each row execute function update_updated_at();

drop trigger if exists trg_injury_psychology_logs_updated_at on injury_psychology_logs;
create trigger trg_injury_psychology_logs_updated_at
before update on injury_psychology_logs
for each row execute function update_updated_at();

drop trigger if exists trg_case_formulations_updated_at on case_formulations;
create trigger trg_case_formulations_updated_at
before update on case_formulations
for each row execute function update_updated_at();

drop trigger if exists trg_consent_forms_updated_at on consent_forms;
create trigger trg_consent_forms_updated_at
before update on consent_forms
for each row execute function update_updated_at();

-- ---------- Daily summary helper ----------
create or replace function get_daily_log_summary(p_athlete_id uuid)
returns jsonb
language sql
stable
as $$
with logs as (
  select *
  from daily_logs
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

-- ---------- RLS ----------
alter table user_roles enable row level security;
alter table intervention_programs enable row level security;
alter table athlete_interventions enable row level security;
alter table intervention_progress enable row level security;
alter table messages enable row level security;
alter table injury_psychology_logs enable row level security;
alter table daily_logs enable row level security;
alter table case_formulations enable row level security;
alter table assessment_bundles enable row level security;

-- user_roles (admins can read all; users can read own)
drop policy if exists user_roles_self_select on user_roles;
create policy user_roles_self_select
on user_roles
for select
using (auth.uid() = user_id);

-- intervention programs
 drop policy if exists intervention_programs_practitioner_all on intervention_programs;
create policy intervention_programs_practitioner_all
on intervention_programs
for all
using (auth.uid() = practitioner_id)
with check (auth.uid() = practitioner_id);

-- athlete interventions
 drop policy if exists athlete_interventions_owner_access on athlete_interventions;
create policy athlete_interventions_owner_access
on athlete_interventions
for select
using (
  auth.uid() = practitioner_id
  or exists (
    select 1 from athletes a where a.id = athlete_id and a.portal_user_id = auth.uid()
  )
);

 drop policy if exists athlete_interventions_practitioner_write on athlete_interventions;
create policy athlete_interventions_practitioner_write
on athlete_interventions
for insert
with check (auth.uid() = practitioner_id);

 drop policy if exists athlete_interventions_practitioner_update on athlete_interventions;
create policy athlete_interventions_practitioner_update
on athlete_interventions
for update
using (auth.uid() = practitioner_id)
with check (auth.uid() = practitioner_id);

-- intervention progress
 drop policy if exists intervention_progress_owner_access on intervention_progress;
create policy intervention_progress_owner_access
on intervention_progress
for select
using (
  auth.uid() = practitioner_id
  or exists (
    select 1 from athletes a where a.id = athlete_id and a.portal_user_id = auth.uid()
  )
);

 drop policy if exists intervention_progress_insert_access on intervention_progress;
create policy intervention_progress_insert_access
on intervention_progress
for insert
with check (
  auth.uid() = practitioner_id
  or exists (
    select 1 from athletes a where a.id = athlete_id and a.portal_user_id = auth.uid()
  )
);

-- messages
 drop policy if exists messages_participant_select on messages;
create policy messages_participant_select
on messages
for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

 drop policy if exists messages_sender_insert on messages;
create policy messages_sender_insert
on messages
for insert
with check (auth.uid() = sender_id);

 drop policy if exists messages_receiver_update on messages;
create policy messages_receiver_update
on messages
for update
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

-- injury psychology logs
 drop policy if exists injury_psychology_logs_owner_all on injury_psychology_logs;
create policy injury_psychology_logs_owner_all
on injury_psychology_logs
for all
using (auth.uid() = practitioner_id)
with check (auth.uid() = practitioner_id);

-- daily logs
 drop policy if exists daily_logs_select_access on daily_logs;
create policy daily_logs_select_access
on daily_logs
for select
using (
  auth.uid() = practitioner_id
  or exists (select 1 from athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
);

 drop policy if exists daily_logs_insert_access on daily_logs;
create policy daily_logs_insert_access
on daily_logs
for insert
with check (
  auth.uid() = practitioner_id
  or exists (select 1 from athletes a where a.id = athlete_id and a.portal_user_id = auth.uid())
);

-- case formulations
 drop policy if exists case_formulations_owner_all on case_formulations;
create policy case_formulations_owner_all
on case_formulations
for all
using (auth.uid() = practitioner_id)
with check (auth.uid() = practitioner_id);

-- assessment bundles
 drop policy if exists assessment_bundles_owner_all on assessment_bundles;
create policy assessment_bundles_owner_all
on assessment_bundles
for all
using (auth.uid() = practitioner_id)
with check (auth.uid() = practitioner_id);

-- Ask PostgREST to refresh its schema cache so new columns are visible immediately.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;

commit;
