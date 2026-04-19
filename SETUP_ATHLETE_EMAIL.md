# SPPS — Athlete Portal Email Activation: Setup Guide

This update makes "Enable Athlete Portal" actually send a branded email to the
athlete with a link to set their password and log in. It also fixes three
bugs that were blocking the flow end-to-end.

---

## 1. What this bundle contains

```
supabase/
  migrations/
    20260417000000_athlete_invite_email.sql   ← DB trigger + RLS + RPCs
  functions/
    send-athlete-invite/
      index.ts                                ← Edge function (Resend)
src/
  components/
    EnableAthletePortal.tsx                   ← Practitioner UI (emails athlete)
  pages/
    athlete/
      AthleteLoginPage.tsx                    ← Unified Supabase-based login
    athletes/
      AcceptInvitePage.tsx                    ← Hardened accept flow
  router.tsx                                  ← Collapsed dual-auth paths
```

File layout mirrors your repo. Drop each file into the same relative path.

---

## 2. What was broken (root causes)

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | **"Enable Portal" never sent email** | No email provider was wired in — the old component only created an `athlete_invites` row and showed a copy-paste link | Edge function `send-athlete-invite` calls Resend with a branded HTML template |
| 2 | Athletes saw "Invite Invalid or Expired" from the pending-invite copy link | Pending-invite branch of `EnableAthletePortal` built `/athletes/accept-invite` (plural), router registered `/athlete/accept-invite` (singular) | Use singular path everywhere |
| 3 | Athletes got stuck after signup — all athlete-portal queries returned empty | No `handle_new_athlete` trigger; `handle_new_user` explicitly skips athletes, so `athlete_profiles` row never existed → RLS blocked everything | New trigger creates `athlete_profiles` + backfills `athlete_auth_id` |
| 4 | Athlete login page posted to broken Node backend (`portal_user_id`, `is_portal_activated` columns don't exist in current schema) | Two auth systems layered on top of each other | Unified on Supabase Auth; `/athlete/portal` now redirects to `/athlete/dashboard` |

---

## 3. Setup steps (do these in order)

### 3.1 Get a Resend API key

1. Sign up at <https://resend.com> (free tier: 3,000 emails/month, 100/day)
2. **For testing quickly:** skip domain verification and send from `onboarding@resend.dev` (works only to the email you signed up with, but that's fine for a dev sanity check)
3. **For production:** verify your domain
   - Resend Dashboard → Domains → Add Domain (e.g. `winmindperform.com`)
   - Add the DNS records they show (SPF, DKIM, DMARC) at your domain registrar
   - Wait for all records to go green (~15 min to a few hours)
   - Create a sending address like `invites@winmindperform.com`
4. Go to **API Keys** → Create API Key with **Sending access** scope → copy the `re_...` value

### 3.2 Run the migration

Open the Supabase Dashboard → **SQL Editor** → New query → paste the contents of `supabase/migrations/20260417000000_athlete_invite_email.sql` → **Run**.

Verify by running:

```sql
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name IN ('on_auth_user_created', 'on_auth_athlete_created');
```

You should see both rows.

### 3.3 Deploy the edge function

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).

```bash
# From the project root (where supabase/ sits)
supabase login                      # one-time
supabase link --project-ref <your-project-ref>

# Deploy. We disable automatic JWT verification because the function
# validates the JWT itself (to give clearer error messages).
supabase functions deploy send-athlete-invite --no-verify-jwt
```

### 3.4 Set the edge function secrets

```bash
supabase secrets set \
  RESEND_API_KEY="re_your_key_here" \
  FROM_EMAIL="WinMindPerform <invites@winmindperform.com>" \
  CLIENT_ORIGIN="https://spps-karan.vercel.app"
```

**For dev/test (no custom domain yet):**
```bash
supabase secrets set \
  RESEND_API_KEY="re_your_key_here" \
  FROM_EMAIL="WinMindPerform <onboarding@resend.dev>" \
  CLIENT_ORIGIN="https://spps-karan.vercel.app"
```

Verify:
```bash
supabase secrets list
```

You should see `RESEND_API_KEY`, `FROM_EMAIL`, `CLIENT_ORIGIN`. (The three `SUPABASE_*` secrets are injected automatically.)

### 3.5 Configure Supabase Auth

In the Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://spps-karan.vercel.app`
- **Redirect URLs** (add both):
  - `https://spps-karan.vercel.app/athlete/login`
  - `https://spps-karan.vercel.app/athlete/accept-invite`
  - (keep any existing practitioner redirect URLs)

Then **Authentication** → **Providers** → **Email**:

- **"Confirm email"** — if this is ON, the athlete will receive a confirmation email from Supabase *in addition* to the invite email from Resend. For a smoother UX, **turn this OFF** during invite acceptance (the invite token itself proves email ownership). Or leave it ON and the `AcceptInvitePage` will show the "check your email to confirm" screen.

### 3.6 Copy the frontend files into your repo

Drop these files in place (overwriting existing):

```
src/components/EnableAthletePortal.tsx
src/pages/athlete/AthleteLoginPage.tsx
src/pages/athletes/AcceptInvitePage.tsx
src/router.tsx
```

Then rebuild locally to sanity-check TypeScript:

```powershell
npm run type-check
npm run build
```

### 3.7 Deploy to Vercel

Commit and push — Vercel will auto-deploy. No new frontend env vars are required (the edge function URL is derived from `VITE_SUPABASE_URL` automatically by `supabase-js`).

---

## 4. How to test end-to-end

1. Sign in as a practitioner on your deployed site
2. Open an athlete case formulation → scroll to the "Enable Athlete Portal" panel
3. Enter a real email address you can read (your own is fine)
4. Click **"Send invitation to [FirstName]"**
5. Within a few seconds you should see **"Invite email sent"** with the athlete's email
6. Check the inbox — the branded WinMindPerform email should arrive from your `FROM_EMAIL` address
7. Click "Activate my portal →" in the email
8. Set a password → you should land on `/athlete/dashboard`
9. Sign out → go to `/athlete/login` → sign in with the same password → should return to dashboard

---

## 5. Debugging

**"Email provider not configured"** — `RESEND_API_KEY` secret is missing. Run `supabase secrets list`.

**"Email provider rejected the message"** — Resend rejected. Check the error detail in the UI — most common causes:
- `FROM_EMAIL` domain isn't verified in Resend (use `onboarding@resend.dev` to test)
- Free tier: sending to any email other than the account owner's while unverified

**"Forbidden — invite belongs to another practitioner"** — the authenticated practitioner ID doesn't match the invite. Shouldn't happen in normal use.

**Athlete signs up but sees empty dashboard** — `handle_new_athlete` trigger didn't fire. Verify in SQL Editor:
```sql
SELECT * FROM public.athlete_profiles WHERE athlete_id = '<athlete uuid>';
```
If empty, re-run the migration and look at `RAISE NOTICE` output.

**Check edge function logs:**
```bash
supabase functions logs send-athlete-invite --tail
```

---

## Next Steps & Improvements

### (1) Immediate actions to test
- Run migration SQL and confirm both `on_auth_*_created` triggers exist
- Deploy edge function and set all three secrets
- Send a live invite to your own email; confirm delivery, click-through, and dashboard landing
- From a second browser (or incognito), sign out the athlete, then sign back in via `/athlete/login`
- Re-open the practitioner view — the panel should now show "Athlete Portal Active" green state

### (2) Known gaps / bugs to fix next
- **Dead code cleanup**: `server/src/services.js`, `server/src/routes/authRoutes.js`, and `src/services/athletePortalApi.ts` reference `portal_user_id` / `is_portal_activated` columns that don't exist in your current schema. They're now unreachable from the new `AthleteLoginPage`, but still shipping in the bundle. Remove the legacy Node `auth/athlete/login` route and prune `athletePortalApi.ts` down to just `logoutAthletePortal` (wraps `supabase.auth.signOut()`).
- **Conversation upsert** in `EnableAthletePortal` uses a hacky `.then/.catch` pattern — refactor to a plain `try/catch` once you're confident it isn't masking a real error.
- **Resend domain** — you're currently using the defaults (or will be). Get `winmindperform.com` verified in Resend before production rollout; `onboarding@resend.dev` is sandbox-only.
- **`AthletePortalPage.tsx`** (the legacy `/athlete/portal` view) is still imported by the router but now unreachable. Remove the import + file when you clean up the legacy backend.

### (3) Future enhancements (priority ranked)
1. **Invite expiry reminder** — a cron (Supabase scheduled function) that re-sends the email 24h before expiry if unaccepted
2. **Practitioner audit log** — record every invite send / resend / acceptance in an `audit_events` table for DPDP compliance reporting
3. **Rate-limit resends** — currently unthrottled. Add a `NOT ( email_send_attempts >= 5 )` check in the RPC to prevent accidental spam
4. **Localised emails** — build a second template in Hindi/Odia; pick language off the athlete's `language` column in `athlete_profiles`
5. **SMS fallback** — add a `phone` channel via MSG91 or Twilio; your AIFF/SAI athletes are more reliable on WhatsApp/SMS than email
6. **Signed magic links** — replace the "set password" step with Supabase's passwordless OTP flow for athletes who don't want a password

### (4) Security / compliance considerations
- **DPDP Act 2023** — the email contains the athlete's first name and practitioner's name (both classified as personal data). Ensure your privacy policy discloses Resend as a subprocessor, and that Resend's data residency (US/EU) is acceptable under your DPIA. If it isn't, swap Resend for an Indian provider (Msg91, Postmark with EU region, or a self-hosted SMTP).
- **Token entropy** — 122-bit UUIDv4 tokens are adequate, but since RLS now allows `anon` role to read unaccepted invites, an attacker who obtained a token leak (e.g. from email forwarding logs) could accept the invite. Consider shortening `expires_at` from 48h to 6h for high-risk athletes.
- **RLS on `athlete_invites`** — the new `anon` read policy is scoped to `accepted_at IS NULL AND expires_at > now()`, so enumeration without a specific token returns nothing. Confirm this by running (from a dashboard anon session): `SELECT count(*) FROM athlete_invites` — should return `0`.
- **Service role key in edge function** — only used for the SECURITY DEFINER RPCs (`get_invite_email_context`, `mark_invite_email_sent`), never exposed to the client. Make sure you never log the request body in edge function logs as it contains invite tokens.
- **Email deliverability** — set up SPF + DKIM + DMARC on your sending domain; monitor Resend's bounce/complaint rate weekly.
- **Audit trail** — the `email_sent_at`, `email_send_attempts`, `email_last_error`, `email_provider` columns give you a built-in audit for every invite. Expose these in a practitioner-side "invite history" drawer eventually.
