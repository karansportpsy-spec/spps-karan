// supabase/functions/send-athlete-invite/index.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// SPPS — Send Athlete Portal Invite Email
// ─────────────────────────────────────────────────────────────────────────────
// Triggered from the practitioner UI (EnableAthletePortal.tsx) AFTER an invite
// row has been inserted into public.athlete_invites. This function:
//
//   1. Verifies the calling user is a logged-in practitioner
//   2. Confirms the practitioner actually owns the invite (authorization)
//   3. Loads invite + athlete + practitioner context via SECURITY DEFINER RPC
//   4. Sends a branded HTML email via Resend with the accept-invite link
//   5. Records email status on the invite row
//
// Environment / Secrets required (set via `supabase secrets set`):
//   RESEND_API_KEY      — API key from resend.com
//   FROM_EMAIL          — e.g. "WinMindPerform <invites@winmindperform.com>"
//                         (must be a verified domain in Resend)
//   CLIENT_ORIGIN       — e.g. "https://spps-karan.vercel.app"
//                         (the origin the athlete opens to accept)
//
// These are auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy send-athlete-invite --no-verify-jwt
//   (we handle JWT verification manually to give clearer errors)
// ─────────────────────────────────────────────────────────────────────────────

// @ts-ignore — Deno std import, ignored by TS server in IDE
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  invite_id: string
}

