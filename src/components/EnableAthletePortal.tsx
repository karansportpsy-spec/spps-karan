// src/components/EnableAthletePortal.tsx
// Practitioner-side component to enable athlete portal access
// Creates an invite + automatically sends a branded email to the athlete.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail, CheckCircle, Clock, AlertCircle, Copy, ExternalLink,
  Smartphone, Send, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface EnableAthletePortalProps {
  athleteId:        string
  athleteFirstName: string
  athleteEmail?:    string
}

type InviteRow = {
  id:            string
  token:         string
  email:         string
  expires_at:    string
  accepted_at:   string | null
  email_sent_at: string | null
  email_last_error: string | null
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildAcceptUrl(token: string, email: string): string {
  // NOTE: singular `/athlete/` to match router.tsx
  return `${window.location.origin}/athlete/accept-invite?token=${token}&email=${encodeURIComponent(email)}`
}

async function invokeSendEmail(inviteId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-athlete-invite', {
      body: { invite_id: inviteId },
    })
    if (error) {
      // supabase-js swallows the JSON body in `error.context.responseText`
      let detail = error.message
      try {
        const body = (error as any).context?.responseText
          ? JSON.parse((error as any).context.responseText)
          : null
        if (body?.error) detail = body.error
      } catch { /* ignore */ }
      return { ok: false, error: detail }
    }
    if (data?.ok) return { ok: true }
    return { ok: false, error: data?.error ?? 'Unknown error from email service' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function EnableAthletePortal({
  athleteId,
  athleteFirstName,
  athleteEmail,
}: EnableAthletePortalProps) {
  const { user } = useAuth()
  const qc       = useQueryClient()

  const [email,     setEmail]     = useState(athleteEmail ?? '')
  const [copied,    setCopied]    = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // ── Is portal already enabled? ──────────────────────────────────────────
  const { data: portalStatus } = useQuery({
    queryKey: ['athlete_portal_status', athleteId],
    enabled:  !!athleteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('athlete_profiles')
        .select('id, portal_enabled, email, last_active_at, portal_enabled_at')
        .eq('athlete_id', athleteId)
        .maybeSingle()
      return data
    },
  })

  // ── Pending invite? ─────────────────────────────────────────────────────
  const { data: pendingInvite } = useQuery<InviteRow | null>({
    queryKey: ['athlete_invite', athleteId],
    enabled:  !!athleteId && !portalStatus?.portal_enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('athlete_invites')
        .select('id, token, email, expires_at, accepted_at, email_sent_at, email_last_error')
        .eq('athlete_id', athleteId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as InviteRow | null
    },
  })

  // ── Create invite + send email ──────────────────────────────────────────
  const enablePortal = useMutation({
    mutationFn: async () => {
      if (!email.trim())  throw new Error('Email is required')
      if (!user?.id)      throw new Error('You must be signed in')

      setLastError(null)

      // 1. Create the invite row. The token is generated server-side.
      const { data: invite, error: inviteErr } = await supabase
        .from('athlete_invites')
        .insert({
          practitioner_id: user.id,
          athlete_id:      athleteId,
          email:           email.trim().toLowerCase(),
        })
        .select('id, token, email, expires_at, accepted_at, email_sent_at, email_last_error')
        .single()

      if (inviteErr) throw new Error(`Could not create invite: ${inviteErr.message}`)

      // Auto-create conversation so practitioner can message first.
      // Ignore failures for legacy schemas where this table/constraint may not exist.
      try {
        await supabase.from('conversations').upsert(
          {
            practitioner_id: user.id,
            athlete_id: athleteId,
            status: 'active',
            practitioner_unread: 0,
            athlete_unread: 0,
          },
          { onConflict: 'practitioner_id,athlete_id' }
        )
      } catch {
        // No-op on conversation bootstrap failure.
      }

      // 3. Ask the edge function to email the athlete
      const send = await invokeSendEmail(invite.id)

      return { invite: invite as InviteRow, send }
    },
    onSuccess: ({ send }) => {
      if (!send.ok) setLastError(send.error ?? 'Email could not be sent')
      qc.invalidateQueries({ queryKey: ['athlete_portal_status', athleteId] })
      qc.invalidateQueries({ queryKey: ['athlete_invite',        athleteId] })
    },
    onError: (e: Error) => {
      setLastError(e.message)
    },
  })

  // ── Resend email for an existing pending invite ─────────────────────────
  const resendEmail = useMutation({
    mutationFn: async (inviteId: string) => {
      setLastError(null)
      const res = await invokeSendEmail(inviteId)
      if (!res.ok) throw new Error(res.error ?? 'Email could not be sent')
      return res
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete_invite', athleteId] })
    },
    onError: (e: Error) => setLastError(e.message),
  })

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Already enabled
  // ════════════════════════════════════════════════════════════════════════
  if (portalStatus?.portal_enabled) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <Smartphone size={18} className="text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-green-800 text-sm">Athlete Portal Active</p>
            <p className="text-xs text-green-600 mt-0.5">{portalStatus.email}</p>
            {portalStatus.last_active_at && (
              <p className="text-xs text-green-500 mt-1">
                Last active: {new Date(portalStatus.last_active_at).toLocaleDateString('en-IN')}
              </p>
            )}
          </div>
          <CheckCircle size={18} className="text-green-500 shrink-0" />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Pending invite (either freshly created this session OR existing)
  // ════════════════════════════════════════════════════════════════════════
  const activeInvite = enablePortal.data?.invite ?? pendingInvite ?? null
  const activeSend   = enablePortal.data?.send   ?? null

  if (activeInvite) {
    const link       = buildAcceptUrl(activeInvite.token, activeInvite.email)
    const expiresAt  = new Date(activeInvite.expires_at)
    const hoursLeft  = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000))

    // Email state: sent, failed, or sending
    const emailSent  = Boolean(activeInvite.email_sent_at) || activeSend?.ok === true
    const emailErr   = lastError ?? activeInvite.email_last_error ?? (activeSend?.ok === false ? activeSend.error : null)

    return (
      <div className={`rounded-2xl p-4 space-y-3 border ${
        emailSent ? 'bg-blue-50 border-blue-200' : emailErr ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
      }`}>
        {/* Status header */}
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            emailSent ? 'bg-blue-100' : emailErr ? 'bg-amber-100' : 'bg-blue-100'
          }`}>
            {emailSent
              ? <Mail size={18} className="text-blue-600" />
              : emailErr
                ? <AlertCircle size={18} className="text-amber-600" />
                : <Clock size={18} className="text-blue-600" />}
          </div>
          <div className="flex-1">
            <p className={`font-semibold text-sm ${
              emailSent ? 'text-blue-800' : emailErr ? 'text-amber-800' : 'text-blue-800'
            }`}>
              {emailSent ? 'Invite email sent' : emailErr ? 'Invite created — email failed' : 'Invite created'}
            </p>
            <p className={`text-xs mt-0.5 ${
              emailSent ? 'text-blue-600' : emailErr ? 'text-amber-700' : 'text-blue-600'
            }`}>
              To <span className="font-medium">{activeInvite.email}</span> · expires in {hoursLeft}h
            </p>
          </div>
        </div>

        {/* Error banner */}
        {emailErr && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Email provider error</p>
              <p className="text-amber-700 mt-0.5 break-words">{emailErr}</p>
              <p className="text-amber-600 mt-1">You can share the link below manually as a fallback.</p>
            </div>
          </div>
        )}

        {/* Shareable fallback link */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">
            Fallback link (also in the email):
          </p>
          <p className="text-xs text-gray-600 break-all font-mono">{link}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => resendEmail.mutate(activeInvite.id)}
            disabled={resendEmail.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all bg-[#0D7C8E] hover:bg-[#0a6a7a] disabled:opacity-50 text-white"
          >
            {resendEmail.isPending
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              : emailSent
                ? <><RefreshCw size={14} /> Resend email</>
                : <><Send size={14} /> Send email</>
            }
          </button>

          <button
            onClick={() => copyLink(link)}
            className={`px-3 py-2 border rounded-xl text-sm font-medium transition-all ${
              copied
                ? 'bg-green-100 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            title="Copy link"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>

          <a href={link} target="_blank" rel="noopener noreferrer"
             className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
             title="Preview invite page">
            <ExternalLink size={14} />
          </a>
        </div>

        <p className="text-xs text-gray-500 text-center">
          {athleteFirstName} opens the link → sets a password → enters portal
        </p>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Not yet enabled (default state)
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-[#1A2D4A]/10 rounded-xl flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-[#1A2D4A]" />
        </div>
        <div>
          <p className="font-semibold text-gray-700 text-sm">Enable Athlete Portal</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {athleteFirstName} will receive an email with a link to set their password.
          </p>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {athleteFirstName}'s email address
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="athlete@email.com"
          autoComplete="off"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E] focus:border-transparent"
        />
      </div>

      {(enablePortal.isError || lastError) && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{lastError ?? (enablePortal.error as Error)?.message}</span>
        </div>
      )}

      <button
        onClick={() => enablePortal.mutate()}
        disabled={!email.trim() || enablePortal.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0D7C8E] hover:bg-[#0a6a7a] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {enablePortal.isPending
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating invite &amp; sending email…</>
          : <><Mail size={15} /> Send invitation to {athleteFirstName}</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center">
        Invites expire after 48 hours
      </p>
    </div>
  )
}
