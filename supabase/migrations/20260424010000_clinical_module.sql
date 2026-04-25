create extension if not exists pgcrypto;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
as $$
declare
  resolved_role text;
begin
  select role into resolved_role
  from public.user_roles
  where user_id = auth.uid()
  limit 1;

  if resolved_role is not null then
    return resolved_role;
  end if;

  if exists (select 1 from public.practitioners where id = auth.uid()) then
    return 'practitioner';
  end if;

  if exists (
    select 1
    from public.athletes
    where id = auth.uid() or portal_user_id = auth.uid()
  ) then
    return 'athlete';
  end if;

  return 'unknown';
end;
$$;

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  diagnosis_label text not null,
  dsm_reference text,
  icd_code text not null,
  notes text not null default '',
  severity_level text not null default 'moderate'
    check (severity_level in ('mild', 'moderate', 'severe', 'critical')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_records_practitioner_athlete_idx
  on public.clinical_records (practitioner_id, athlete_id, status, created_at desc);

create index if not exists clinical_records_icd_idx
  on public.clinical_records (icd_code);

create table if not exists public.clinical_access_logs (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  action text not null,
  timestamp timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists clinical_access_logs_practitioner_idx
  on public.clinical_access_logs (practitioner_id, timestamp desc);

create table if not exists public.clinical_access_settings (
  practitioner_id uuid primary key references public.practitioners(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_access_settings_updated_idx
  on public.clinical_access_settings (updated_at desc);

create table if not exists public.clinical_audit_anonymous (
  id uuid primary key default gen_random_uuid(),
  hashed_practitioner_id text not null,
  action_type text not null,
  timestamp timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists clinical_audit_anonymous_action_idx
  on public.clinical_audit_anonymous (action_type, timestamp desc);

create table if not exists public.clinical_icd_reference (
  code text primary key,
  title text not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.clinical_icd_reference(code, title, category)
values
  ('6A70', 'Single episode depressive disorder', 'Mood disorders'),
  ('6A71', 'Recurrent depressive disorder', 'Mood disorders'),
  ('6A73', 'Bipolar type II disorder', 'Mood disorders'),
  ('6B00', 'Generalized anxiety disorder', 'Anxiety and fear-related disorders'),
  ('6B01', 'Panic disorder', 'Anxiety and fear-related disorders'),
  ('6B04', 'Social anxiety disorder', 'Anxiety and fear-related disorders'),
  ('6B40', 'Obsessive-compulsive disorder', 'Obsessive-compulsive and related disorders'),
  ('6B41', 'Body dysmorphic disorder', 'Obsessive-compulsive and related disorders'),
  ('6B60', 'Post traumatic stress disorder', 'Disorders specifically associated with stress'),
  ('6B81', 'Anorexia nervosa', 'Feeding and eating disorders'),
  ('6B82', 'Bulimia nervosa', 'Feeding and eating disorders'),
  ('6C40', 'Attention deficit hyperactivity disorder', 'Neurodevelopmental disorders'),
  ('6D10', 'Alcohol dependence', 'Disorders due to substance use'),
  ('6D11', 'Cannabis dependence', 'Disorders due to substance use'),
  ('QE84', 'Problems associated with bullying or victimization', 'Factors influencing health status'),
  ('QD85', 'Problems associated with social exclusion or rejection', 'Factors influencing health status'),
  ('QE21.0', 'Problems associated with participation in sport', 'Factors influencing health status')
on conflict (code) do nothing;

drop view if exists public.clinical_owner_usage_summary;

create view public.clinical_owner_usage_summary as
select
  date_trunc('day', timestamp)::date as usage_day,
  action_type,
  count(*) as action_count,
  count(distinct hashed_practitioner_id) as unique_practitioners
from public.clinical_audit_anonymous
group by 1, 2;

drop view if exists public.clinical_owner_diagnosis_trends;

create view public.clinical_owner_diagnosis_trends as
select
  icd_code,
  severity_level,
  status,
  count(*) as record_count
from public.clinical_records
group by icd_code, severity_level, status;

alter table public.clinical_records enable row level security;
alter table public.clinical_access_logs enable row level security;
alter table public.clinical_access_settings enable row level security;
alter table public.clinical_audit_anonymous enable row level security;
alter table public.clinical_icd_reference enable row level security;

drop policy if exists clinical_records_practitioner_select on public.clinical_records;
create policy clinical_records_practitioner_select
  on public.clinical_records
  for select
  using (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_records_practitioner_insert on public.clinical_records;
create policy clinical_records_practitioner_insert
  on public.clinical_records
  for insert
  with check (
    auth.uid() = practitioner_id
    and public.current_app_role() = 'practitioner'
  );

drop policy if exists clinical_records_practitioner_update on public.clinical_records;
create policy clinical_records_practitioner_update
  on public.clinical_records
  for update
  using (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner')
  with check (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_access_logs_practitioner_select on public.clinical_access_logs;
create policy clinical_access_logs_practitioner_select
  on public.clinical_access_logs
  for select
  using (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_access_logs_practitioner_insert on public.clinical_access_logs;
create policy clinical_access_logs_practitioner_insert
  on public.clinical_access_logs
  for insert
  with check (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_access_settings_practitioner_select on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_select
  on public.clinical_access_settings
  for select
  using (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_access_settings_practitioner_insert on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_insert
  on public.clinical_access_settings
  for insert
  with check (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_access_settings_practitioner_update on public.clinical_access_settings;
create policy clinical_access_settings_practitioner_update
  on public.clinical_access_settings
  for update
  using (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner')
  with check (auth.uid() = practitioner_id and public.current_app_role() = 'practitioner');

drop policy if exists clinical_icd_reference_practitioner_select on public.clinical_icd_reference;
create policy clinical_icd_reference_practitioner_select
  on public.clinical_icd_reference
  for select
  using (public.current_app_role() = 'practitioner');
