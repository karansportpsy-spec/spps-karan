// src/pages/athletes/MyPractitionersPage.tsx
//
// Athlete's "My Practitioners" management surface.
//
// Shows:
//   • Active links (with discontinue button)
//   • Archived links (read-only historical view)
//
// Discontinue flow:
//   • Confirm modal → archive_link RPC → invalidate portal summary
//   • Link moves from Active to Archived
//   • Conversation auto-closes (trigger in migration 3)
//   • Practitioner is notified via notifications table (handled by archive_link RPC)

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  UserX, Info, Loader2, AlertCircle, CheckCircle2,
  ChevronLeft, ShieldCheck, Archive, Clock,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import AthletePortalShell from '@/components/athlete/AthletePortalShell'
import { usePortal, type ActiveLink, type ArchivedLink } from '@/contexts/PortalContext'
import { supabase } from '@/lib/supabase'

export default function MyPractitionersPage() {
  const { activeLinks, archivedLinks, isLoading, refresh } = usePortal()
  const [confirmLink, setConfirmLink] = useState<ActiveLink | null>(null)

  const archiveMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await supabase.rpc('archive_link', {
        p_link_id: linkId,
        p_reason: 'athlete_discontinued_via_portal',
      })
      if (error) throw error
      if (!data?.ok) {
        throw new Error(data?.code ?? 'ARCHIVE_FAILED')
      }
      return data
    },
    onSuccess: async () => {
      setConfirmLink(null)
      await refresh()
    },
  })

  return (
    <AthletePortalShell>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/athlete/dashboard"
          className="p-1.5 rounded-lg hover:bg-white/60 text-gray-600"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Practitioners</h1>
          <p className="text-sm text-gray-600">
            Manage the practitioners linked to your account.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-6 bg-white border border-teal-100 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="text-teal-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-gray-800 mb-1">Your data is siloed</p>
          <p className="text-gray-600 text-xs leading-relaxed">
            Each practitioner sees only the data you tag for them. They can't
            see what another practitioner writes about you, and your daily
            logs stay private until you explicitly share them. You can
            discontinue any practitioner at any time — your history stays with
            you.
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-24 bg-white/60 rounded-2xl animate-pulse" />
          <div className="h-24 bg-white/60 rounded-2xl animate-pulse" />
        </div>
      )}

      {/* Active links */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-teal-600" />
          Active ({activeLinks.length})
        </h2>

        {activeLinks.length === 0 && !isLoading ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 text-center">
            <Info size={22} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700 mb-1">
              No active practitioners
            </p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Share your account email with a practitioner and ask them to
              link to you. Once they do, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeLinks.map(link => (
              <ActiveCard
                key={link.link_id}
                link={link}
                onDiscontinue={() => setConfirmLink(link)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Archived links */}
      {archivedLinks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Archive size={14} className="text-gray-500" />
            Past ({archivedLinks.length})
          </h2>
          <div className="space-y-3">
            {archivedLinks.map(link => (
              <ArchivedCard key={link.link_id} link={link} />
            ))}
          </div>
        </section>
      )}

      {/* Discontinue confirmation modal */}
      {confirmLink && (
        <DiscontinueModal
          link={confirmLink}
          onCancel={() => {
            setConfirmLink(null)
            archiveMutation.reset()
          }}
          onConfirm={() => archiveMutation.mutate(confirmLink.link_id)}
          isLoading={archiveMutation.isPending}
          error={archiveMutation.isError ? (archiveMutation.error as Error).message : null}
        />
      )}
    </AthletePortalShell>
  )
}

// ── Cards ───────────────────────────────────────────────────────────────────

function ActiveCard({
  link, onDiscontinue,
}: {
  link: ActiveLink
  onDiscontinue: () => void
}) {
  const fullName = `${link.practitioner_first_name} ${link.practitioner_last_name}`.trim() || 'Practitioner'
  const initials = `${link.practitioner_first_name?.[0] ?? ''}${link.practitioner_last_name?.[0] ?? ''}`.toUpperCase() || 'P'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {link.practitioner_avatar ? (
          <img
            src={link.practitioner_avatar}
            alt={fullName}
            className="w-11 h-11 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">Dr {fullName}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={10} /> Active
            </span>
          </div>
          <p className="text-xs text-gray-500 break-all">{link.practitioner_email}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Linked {formatDate(link.linked_at)}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
        <button
          onClick={onDiscontinue}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          <UserX size={13} /> Discontinue
        </button>
      </div>
    </div>
  )
}

function ArchivedCard({ link }: { link: ArchivedLink }) {
  const fullName = `${link.practitioner_first_name} ${link.practitioner_last_name}`.trim() || 'Practitioner'
  const initials = `${link.practitioner_first_name?.[0] ?? ''}${link.practitioner_last_name?.[0] ?? ''}`.toUpperCase() || 'P'
  const whoArchived =
    link.status === 'archived_by_athlete'       ? 'You discontinued'
    : link.status === 'archived_by_practitioner' ? 'They ended the connection'
    : 'Archived'

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-gray-300 text-white flex items-center justify-center text-sm font-bold shrink-0 opacity-70">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-700">Dr {fullName}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full">
              <Archive size={10} /> Past
            </span>
          </div>
          <p className="text-xs text-gray-500 break-all">{link.practitioner_email}</p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
            <Clock size={11} />
            {whoArchived} • {formatDate(link.archived_at)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Discontinue modal ──────────────────────────────────────────────────────

function DiscontinueModal({
  link, onCancel, onConfirm, isLoading, error,
}: {
  link: ActiveLink
  onCancel: () => void
  onConfirm: () => void
  isLoading: boolean
  error: string | null
}) {
  const fullName = `${link.practitioner_first_name} ${link.practitioner_last_name}`.trim() || 'this practitioner'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <UserX size={18} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Discontinue Dr {fullName}?
            </h3>
            <p className="text-sm text-gray-600">
              You'll stop receiving new messages, programs, or session invites
              from them.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 mb-4 space-y-1">
          <p className="flex items-start gap-2">
            <span className="text-teal-600 mt-0.5">✓</span>
            <span>Your conversation history stays visible to you as a record.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-teal-600 mt-0.5">✓</span>
            <span>Data you shared with them is archived — they can view it but not edit.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-teal-600 mt-0.5">✓</span>
            <span>You can link to the same practitioner again later if you want.</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {isLoading ? 'Discontinuing…' : 'Yes, discontinue'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 1)  return 'today'
  if (days < 2)  return 'yesterday'
  if (days < 7)  return `${days} days ago`
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}
