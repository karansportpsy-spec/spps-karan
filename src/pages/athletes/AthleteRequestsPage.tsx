// src/pages/athlete/AthleteRequestsPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Send, CheckCircle, Calendar, Clock, AlertCircle, MessageSquare } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

const REQUEST_TYPES = [
  { value: 'session_booking', label: 'Book a Session', emoji: '📅' },
  { value: 'progress_review', label: 'Progress Review', emoji: '📊' },
  { value: 'help_support', label: 'Need Support', emoji: '🤝' },
  { value: 'intervention_feedback', label: 'Program Feedback', emoji: '💬' },
  { value: 'goal_update', label: 'Update My Goals', emoji: '🎯' },
]

const URGENCY_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'Urgent', color: 'bg-red-100 text-red-600' },
]

export default function AthleteRequestsPage() {
  const { athleteProfile, sendRequest } = useAthlete()
  const qc = useQueryClient()

  const [type, setType] = useState('session_booking')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState('normal')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)

  const { data: requests = [] } = useQuery({
    queryKey: ['athlete_requests', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    queryFn: async () => {
      const { data } = await supabase.from('athlete_requests').select('*')
        .eq('athlete_id', athleteProfile!.athlete_id).order('created_at', { ascending: false }).limit(20)
      return data ?? []
    },
  })

  async function handleSubmit() {
    if (!title.trim()) return
    setSaving(true)
    await sendRequest({ type, title: title.trim(), description: description.trim() || undefined, urgency, preferredDate: preferredDate || undefined, preferredTime: preferredTime || undefined })
    qc.invalidateQueries({ queryKey: ['athlete_requests'] })
    setSent(true)
    setSaving(false)
    setTimeout(() => { setSent(false); setTitle(''); setDescription(''); setPreferredDate(''); setPreferredTime('') }, 2000)
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700', seen: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700', completed: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400"><ChevronLeft size={20} /></Link>
        <h1 className="font-bold text-gray-900">Request a Session</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {sent ? (
          <div className="bg-white rounded-2xl border border-green-200 p-6 text-center">
            <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
            <h2 className="font-bold text-gray-900">Request Sent!</h2>
            <p className="text-sm text-gray-400 mt-1">Your practitioner will respond soon.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">What do you need?</p>
              <div className="grid grid-cols-2 gap-1.5">
                {REQUEST_TYPES.map(r => (
                  <button key={r.value} onClick={() => { setType(r.value); if (!title) setTitle(r.label) }}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border-2 transition-all ${
                      type === r.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'
                    }`}>{r.emoji} {r.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Details (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Any additional context…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {(type === 'session_booking') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Preferred Date</label>
                  <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Preferred Time</label>
                  <input type="time" value={preferredTime} onChange={e => setPreferredTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Urgency</p>
              <div className="flex gap-2">
                {URGENCY_LEVELS.map(u => (
                  <button key={u.value} onClick={() => setUrgency(u.value)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                      urgency === u.value ? `border-current ${u.color}` : 'border-gray-100 text-gray-400'
                    }`}>{u.label}</button>
                ))}
              </div>
            </div>

            <button onClick={handleSubmit} disabled={saving || !title.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
              {saving ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        )}

        {/* Previous requests */}
        {requests.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Previous Requests</h2>
            <div className="space-y-2">
              {requests.map((r: any) => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[r.status] ?? 'bg-gray-100'}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  {r.practitioner_response && (
                    <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                      <p className="text-xs text-blue-700"><strong>Response:</strong> {r.practitioner_response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-20" />
      </div>
    </div>
  )
}
