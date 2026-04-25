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

create index if not exists athlete_intake_submissions_athlete_idx
  on public.athlete_intake_submissions (athlete_id, practitioner_id);

alter table public.athlete_intake_submissions enable row level security;

drop policy if exists athlete_intake_submissions_practitioner_select on public.athlete_intake_submissions;
create policy athlete_intake_submissions_practitioner_select
  on public.athlete_intake_submissions
  for select
  using (auth.uid() = practitioner_id);

drop policy if exists athlete_intake_submissions_athlete_select on public.athlete_intake_submissions;
create policy athlete_intake_submissions_athlete_select
  on public.athlete_intake_submissions
  for select
  using (
    auth.uid() = submitted_by
    or exists (
      select 1
      from public.athletes a
      where a.id = athlete_intake_submissions.athlete_id
        and (a.id = auth.uid() or a.portal_user_id = auth.uid())
    )
  );

drop policy if exists athlete_intake_submissions_athlete_insert on public.athlete_intake_submissions;
create policy athlete_intake_submissions_athlete_insert
  on public.athlete_intake_submissions
  for insert
  with check (
    auth.uid() = submitted_by
    or auth.uid() = practitioner_id
    or exists (
      select 1
      from public.athletes a
      where a.id = athlete_intake_submissions.athlete_id
        and (a.id = auth.uid() or a.portal_user_id = auth.uid())
    )
  );

drop policy if exists athlete_intake_submissions_owner_update on public.athlete_intake_submissions;
create policy athlete_intake_submissions_owner_update
  on public.athlete_intake_submissions
  for update
  using (
    auth.uid() = practitioner_id
    or auth.uid() = submitted_by
  )
  with check (
    auth.uid() = practitioner_id
    or auth.uid() = submitted_by
  );
