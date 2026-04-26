-- Creates the auth.users trigger that provisions practitioner / athlete
-- profiles in the legacy public tables used throughout the current SPPS app.
-- Safe to re-run.

begin;

create extension if not exists pgcrypto;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       text;
  v_first_name text;
  v_last_name  text;
  v_sport      text;
begin
  v_role       := coalesce(new.raw_user_meta_data->>'role', 'athlete');
  v_first_name := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 'Athlete');
  v_last_name  := coalesce(trim(new.raw_user_meta_data->>'last_name'), '');
  v_sport      := nullif(trim(coalesce(new.raw_user_meta_data->>'sport', '')), '');

  if v_role = 'athlete' then
    insert into public.athletes (
      id,
      email,
      first_name,
      last_name,
      sport,
      uid_code,
      status,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.email,
      v_first_name,
      v_last_name,
      v_sport,
      'ATH-' || upper(substring(gen_random_uuid()::text, 1, 8)),
      'unverified',
      now(),
      now()
    )
    on conflict (id) do nothing;

  elsif v_role in ('practitioner', 'sport_psychologist') then
    insert into public.practitioners (
      id,
      email,
      first_name,
      last_name,
      role,
      hipaa_acknowledged,
      compliance_completed,
      profile_completed,
      notification_email,
      notification_sms,
      created_at
    )
    values (
      new.id,
      new.email,
      coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 'Practitioner'),
      coalesce(trim(new.raw_user_meta_data->>'last_name'), ''),
      'sport_psychologist',
      false,
      false,
      false,
      true,
      false,
      now()
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

update public.athletes
set uid_code = 'ATH-' || upper(substring(gen_random_uuid()::text, 1, 8))
where uid_code is null or trim(uid_code) = '';

commit;
