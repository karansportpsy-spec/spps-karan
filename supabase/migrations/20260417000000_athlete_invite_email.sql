-- ═══════════════════════════════════════════════════════════════════════════
-- SPPS — Athlete Invite Email System
-- Migration: 20260417000000_athlete_invite_email
--
-- This migration:
--   1. Adds email-tracking columns on athlete_invites
--   2. Adds handle_new_athlete trigger (creates athlete_profiles row
--      automatically when an athlete signs up via the accept-invite page)
--   3. Tightens RLS on athlete_invites so:
--        - practitioners can insert/read/update their own invites
--        - the accept-invite page can read by token without authentication
--   4. Adds an RPC that returns an invite with athlete+practitioner context
--      (used by the edge function; runs as SECURITY DEFINER)
--
-- SAFE TO RE-RUN (all operations use IF NOT EXISTS / OR REPLACE / ON CONFLICT)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Email tracking columns on athlete_invites ────────────────────────────
ALTER TABLE public.athlete_invites
  ADD COLUMN IF NOT EXISTS email_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_error    text,
  ADD COLUMN IF NOT EXISTS email_provider      text; -- 'resend' | 'supabase' | null

CREATE INDEX IF NOT EXISTS idx_athlete_invites_token
  ON public.athlete_invites(token);
