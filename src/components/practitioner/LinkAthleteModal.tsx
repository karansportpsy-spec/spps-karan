// src/components/practitioner/LinkAthleteModal.tsx
//
// The link-by-email modal. Practitioners type an athlete's email, this calls
// the `link_athlete_by_email` RPC (defined in migration 5), and handles the
// three response paths:
//
//   1. ok: true                      → success state, refresh dashboard, close
//   2. code: ATHLETE_NOT_FOUND       → invite-by-email fallback (copy/share)
//   3. code: ALREADY_LINKED          → "already in your list" message
//
// The RPC handles atomicity: link insert + conversation create + notification
// emit + status recompute all happen in one transaction.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Link as LinkIcon, Mail, AlertCircle, CheckCircle2, X,
  UserPlus, Loader2, Copy, ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePractitionerData } from '@/contexts/PractitionerContext'

interface RpcResult {
  ok:                 boolean
  code?:              'NOT_A_PRACTITIONER' | 'ATHLETE_NOT_FOUND' | 'ALREADY_LINKED'
  message?:           string
  link_id?:           string
  conversation_id?:   string
  athlete_id?:        string
  athlete_first_name?: string
  athlete_last_name?:  string
}

interface Props {
  open:    boolean
  onClose: () => void
}

export default function LinkAthleteModal({ open, onClose }: Props) {
  const { refresh } = usePractitionerData()
  const [email, setEmail]     = useState('')
  const [success, setSuccess] = useState<RpcResult | null>(null)
  const [copied, setCopied]   = useState(false)

  const linkMutation = useMutation({
    mutationFn: async (e: string): Promise<RpcResult> => {
      const { data, error } = await supabase.rpc('link_athlete_by_email', {
        p_email: e.trim(),
      })
      if (error) throw error
      return data as RpcResult
    },
    onSuccess: async (result) => {
      if (result.ok) {
        setSuccess(result)
        await refresh()
      }
    },
  })

  function handleClose() {
    setEmail('')
    setSuccess(null)
    setCopied(false)
    linkMutation.reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSuccess(null)
    linkMutation.mutate(email.trim())
  }

  async function copySignupLink() {
    const url = `${window.location.origin}/athlete/signup`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard API can fail on insecure contexts — silent
    }
  }

  if (!open) return null

  const result = linkMutation.data
  const isError = linkMutation.isError
  const isPending = linkMutation.isPending
  const errorMessage = isError
    ? (linkMutation.error as Error)?.message ?? 'Something went wrong.'
    : null

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    const athleteName = [success.athlete_first_name, success.athlete_last_name]
      .filter(Boolean).join(' ') || 'the athlete'
    return (
      <ModalShell onClose={handleClose}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={26} className="text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Linked successfully
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            <span className="font-semibold">{athleteName}</span> is now in your
            active athletes list. They've been notified that you've linked to
            them and can message you immediately.
          </p>
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </ModalShell>
    )
  }

  // ── Athlete not found state ──────────────────────────────────────────────
  if (result?.ok === false && result.code === 'ATHLETE_NOT_FOUND') {
    return (
      <ModalShell onClose={handleClose}>
        <div className="py-2">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
            <Mail size={20} className="text-amber-700" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            No account found for this email
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            <span className="font-mono text-xs bg-gray-50 px-2 py-0.5 rounded">{email}</span>
            {' '}has not signed up as an athlete on SPPS yet. Send them this signup
            link — once they create an account with this exact email, you can
            come back here and link to them.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">Athlete signup URL</p>
            <p className="font-mono text-xs text-gray-800 break-all mb-3">
              {window.location.origin}/athlete/signup
            </p>
            <button
              onClick={copySignupLink}
              className="w-full inline-flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              {copied ? <CheckCircle2 size={13} className="text-green-600" /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy signup link'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setEmail(''); linkMutation.reset() }}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Try another email
            </button>
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Already linked state ──────────────────────────────────────────────────
  if (result?.ok === false && result.code === 'ALREADY_LINKED') {
    return (
      <ModalShell onClose={handleClose}>
        <div className="py-2">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
            <LinkIcon size={20} className="text-blue-700" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Already linked
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            You already have an active link with this athlete. They're in your
            athletes list.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setEmail(''); linkMutation.reset() }}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Link another
            </button>
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Default form state ────────────────────────────────────────────────────
  return (
    <ModalShell onClose={handleClose}>
      <div className="py-2">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <UserPlus size={18} className="text-blue-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Link an athlete
            </h3>
            <p className="text-sm text-gray-600">
              Type the email address the athlete signed up with. They'll be
              notified immediately and can message you back.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {errorMessage && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Athlete email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="athlete@example.com"
              required
              autoFocus
              autoComplete="off"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 space-y-1.5">
            <p className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>The athlete must already have an SPPS account.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>You'll only see what they explicitly share with you (daily logs, journals, etc.). Other practitioners' data stays private.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>Either party can discontinue at any time.</span>
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !email.trim()}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {isPending ? 'Linking…' : 'Link athlete'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}

// ── Shared modal shell ─────────────────────────────────────────────────────
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}
