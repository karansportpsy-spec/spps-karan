// src/components/EnableAthletePortal.tsx
//
// Practitioner-side: authorize an athlete's email for portal signup.
//
// Flow:
//   1. Practitioner types the athlete's email here and clicks "Authorize".
//   2. A row is inserted into public.athlete_authorized_emails.
//   3. The practitioner tells the athlete (in session, verbally):
//        "Go to <site>/athlete/login, click Sign up, use <email>, set a password."
//   4. When the athlete signs up, a DB trigger creates their portal profile
//      and marks the whitelist entry as claimed. Attempts to sign up with
//      any other email will be rejected at the database level.
//
// No email is sent. No links are generated. No background services required.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, AlertCircle, Smartphone, Copy, ShieldCheck,
  Trash2, UserCheck, Info,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface EnableAthletePortalProps {
  athleteId:        string
  athleteFirstName: string
  athleteEmail?:    string
}

type AuthorizedEmail = {
  id:         string
  email:      string
  claimed_at: string | null
  created_at: string
}

export default function EnableAthletePortal({
  athleteId,
  athleteFirstName,
  athleteEmail,
}: EnableAthletePortalProps) {
  const { user } = useAuth()
  const qc       = useQueryClient()

  const [email,  setEmail]  = useState(athleteEmail ?? '')
  const [copied, setCopied] = useState(false)

  const loginUrl = `${window.location.origin}/athlete/login`

  // ── Is the portal already activated for this athlete? ───────────────────
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

  // ── Is there already a pending (unclaimed) authorization? ───────────────
  const { data: pending } = useQuery<AuthorizedEmail | null>({
    queryKey: ['athlete_authorized_email', athleteId],
    enabled:  !!athleteId && !portalStatus?.portal_enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('athlete_authorized_emails')
        .select('id, email, claimed_at, created_at')
        .eq('athlete_id', athleteId)
        .is('claimed_at', null)
        .maybeSingle()
      return data as AuthorizedEmail | null
    },
  })

  // ── Authorize the email ─────────────────────────────────────────────────
  const authorize = useMutation({
    mutationFn: async () => {
      const trimmed = email.trim().toLowerCase()
      if (!trimmed)              throw new Error('Please enter an email address.')
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) throw new Error('Please enter a valid email address.')
      if (!user?.id)             throw new Error('You must be signed in.')

      const { data, error } = await supabase
        .from('athlete_authorized_emails')
        .insert({
          practitioner_id: user.id,
          athlete_id:      athleteId,
          email:           trimmed,
        })
        .select('id, email, claimed_at, created_at')
        .single()

      if (error) {
        // Friendly messages for common failures
        if (error.code === '23505') {
          if (error.message.includes('athlete_id')) {
            throw new Error('This athlete already has a pending or claimed email authorization.')
          }
          if (error.message.toLowerCase().includes('email')) {
            throw new Error('This email is already authorized for another athlete. Use a different email.')
          }
          throw new Error('This authorization already exists.')
        }
        throw error
      }
      return data as AuthorizedEmail
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete_authorized_email', athleteId] })
      qc.invalidateQueries({ queryKey: ['athlete_portal_status',    athleteId] })
    },
  })

  // ── Revoke the pending authorization ────────────────────────────────────
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('athlete_authorized_emails')
        .delete()
        .eq('id', id)
        .is('claimed_at', null) // extra safety — never delete claimed rows
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete_authorized_email', athleteId] })
    },
  })

  async function copyLoginUrl() {
    await navigator.clipboard.writeText(loginUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. Portal already active — the athlete has signed up
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
  // 2. Email authorized, athlete hasn't signed up yet
  // ════════════════════════════════════════════════════════════════════════
  if (pending) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <UserCheck size={18} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-blue-800 text-sm">Email Authorized — Waiting for Signup</p>
            <p className="text-xs text-blue-600 mt-0.5 break-all">{pending.email}</p>
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-3 text-xs text-gray-700 space-y-2">
          <p className="font-semibold text-gray-800 flex items-center gap-1">
            <Info size={12} className="text-blue-500" />
            Tell {athleteFirstName} (in session):
          </p>
          <ol className="list-decimal ml-4 space-y-1 text-gray-600">
            <li>Open <span className="font-mono text-blue-700 break-all">{loginUrl}</span></li>
            <li>Click <strong>"Sign up"</strong></li>
            <li>Use the email above and set a password</li>
            <li>That's it — they'll be taken to their dashboard</li>
          </ol>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copyLoginUrl}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy login URL</>}
          </button>

          <button
            onClick={() => {
              if (confirm(`Revoke authorization for ${pending.email}?`)) {
                revoke.mutate(pending.id)
              }
            }}
            disabled={revoke.isPending}
            className="px-3 py-2 bg-white border border-red-200 rounded-xl text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Revoke authorization"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {revoke.isError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {(revoke.error as Error).message}
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. Default: authorize a new email
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-[#1A2D4A]/10 rounded-xl flex items-center justify-center shrink-0">
          <ShieldCheck size={18} className="text-[#1A2D4A]" />
        </div>
        <div>
          <p className="font-semibold text-gray-700 text-sm">Authorize Athlete Portal</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Enter {athleteFirstName}'s email. They'll sign up themselves and choose their own password.
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

      {authorize.isError && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{(authorize.error as Error).message}</span>
        </div>
      )}

      <button
        onClick={() => authorize.mutate()}
        disabled={!email.trim() || authorize.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0D7C8E] hover:bg-[#0a6a7a] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {authorize.isPending
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Authorizing…</>
          : <><ShieldCheck size={15} /> Authorize email</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center">
        No email is sent. Tell {athleteFirstName} verbally that their email is authorized.
      </p>
    </div>
  )
}
