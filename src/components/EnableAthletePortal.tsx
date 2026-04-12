// src/components/EnableAthletePortal.tsx
// Practitioner-side component to enable athlete portal access
// Used inside the Athlete profile page / case formulation

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Mail, CheckCircle, Clock, AlertCircle, Copy, ExternalLink, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface EnableAthletePortalProps {
  athleteId: string
  athleteFirstName: string
  athleteEmail?: string
}

export default function EnableAthletePortal({ athleteId, athleteFirstName, athleteEmail }: EnableAthletePortalProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState(athleteEmail ?? '')
  const [copied, setCopied] = useState(false)
  const [inviteLink, setInviteLink] = useState('')

  // Check if portal already enabled
  const { data: portalStatus } = useQuery({
    queryKey: ['athlete_portal_status', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('athlete_profiles')
        .select('id, portal_enabled, email, last_active_at, portal_enabled_at')
        .eq('athlete_id', athleteId)
        .maybeSingle()
      return data
    },
  })

  // Check for pending invite
  const { data: pendingInvite } = useQuery({
    queryKey: ['athlete_invite', athleteId],
    enabled: !!athleteId && !portalStatus?.portal_enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('athlete_invites')
        .select('*')
        .eq('athlete_id', athleteId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  const enablePortal = useMutation({
    mutationFn: async () => {
      if (!email.trim() || !user?.id) throw new Error('Email required')

      // Create invite token
      const { data: invite, error: inviteErr } = await supabase
        .from('athlete_invites')
        .insert({
          practitioner_id: user.id,
          athlete_id: athleteId,
          email: email.trim(),
        })
        .select()
        .single()

      if (inviteErr) throw inviteErr

      // Auto-create conversation so practitioner can message first
      await supabase.from('conversation').upsert({
        practitioner_id: user.id,
        athlete_id: athleteId,
        status: 'active',
        practitioner_unread: 0,
        athlete_unread: 0,
      }, { onConflict: 'practitioner_id,athlete_id' }).catch(() => {})

      // Build invite URL
      const baseUrl = window.location.origin
      const link = `${baseUrl}/athlete/accept-invite?token=${invite.token}&email=${encodeURIComponent(email.trim())}`
      setInviteLink(link)

      return invite
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete_portal_status', athleteId] })
      qc.invalidateQueries({ queryKey: ['athlete_invite', athleteId] })
    },
  })

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink || `${window.location.origin}/athletes/accept-invite?token=${pendingInvite?.token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Already enabled ────────────────────────────────────────────────────────
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

  // ── Pending invite ─────────────────────────────────────────────────────────
  if (pendingInvite && !inviteLink) {
    const expiresAt = new Date(pendingInvite.expires_at)
    const hoursLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))
    const link = `${window.location.origin}/athletes/accept-invite?token=${pendingInvite.token}&email=${encodeURIComponent(pendingInvite.email)}`

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-800 text-sm">Invite Pending</p>
            <p className="text-xs text-amber-600 mt-0.5">Sent to {pendingInvite.email} · expires in {hoursLeft}h</p>
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Share this link with {athleteFirstName}:</p>
          <p className="text-xs text-gray-600 break-all font-mono">{link}</p>
        </div>

        <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
            copied ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          }`}>
          {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Invite Link</>}
        </button>
      </div>
    )
  }

  // ── Invite generated this session ─────────────────────────────────────────
  if (inviteLink) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-blue-800 text-sm">Invite Created!</p>
            <p className="text-xs text-blue-600 mt-0.5">Share this link with {athleteFirstName} — expires in 48 hours</p>
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-gray-600 break-all font-mono">{inviteLink}</p>
        </div>

        <div className="flex gap-2">
          <button onClick={copyLink}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
              copied ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}>
            {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
          </button>
          <a href={inviteLink} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 bg-white border border-blue-200 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors">
            <ExternalLink size={16} />
          </a>
        </div>

        <p className="text-xs text-blue-500 text-center">
          {athleteFirstName} opens this link → sets a password → gets access to their portal
        </p>
      </div>
    )
  }

  // ── Not yet enabled ────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-gray-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-700 text-sm">Athlete Portal</p>
          <p className="text-xs text-gray-400 mt-0.5">{athleteFirstName} can access tasks, messages & progress</p>
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
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {enablePortal.isError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} /> {(enablePortal.error as Error).message}
        </div>
      )}

      <button
        onClick={() => enablePortal.mutate()}
        disabled={!email.trim() || enablePortal.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
        {enablePortal.isPending
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating invite…</>
          : <><Mail size={15} /> Enable Portal & Generate Invite Link</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center">
        You'll get a shareable link to send to {athleteFirstName}
      </p>
    </div>
  )
}
