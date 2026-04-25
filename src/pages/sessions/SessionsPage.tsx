// SessionsPage.tsx — with voice recording + transcript integration
import React, { useState } from 'react'
import { Plus, Calendar, Mic, ChevronDown, ChevronUp } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Avatar, Modal, Input, Select, Textarea, Spinner, EmptyState } from '@/components/ui'
import { useSessions, useCreateSession, useUpdateSession } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { riskColor, fmtDate, fmtTime } from '@/lib/utils'
import type { Session } from '@/types'
import SessionRecorderPanel from '@/components/SessionRecorderPanel'
import SessionRequestsPanel from '@/components/practitioner/SessionRequestsPanel'
import { usePendingRequestCount } from '@/hooks/useSessionRequests'
import { useLanguage } from '@/contexts/LanguageContext'

const SESSION_TYPES = ['individual', 'group', 'crisis', 'assessment', 'follow_up'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const SESSION_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'].map(v => ({ value: v, label: v }))

function statusBadge(status: string) {
  const m: Record<string, string> = {
    scheduled:  'bg-blue-100 text-blue-700',
    completed:  'bg-emerald-100 text-emerald-700',
    cancelled:  'bg-gray-100 text-gray-500',
    no_show:    'bg-red-100 text-red-700',
  }
  return m[status] ?? 'bg-gray-100 text-gray-600'
}

// No API key needed — uses browser Web Speech API

export default function SessionsPage() {
  const { t } = useLanguage()
  const { data: sessions = [], isLoading } = useSessions()
  const { data: athletes = [] } = useAthletes()
  const createSession = useCreateSession()
  const updateSession = useUpdateSession()

  const [modalOpen, setModalOpen] = useState(false)
  const [pageTab, setPageTab] = useState<'sessions' | 'requests'>('sessions')
  const { data: pendingCount = 0 } = usePendingRequestCount()
  const [editing, setEditing] = useState<Session | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showRecorder, setShowRecorder] = useState(false)
  const [recorderExpanded, setRecorderExpanded] = useState(true)
  const [form, setForm] = useState({
    athlete_id: '', session_type: 'individual', status: 'scheduled',
    scheduled_at: new Date().toISOString().slice(0, 16),
    duration_minutes: 50, location: '', notes: '', risk_assessment: 'low',
    follow_up_required: false, goals: '', homework: '',
  })

  const selectedAthlete = athletes.find(a => a.id === form.athlete_id)

  function openCreate() {
    setEditing(null)
    setSaveError('')
    setForm({
      athlete_id: '', session_type: 'individual', status: 'scheduled',
      scheduled_at: new Date().toISOString().slice(0, 16),
      duration_minutes: 50, location: '', notes: '', risk_assessment: 'low',
      follow_up_required: false, goals: '', homework: '',
    })
    setModalOpen(true)
  }

  function openEdit(s: Session) {
    setEditing(s)
    setSaveError('')
    setForm({
      athlete_id: s.athlete_id, session_type: s.session_type, status: s.status,
      scheduled_at: s.scheduled_at.slice(0, 16), duration_minutes: s.duration_minutes,
      location: s.location ?? '', notes: s.notes ?? '', risk_assessment: s.risk_assessment ?? 'low',
      follow_up_required: s.follow_up_required, goals: s.goals ?? '', homework: (s as any).homework ?? '',
    })
    setModalOpen(true)
  }

  function set(k: string) {
    return (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function handleTranscriptUpdate(transcript: string) {
    setForm(f => ({
      ...f,
      notes: f.notes
        ? `${f.notes}\n\n--- Session Recording Transcript ---\n${transcript}`
        : `--- Session Recording Transcript ---\n${transcript}`,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const payload = { ...form, scheduled_at: new Date(form.scheduled_at).toISOString() } as any
      if (editing) await updateSession.mutateAsync({ id: editing.id, ...payload })
      else await createSession.mutateAsync(payload)
      setModalOpen(false)
      setShowRecorder(false)
    } catch (error: any) {
      setSaveError(error?.message ?? 'Failed to save session.')
    } finally {
      setSaving(false)
    }
  }

  const athleteOptions = [
    { value: '', label: '— Select athlete —' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  return (
    <AppShell>
      <PageHeader
        title={t.ses_title}
        subtitle={`${sessions.length} ${t.total.toLowerCase()}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setShowRecorder(v => !v); setRecorderExpanded(true) }}>
              <Mic size={16} />
              {t.ses_record}
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} />
              {t.ses_newSession}
            </Button>
          </div>
        }
      />

      {/* ── Tab switcher ─────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        <button onClick={() => setPageTab('sessions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
            pageTab === 'sessions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Calendar size={14} /> Sessions
        </button>
        <button onClick={() => setPageTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 relative ${
            pageTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          📬 Requests
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Requests tab ─────────────────────────────────────────────── */}
      {pageTab === 'requests' && <SessionRequestsPanel />}

      {/* ── Sessions tab ─────────────────────────────────────────────── */}
      {pageTab === 'sessions' && <>

      {/* Floating recorder panel */}
      {showRecorder && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setRecorderExpanded(v => !v)}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"
            >
              <Mic size={14} className="text-red-500" />
              Session Recorder
              {recorderExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              onClick={() => setShowRecorder(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Hide
            </button>
          </div>
          {recorderExpanded && (
            <SessionRecorderPanel
              athleteName={form.athlete_id ? selectedAthlete?.first_name + ' ' + (selectedAthlete?.last_name ?? '') : undefined}
              onTranscriptUpdate={handleTranscriptUpdate}
            />
          )}

        </div>
      )}

      {/* Session list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Calendar size={48} />}
          title={t.ses_noSessions}
          action={<Button onClick={openCreate}><Plus size={16} />{t.ses_newSession}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <Card key={s.id} onClick={() => openEdit(s)} className="p-4">
              <div className="flex items-center gap-4">
                {s.athlete && <Avatar firstName={s.athlete.first_name} lastName={s.athlete.last_name} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {s.athlete ? `${s.athlete.first_name} ${s.athlete.last_name}` : 'Unknown athlete'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(s.scheduled_at)} at {fmtTime(s.scheduled_at)} · {s.duration_minutes}min · {s.session_type.replace('_', ' ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.risk_assessment && <Badge label={s.risk_assessment} className={riskColor(s.risk_assessment)} />}
                  <Badge label={s.status.replace('_', ' ')} className={statusBadge(s.status)} />
                  {(s.notes ?? '').includes('Session Recording Transcript') && (
                    <span title="Has transcript" className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Mic size={10} /> 🎙
                    </span>
                  )}
                </div>
              </div>
              {s.notes && !s.notes.includes('Session Recording Transcript') && (
                <p className="text-xs text-gray-400 mt-2 ml-10 line-clamp-1">{s.notes}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Session form modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setShowRecorder(false) }}
        title={editing ? 'Edit Session' : t.ses_newSession}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <Select label="Athlete" value={form.athlete_id} onChange={set('athlete_id') as any} options={athleteOptions} />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.session_type} onChange={set('session_type') as any} options={SESSION_TYPES} />
            <Select label="Status" value={form.status} onChange={set('status') as any} options={SESSION_STATUSES} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date & Time" type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
            <Input label="Duration (min)" type="number" value={String(form.duration_minutes)} onChange={set('duration_minutes')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Location" value={form.location} onChange={set('location')} />
            <Select label="Risk Assessment" value={form.risk_assessment} onChange={set('risk_assessment') as any} options={RISK_LEVELS} />
          </div>

          <Input label="Session Goals" value={form.goals} onChange={set('goals')} placeholder="Goals for this session…" />

          {/* Inline recorder inside modal */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRecorder(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            >
              <span className="flex items-center gap-2">
                <Mic size={15} className="text-red-500" />
                {t.ses_record}
                {form.notes.includes('Session Recording Transcript') && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Transcript ready</span>
                )}
              </span>
              {showRecorder ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showRecorder && (
              <div className="p-3">
                <SessionRecorderPanel
                  athleteName={selectedAthlete ? `${selectedAthlete.first_name} ${selectedAthlete.last_name}` : undefined}
                  onTranscriptUpdate={handleTranscriptUpdate}
                />
              </div>
            )}
          </div>

          <Textarea
            label="Session Notes"
            value={form.notes}
            onChange={set('notes') as any}
            rows={4}
            placeholder="Clinical notes, observations, transcript will appear here…"
          />

          <Input label="Homework / Between-session tasks" value={form.homework} onChange={set('homework')} placeholder="Tasks for athlete between sessions…" />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fu"
              checked={form.follow_up_required}
              onChange={e => setForm(f => ({ ...f, follow_up_required: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="fu" className="text-sm text-gray-700">Follow-up required</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); setShowRecorder(false) }}>{t.cancel}</Button>
            {saveError ? <p className="text-xs text-red-600 flex-1 flex items-center">{saveError}</p> : null}
            <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id}>{t.save} Session</Button>
          </div>
        </div>
      </Modal>
    </>}
    </AppShell>
  )
}