interface EmailContext {
  invite_id:          string
  token:              string
  email:              string
  expires_at:         string
  practitioner_id:    string
  practitioner_name:  string
  practitioner_email: string
  athlete_id:         string
  athlete_first_name: string
  athlete_last_name:  string
  athlete_sport:      string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Email template — WinMindPerform brand
// ─────────────────────────────────────────────────────────────────────────────
function buildEmail(ctx: EmailContext, acceptUrl: string) {
  const expiryHours = Math.max(1, Math.round(
    (new Date(ctx.expires_at).getTime() - Date.now()) / 3_600_000
  ))
  const sportLine = ctx.athlete_sport ? ` (${ctx.athlete_sport})` : ''

  const subject = `${ctx.practitioner_name} has invited you to WinMindPerform`

  const text = [
    `Hi ${ctx.athlete_first_name},`,
    ``,
    `${ctx.practitioner_name} has set up your personal performance portal on WinMindPerform — your dedicated space for mental performance training, daily check-ins, and direct messaging with your practitioner.`,
    ``,
    `Open this link to set your password and access your portal:`,
    acceptUrl,
    ``,
    `This link expires in ${expiryHours} hour${expiryHours === 1 ? '' : 's'}. If it expires, ask your practitioner to send a new invite.`,
    ``,
    `What you'll get access to:`,
    `  • Daily tasks and mental performance exercises`,
    `  • Direct messaging with ${ctx.practitioner_name}`,
    `  • AI mental performance assistant (24/7)`,
    `  • Progress tracking and session schedule`,
    ``,
    `If you weren't expecting this email, you can safely ignore it — the link will expire on its own.`,
    ``,
    `— The WinMindPerform Team`,
  ].join('\n')

  const html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A2D4A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(26,45,74,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1A2D4A 0%,#0D7C8E 100%);padding:32px 32px 28px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;line-height:56px;font-size:28px;color:#ffffff;font-weight:800;margin-bottom:12px;">W</div>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.01em;">WinMindPerform</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Sport Psychology Performance Portal</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <p style="margin:0 0 8px;font-size:14px;color:#7C3AED;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">You're invited</p>
          <h2 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800;color:#1A2D4A;">
            Hi ${escape(ctx.athlete_first_name)}${escape(sportLine)},
          </h2>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
            <strong style="color:#1A2D4A;">${escape(ctx.practitioner_name)}</strong> has set up your personal performance portal — your dedicated space for mental performance training, daily check-ins, and direct messaging.
          </p>

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background:#0D7C8E;border-radius:12px;">
              <a href="${escape(acceptUrl)}"
                 style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em;">
                Activate my portal →
              </a>
            </td></tr>
          </table>

          <p style="margin:16px 0 24px;font-size:13px;color:#6b7280;">
            This link expires in <strong>${expiryHours} hour${expiryHours === 1 ? '' : 's'}</strong>. If it does, ask your practitioner to send a new invite.
          </p>

          <!-- Features -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;margin:8px 0 0;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1A2D4A;">What you'll get:</p>
            <ul style="margin:0;padding:0 0 0 18px;font-size:13px;line-height:1.8;color:#4b5563;">
              <li>Daily tasks and mental performance exercises</li>
              <li>Direct messaging with ${escape(ctx.practitioner_name)}</li>
              <li>AI mental performance assistant (24/7)</li>
              <li>Progress tracking and session schedule</li>
            </ul>
          </div>

          <!-- Fallback link -->
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
            Button not working? Copy and paste this link:<br>
            <a href="${escape(acceptUrl)}" style="color:#0D7C8E;word-break:break-all;">${escape(acceptUrl)}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">
            Didn't expect this email? You can safely ignore it — the link will expire on its own.
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            WinMindPerform · Sport Psychology Performance Suite<br>
            Your data is protected under DPDP Act 2023
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

function escape(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────────────────────────────────────────
// Resend send
// ─────────────────────────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  apiKey: string
  from:   string
  to:     string
  subject: string
  text:    string
  html:    string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    opts.from,
      to:      [opts.to],
      subject: opts.subject,
      text:    opts.text,
      html:    opts.html,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: body?.message ?? `Resend HTTP ${res.status}` }
  }
  return { ok: true, id: body?.id }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // ── Load env ─────────────────────────────────────────────────────────────
    // @ts-ignore — Deno global
    const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
    // @ts-ignore
    const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
    // @ts-ignore
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // @ts-ignore
    const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')
    // @ts-ignore
    const FROM_EMAIL                = Deno.env.get('FROM_EMAIL') ?? 'WinMindPerform <onboarding@resend.dev>'
    // @ts-ignore
    const CLIENT_ORIGIN             = (Deno.env.get('CLIENT_ORIGIN') ?? '').replace(/\/+$/, '')

    if (!CLIENT_ORIGIN) {
      return json({ error: 'CLIENT_ORIGIN secret is not configured' }, 500)
    }
    if (!RESEND_API_KEY) {
      return json({
        error: 'Email provider not configured. Set RESEND_API_KEY via `supabase secrets set`.',
      }, 503)
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body: RequestBody = await req.json().catch(() => ({} as any))
    if (!body?.invite_id) {
      return json({ error: 'invite_id is required' }, 400)
    }

    // ── Authenticate caller ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

    // Client scoped to the caller's JWT — so auth.uid() works
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ error: 'Invalid or expired session' }, 401)
    }
    const callerId = userData.user.id

    // ── Admin client for DB work that needs to bypass RLS ────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ── Load invite context via SECURITY DEFINER RPC ─────────────────────────
    const { data: ctxRows, error: ctxErr } = await admin
      .rpc('get_invite_email_context', { p_invite_id: body.invite_id })

    if (ctxErr) {
      console.error('[send-athlete-invite] RPC error:', ctxErr)
      return json({ error: `Lookup failed: ${ctxErr.message}` }, 500)
    }
    if (!ctxRows || ctxRows.length === 0) {
      return json({ error: 'Invite not found' }, 404)
    }
    const ctx: EmailContext = ctxRows[0]

    // ── Authorization: caller must own this invite ───────────────────────────
    if (ctx.practitioner_id !== callerId) {
      return json({ error: 'Forbidden — invite belongs to another practitioner' }, 403)
    }

    // ── Expiry check ─────────────────────────────────────────────────────────
    if (new Date(ctx.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Invite has expired. Create a new one.' }, 410)
    }

    // ── Build accept URL + email content ─────────────────────────────────────
    const acceptUrl = `${CLIENT_ORIGIN}/athlete/accept-invite?token=${ctx.token}&email=${encodeURIComponent(ctx.email)}`
    const { subject, text, html } = buildEmail(ctx, acceptUrl)

    // ── Send via Resend ──────────────────────────────────────────────────────
    const send = await sendViaResend({
      apiKey:  RESEND_API_KEY,
      from:    FROM_EMAIL,
      to:      ctx.email,
      subject,
      text,
      html,
    })

    // ── Persist email status ─────────────────────────────────────────────────
    await admin.rpc('mark_invite_email_sent', {
      p_invite_id: ctx.invite_id,
      p_provider:  send.ok ? 'resend' : 'resend',
      p_error:     send.ok ? null : (send.error ?? 'Unknown error'),
    })

    if (!send.ok) {
      console.error('[send-athlete-invite] Resend failed:', send.error)
      return json({
        error:    `Email provider rejected the message: ${send.error}`,
        provider: 'resend',
      }, 502)
    }

    return json({
      ok:        true,
      provider:  'resend',
      message_id: send.id,
      sent_to:    ctx.email,
    }, 200)

  } catch (err) {
    console.error('[send-athlete-invite] Unhandled:', err)
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
