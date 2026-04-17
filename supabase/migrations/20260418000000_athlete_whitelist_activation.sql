-- ═══════════════════════════════════════════════════════════════════════════
-- SPPS — Athlete Portal: Email Whitelist Activation (no email sending)
-- Migration: 20260418000000_athlete_whitelist_activation
--
-- Practitioner authorizes the athlete's email in-app. The athlete then visits
-- the athlete sign-in page, clicks "Sign up", enters the whitelisted email,
-- sets their own password, and is routed to the dashboard.
--
-- Security model:
--   1. An email is added to `athlete_authorized_emails` only by the practitioner
--      who owns the athlete record.
--   2. Athlete signup is only accepted if the email is in that table.
--   3. On signup, a trigger (handle_new_athlete) creates the athlete_profiles
--      row and binds it to the correct athletes row via the whitelist entry.
--   4. If the whitelist doesn't contain the email, the trigger blocks the
--      signup (RAISES). No orphan auth users possible.
--
-- SAFE TO RE-RUN (all operations use IF NOT EXISTS / OR REPLACE / ON CONFLICT)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Authorized-emails table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_authorized_emails (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id  uuid NOT NULL REFERENCES public.practitioners(id) ON DELETE CASCADE,
  athlete_id       uuid NOT NULL REFERENCES public.athletes(id)      ON DELETE CASCADE,
  email            text NOT NULL,
  claimed_at       timestamptz,  -- set when the athlete actually signs up
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id),
  UNIQUE(lower(email))
);

-- Case-insensitive email match indexes
CREATE INDEX IF NOT EXISTS idx_authorized_emails_email_lower
  ON public.athlete_authorized_emails(lower(email));
CREATE INDEX IF NOT EXISTS idx_authorized_emails_practitioner
  ON public.athlete_authorized_emails(practitioner_id);

-- ── 2. RLS on athlete_authorized_emails ─────────────────────────────────────
ALTER TABLE public.athlete_authorized_emails ENABLE ROW LEVEL SECURITY;

-- Practitioner: full access to their own rows
DROP POLICY IF EXISTS "authorized_emails_practitioner_all" ON public.athlete_authorized_emails;
CREATE POLICY "authorized_emails_practitioner_all"
  ON public.athlete_authorized_emails
  FOR ALL
  USING (practitioner_id = auth.uid())
  WITH CHECK (practitioner_id = auth.uid());

-- Public (anon) read of a single row by email — used by the athlete
-- sign-up page to tell them whether their email is authorized, BEFORE
-- they type a password. Only safe fields are returned (see view below).
--
-- We expose the "whitelist check" through a SECURITY DEFINER RPC so that
-- the anon user cannot read any PII (practitioner_id, athlete_id); they
-- only learn a boolean "authorized / not authorized" for a given email.

-- ── 3. RPC: is_email_authorized (public, used by signup page) ───────────────
CREATE OR REPLACE FUNCTION public.is_athlete_email_authorized(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.athlete_authorized_emails
    WHERE lower(email) = lower(p_email)
      AND claimed_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_athlete_email_authorized(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_athlete_email_authorized(text)
  TO anon, authenticated, service_role;

-- ── 4. handle_new_athlete trigger (runs AFTER auth.users INSERT) ────────────
-- This is the heart of the flow. It:
--   a) Only fires for signups with role='athlete' in user_metadata
--   b) Looks up the whitelist entry by lowercased email
--   c) Fails loudly if no whitelist entry (blocks orphan signups)
--   d) Creates athlete_profiles row bound to the correct athletes.id
--   e) Marks the whitelist entry as claimed
--   f) Backfills athlete_auth_id on child tables for RLS
CREATE OR REPLACE FUNCTION public.handle_new_athlete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_whitelist RECORD;
  v_first_name text;
  v_last_name  text;
BEGIN
  -- Only process athlete signups
  IF NEW.raw_user_meta_data->>'role' IS DISTINCT FROM 'athlete' THEN
    RETURN NEW;
  END IF;

  -- Look up the whitelist entry by email (case-insensitive)
  SELECT ae.*, a.first_name, a.last_name
  INTO v_whitelist
  FROM public.athlete_authorized_emails ae
  JOIN public.athletes a ON a.id = ae.athlete_id
  WHERE lower(ae.email) = lower(NEW.email)
    AND ae.claimed_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    -- No whitelist entry → block signup with a clear error
    RAISE EXCEPTION 'EMAIL_NOT_AUTHORIZED: %', NEW.email
      USING HINT = 'Ask your practitioner to authorize your email before signing up.';
  END IF;

  v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', v_whitelist.first_name, '');
  v_last_name  := COALESCE(NEW.raw_user_meta_data->>'last_name',  v_whitelist.last_name,  '');

  -- Create athlete_profiles row (auth bridge)
  INSERT INTO public.athlete_profiles (
    id,
    practitioner_id,
    athlete_id,
    email,
    display_name,
    portal_enabled,
    portal_enabled_at,
    notification_email,
    notification_push,
    timezone,
    language
  ) VALUES (
    NEW.id,
    v_whitelist.practitioner_id,
    v_whitelist.athlete_id,
    NEW.email,
    TRIM(v_first_name || ' ' || v_last_name),
    true,
    now(),
    true,
    true,
    'Asia/Kolkata',
    'en'
  )
  ON CONFLICT (athlete_id) DO UPDATE
    SET id                = EXCLUDED.id,
        email             = EXCLUDED.email,
        portal_enabled    = true,
        portal_enabled_at = COALESCE(public.athlete_profiles.portal_enabled_at, now());

  -- Mark the whitelist entry as claimed so it can't be reused
  UPDATE public.athlete_authorized_emails
  SET claimed_at = now()
  WHERE id = v_whitelist.id;

  -- Backfill athlete_auth_id on child tables so RLS picks it up immediately
  UPDATE public.task_completions
    SET athlete_auth_id = NEW.id
    WHERE athlete_id = v_whitelist.athlete_id AND athlete_auth_id IS NULL;
  UPDATE public.athlete_daily_logs
    SET athlete_auth_id = NEW.id
    WHERE athlete_id = v_whitelist.athlete_id AND athlete_auth_id IS NULL;
  UPDATE public.athlete_requests
    SET athlete_auth_id = NEW.id
    WHERE athlete_id = v_whitelist.athlete_id AND athlete_auth_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_athlete_created ON auth.users;
CREATE TRIGGER on_auth_athlete_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_athlete();

-- ── 5. Clean up legacy invite-email columns (if the earlier migration ran) ──
-- These are now unused. We keep the athlete_invites table itself because it
-- may hold historical data; we just drop the email-tracking columns.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'athlete_invites' AND column_name = 'email_sent_at') THEN
    ALTER TABLE public.athlete_invites
      DROP COLUMN IF EXISTS email_sent_at,
      DROP COLUMN IF EXISTS email_send_attempts,
      DROP COLUMN IF EXISTS email_last_error,
      DROP COLUMN IF EXISTS email_provider;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT trigger_name FROM information_schema.triggers
-- WHERE trigger_name = 'on_auth_athlete_created';
--
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename = 'athlete_authorized_emails';
--
-- SELECT public.is_athlete_email_authorized('not@authorized.com');  -- should be false
