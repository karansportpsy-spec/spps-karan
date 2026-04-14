// src/components/practitioner/SessionRequestsPanel.tsx
import { useState } from 'react'
import { Calendar, CheckCircle, X, Clock, AlertTriangle } from 'lucide-react'
import { usePractitionerSessionRequests, useRespondToRequest } from '@/hooks/useSessionRequests'
import type { AthleteSessionRequest } from '@/types/sync'

const URGENCY_STYLES: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  crisis: 'bg-red-100 text-red-800 font-bold',
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  seen:      'bg-blue-100 text-blue-700',
  accepted:  'bg-emerald-100 text-emerald-700',
  declined:  'bg-red-100 text-red-600',
  completed: 'bg-gray-100 text-gray-500',
}

function RequestCard({ req }: { req: AthleteSessionRequest }) {
  const [response, setResponse] = useState('')
  const respond = useRespondToRequest()
  const isCrisis = req.urgency === 'crisis'
  const isPending = req.status === 'pending' || req.status === 'seen'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${
      isCrisis ? 'border-red-300 shadow-sm shadow-red-100' : 'border-gray-100'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${URGENCY_STYLES[req.urgency]}`}>
                {isCrisis ? '🚨 CRISIS' : req.urgency.toUpperCase()}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[req.status]}`}>
                {req.status}
              </span>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                {req.request_type.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="font-semibold text-gray-900">{req.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {req.athlete?.first_name} {req.athlete?.last_name}
              {req.athlete?.sport ? ` · ${req.athlete.sport}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-xs text-gray-400">
              {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
            {req.preferred_date && (
              <p className="text-xs text-blue-600 flex items-center gap-1 justify-end">
                <Calendar size={10} />
                {new Date(req.preferred_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {req.preferred_time && ` · ${req.preferred_time.slice(0, 5)}`}
              </p>
            )}
          </div>
        </div>

        {req.description && (
          <p className="text-sm text-gray-600 mt-2 leading-relaxed bg-gray-50 rounded-xl px-3 py-2">
            {req.description}
          </p>
        )}
      </div>

      {/* Respond — only for pending/seen */}
      {isPending && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            rows={2}
            placeholder="Optional response message to athlete…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => respond.mutate({ requestId: req.id, status: 'accepted', response })}
              disabled={respond.isPending}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <CheckCircle size={14} /> Accept
            </button>
            <button
              onClick={() => respond.mutate({ requestId: req.id, status: 'declined', response })}
              disabled={respond.isPending}
              className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <X size={14} /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Practitioner's response */}
      {req.practitioner_response && (
        <div className="px-4 pb-3 border-t border-blue-50 bg-blue-50">
          <p className="text-xs font-semibold text-blue-600 mb-0.5">Your response:</p>
          <p className="text-xs text-blue-700">{req.practitioner_response}</p>
          {req.responded_at && (
            <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
              <Clock size={9} />
              {new Date(req.responded_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SessionRequestsPanel() {
  const [statusFilter, setStatusFilter] = useState<string[]>(['pending', 'seen'])
  const { data: requests = [], isLoading } = usePractitionerSessionRequests(statusFilter)

  const crisisRequests = requests.filter(r => r.urgency === 'crisis' && r.status === 'pending')
  const normalRequests = requests.filter(r => !(r.urgency === 'crisis' && r.status === 'pending'))

  const STATUS_OPTIONS = ['pending', 'seen', 'accepted', 'declined', 'completed'] as const

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() =>
              setStatusFilter(f =>
                f.includes(s) ? f.filter(x => x !== s) : [...f, s]
              )
            }
            className={`text-xs px-3 py-1.5 rounded-full font-medium border-2 transition-all ${
              statusFilter.includes(s)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Crisis requests — always shown first with emphasis */}
      {crisisRequests.map(r => (
        <div key={r.id} className="border-2 border-red-400 rounded-2xl p-0.5">
          <div className="bg-red-50 rounded-xl px-3 py-2 mb-1 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-700">Urgent — Crisis Request</p>
          </div>
          <RequestCard req={r} />
        </div>
      ))}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : normalRequests.length === 0 && crisisRequests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No requests</p>
          <p className="text-xs mt-1 text-gray-300">Athlete requests will appear here</p>
        </div>
      ) : (
        normalRequests.map(r => <RequestCard key={r.id} req={r} />)
      )}
    </div>
  )
}