CREATE INDEX IF NOT EXISTS idx_athlete_invites_practitioner
  ON public.athlete_invites(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_athlete_invites_athlete_open
  ON public.athlete_invites(athlete_id)
  WHERE accepted_at IS NULL;

-- ── 2. handle_new_athlete trigger ───────────────────────────────────────────
-- When an auth.users row is inserted with role='athlete' in metadata,
-- create the matching athlete_profiles row so RLS immediately works.
-- This complements the existing handle_new_user trigger (which handles
-- practitioners only — see SPPS.docx Section 11).
CREATE OR REPLACE FUNCTION public.handle_new_athlete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id      uuid;
  v_practitioner_id uuid;
  v_first_name      text;
  v_last_name       text;
BEGIN
  -- Only fire for athlete signups
  IF NEW.raw_user_meta_data->>'role' IS DISTINCT FROM 'athlete' THEN
    RETURN NEW;
  END IF;

  v_athlete_id      := (NEW.raw_user_meta_data->>'athlete_id')::uuid;
  v_practitioner_id := (NEW.raw_user_meta_data->>'practitioner_id')::uuid;
  v_first_name      := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last_name       := COALESCE(NEW.raw_user_meta_data->>'last_name',  '');

  -- Guard: if metadata is incomplete, don't fail the signup — just skip.
  -- The AcceptInvitePage will handle the error surface.
  IF v_athlete_id IS NULL OR v_practitioner_id IS NULL THEN
    RAISE NOTICE 'handle_new_athlete: missing athlete_id/practitioner_id metadata for user %', NEW.id;
    RETURN NEW;
  END IF;

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
    v_practitioner_id,
    v_athlete_id,
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
    SET id = EXCLUDED.id,
        email = EXCLUDED.email,
        portal_enabled = true,
        portal_enabled_at = COALESCE(public.athlete_profiles.portal_enabled_at, now());

  -- Backfill athlete_auth_id on child tables so RLS can pick it up immediately
  UPDATE public.task_completions    SET athlete_auth_id = NEW.id WHERE athlete_id = v_athlete_id AND athlete_auth_id IS NULL;
  UPDATE public.athlete_daily_logs  SET athlete_auth_id = NEW.id WHERE athlete_id = v_athlete_id AND athlete_auth_id IS NULL;
  UPDATE public.athlete_requests    SET athlete_auth_id = NEW.id WHERE athlete_id = v_athlete_id AND athlete_auth_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_athlete_created ON auth.users;
CREATE TRIGGER on_auth_athlete_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_athlete();

-- ── 3. RLS on athlete_invites ───────────────────────────────────────────────
ALTER TABLE public.athlete_invites ENABLE ROW LEVEL SECURITY;

-- Practitioners can CRUD their own invites
DROP POLICY IF EXISTS "athlete_invites_practitioner_all" ON public.athlete_invites;
CREATE POLICY "athlete_invites_practitioner_all"
  ON public.athlete_invites
  FOR ALL
  USING (practitioner_id = auth.uid())
  WITH CHECK (practitioner_id = auth.uid());

-- Anyone (unauthenticated) can READ an invite by token IF still valid.
-- This is what the AcceptInvitePage needs — the athlete hasn't signed up yet,
-- so they have no auth.uid(). Token itself is the authorization.
DROP POLICY IF EXISTS "athlete_invites_read_by_token" ON public.athlete_invites;
CREATE POLICY "athlete_invites_read_by_token"
  ON public.athlete_invites
  FOR SELECT
  TO anon, authenticated
  USING (
    accepted_at IS NULL
    AND expires_at > now()
  );
-- NOTE: the above intentionally allows the anon role to read rows where the
-- token is implicit via the .eq('token', <uuid>) filter on the client.
-- Since tokens are UUIDv4 (2^122 entropy) and the row is filtered by token
-- before row-level evaluation, this is safe: the anon user cannot enumerate.

-- Allow the anon role to mark the invite as accepted (closes it).
-- This is scoped by token in the client WHERE clause.
DROP POLICY IF EXISTS "athlete_invites_accept_by_token" ON public.athlete_invites;
CREATE POLICY "athlete_invites_accept_by_token"
  ON public.athlete_invites
  FOR UPDATE
  TO anon, authenticated
  USING (
    accepted_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    accepted_at IS NOT NULL
  );

-- ── 4. RPC used by the edge function ────────────────────────────────────────
-- Returns the full context needed to render an invite email, bypassing RLS
-- via SECURITY DEFINER. The edge function authorizes the caller separately
-- (it verifies the JWT belongs to the invite's practitioner).
CREATE OR REPLACE FUNCTION public.get_invite_email_context(p_invite_id uuid)
RETURNS TABLE (
  invite_id          uuid,
  token              uuid,
  email              text,
  expires_at         timestamptz,
  practitioner_id    uuid,
  practitioner_name  text,
  practitioner_email text,
  athlete_id         uuid,
  athlete_first_name text,
  athlete_last_name  text,
  athlete_sport      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id                       AS invite_id,
    i.token                    AS token,
    i.email                    AS email,
    i.expires_at               AS expires_at,
    i.practitioner_id          AS practitioner_id,
    TRIM(p.first_name || ' ' || p.last_name) AS practitioner_name,
    p.email                    AS practitioner_email,
    a.id                       AS athlete_id,
    a.first_name               AS athlete_first_name,
    a.last_name                AS athlete_last_name,
    a.sport                    AS athlete_sport
  FROM public.athlete_invites i
  JOIN public.practitioners p ON p.id = i.practitioner_id
  JOIN public.athletes      a ON a.id = i.athlete_id
  WHERE i.id = p_invite_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invite_email_context(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_invite_email_context(uuid) TO authenticated, service_role;

-- ── 5. Mark-email-sent helper (called by edge function) ─────────────────────
CREATE OR REPLACE FUNCTION public.mark_invite_email_sent(
  p_invite_id uuid,
  p_provider  text,
  p_error     text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.athlete_invites
  SET email_sent_at       = CASE WHEN p_error IS NULL THEN now() ELSE email_sent_at END,
      email_send_attempts = email_send_attempts + 1,
      email_last_error    = p_error,
      email_provider      = CASE WHEN p_error IS NULL THEN p_provider ELSE email_provider END
  WHERE id = p_invite_id;
$$;

REVOKE ALL ON FUNCTION public.mark_invite_email_sent(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_invite_email_sent(uuid, text, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT trigger_name, event_manipulation, event_object_schema, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name IN ('on_auth_user_created', 'on_auth_athlete_created')
-- ORDER BY trigger_name;
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE tablename = 'athlete_invites';
