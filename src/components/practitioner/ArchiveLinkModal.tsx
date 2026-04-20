// src/components/practitioner/ArchiveLinkModal.tsx
//
// Practitioner-side confirmation modal for discontinuing a link.
// Wraps the `archive_link` RPC (migration 5). Optional reason captured.
//
// On success: link flips to 'archived_by_practitioner', conversation is
// closed by trigger, athlete receives a notification, PractitionerContext
// refreshes so the athlete disappears from the active grid.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  X, AlertCircle, Archive, Loader2, CheckCircle2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePractitionerData } from '@/contexts/PractitionerContext'

interface RpcResult {
  ok:          boolean
  code?:       string
  link_id?:    string
  new_status?: string
  status?:     string
}

interface Props {
  open:         boolean
  linkId:       string | null
  athleteName:  string
  onClose:      () => void
}

export default function ArchiveLinkModal({ open, linkId, athleteName, onClose }: Props) {
  const { refresh } = usePractitionerData()
  const [reason, setReason]   = useState('')
  const [done, setDone]       = useState(false)

  const archiveMutation = useMutation({
    mutationFn: async (): Promise<RpcResult> => {
      if (!linkId) throw new Error('Missing link ID')
      const { data, error } = await supabase.rpc('archive_link', {
        p_link_id: linkId,
        p_reason:  reason.trim() || null,
      })
      if (error) throw error
      return data as RpcResult
    },
    onSuccess: async (result) => {
      if (result.ok) {
        setDone(true)
        await refresh()
      }
    },
  })

  function handleClose() {
    setReason('')
    setDone(false)
    archiveMutation.reset()
    onClose()
  }

  if (!open) return null

  const errorMessage =
    archiveMutation.isError
      ? (archiveMutation.error as Error)?.message ?? 'Something went wrong.'
      : archiveMutation.data?.ok === false
        ? archiveMutation.data.code ?? 'Failed to archive link'
        : null

  // Success state
  if (done) {
    return (
      <Shell onClose={handleClose}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={26} className="text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Link archived
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            Your connection with <span className="font-semibold">{athleteName}</span> is
            archived. All historical data is preserved and read-only. They've
            been notified.
          </p>
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell onClose={handleClose}>
      <div className="py-2">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Archive size={18} className="text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Discontinue link with {athleteName}?
            </h3>
            <p className="text-sm text-gray-600">
              This closes the conversation and stops new sessions, programs,
              and messages. All existing data stays in your records (read-only)
              for compliance retention.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-1.5">
          <p className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">•</span>
            <span>The athlete will see this link move to their "Archived" list.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">•</span>
            <span>You can link to them again later by email if they return to your care.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">•</span>
            <span>This is not a delete. All historical records remain per DPDP / PsyCouncil retention policies.</span>
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Reason (optional, for your records)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Athlete moved to another city / end of season / mutual agreement"
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={archiveMutation.isPending}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
          >
            {archiveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {archiveMutation.isPending ? 'Archiving…' : 'Archive link'}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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
