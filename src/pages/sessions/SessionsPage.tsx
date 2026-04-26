import React, { useState } from 'react'
import { Calendar, ChevronDown, ChevronUp, Mic, Plus } from 'lucide-react'

import SessionRecorderPanel from '@/components/SessionRecorderPanel'
import AppShell from '@/components/layout/AppShell'
import SessionRequestsPanel from '@/components/practitioner/SessionRequestsPanel'
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAthletes } from '@/hooks/useAthletes'
import { useCreateSession, useSessions, useUpdateSession } from '@/hooks/useData'
import { usePendingRequestCount } from '@/hooks/useSessionRequests'
import { fmtDate, fmtTime, riskColor } from '@/lib/utils'
import type { RiskLevel, Session, SessionStatus, SessionType } from '@/types'

const SESSION_TYPES = ['individual', 'group', 'crisis', 'assessment', 'follow_up'].map(value => ({
  value,
  label: value.replace('_', ' '),
}))

const SESSION_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'].map(value => ({
  value,
  label: value.replace('_', ' '),
}))

const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'].map(value => ({
  value,
  label: value,
}))

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-gray-100 text-gray-500',
    no_show: 'bg-red-100 text-red-700',
  }

  return classes[status] ?? 'bg-gray-100 text-gray-600'
}

export default function SessionsPage() {
  const { t } = useLanguage()
  const { data: sessions = [], isLoading } = useSessions()
  const { data: athletes = [] } = useAthletes()
  const createSession = useCreateSession()
  const updateSession = useUpdateSession()
  const { data: pendingCount = 0 } = usePendingRequestCount()

  const [modalOpen, setModalOpen] = useState(false)
  const [pageTab, setPageTab] = useState<'sessions' | 'requests'>('sessions')
  const [editing, setEditing] = useState<Session | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showRecorder, setShowRecorder] = useState(false)
  const [form, setForm] = useState({
    athlete_id: '',
    session_type: 'individual',
    status: 'scheduled',
    scheduled_at: new Date().toISOString().slice(0, 16),
    duration_minutes: 50,
    location: '',
    notes: '',
    risk_assessment: 'low',
    follow_up_required: false,
    goals: '',
    homework: '',
  })

  const selectedAthlete = athletes.find(athlete => athlete.id === form.athlete_id)

  function resetForm() {
    setSaveError('')
    setShowRecorder(false)
    setForm({
      athlete_id: '',
      session_type: 'individual',
      status: 'scheduled',
      scheduled_at: new Date().toISOString().slice(0, 16),
      duration_minutes: 50,
      location: '',
      notes: '',
      risk_assessment: 'low',
      follow_up_required: false,
      goals: '',
      homework: '',
    })
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setModalOpen(true)
  }

  function openEdit(session: Session) {
    setEditing(session)
    setSaveError('')
    setShowRecorder(false)
    setForm({
      athlete_id: session.athlete_id,
      session_type: session.session_type,
      status: session.status,
      scheduled_at: session.scheduled_at.slice(0, 16),
      duration_minutes: session.duration_minutes,
      location: session.location ?? '',
      notes: session.notes ?? '',
      risk_assessment: session.risk_assessment ?? 'low',
      follow_up_required: session.follow_up_required,
      goals: session.goals ?? '',
      homework: (session as Session & { homework?: string }).homework ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: string) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }))
  }

  function handleTranscriptUpdate(transcript: string) {
    setForm(current => ({
      ...current,
      notes: current.notes
        ? `${current.notes}\n\n--- Session Recording Transcript ---\n${transcript}`
        : `--- Session Recording Transcript ---\n${transcript}`,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')

    try {
      const payload = {
        ...form,
        session_type: form.session_type as SessionType,
        status: form.status as SessionStatus,
        risk_assessment: form.risk_assessment as RiskLevel,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      }

      if (editing) {
        await updateSession.mutateAsync({ id: editing.id, ...payload })
      } else {
        await createSession.mutateAsync(payload)
      }

      setModalOpen(false)
      setShowRecorder(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save session.'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  const athleteOptions = [
    { value: '', label: '- Select athlete -' },
    ...athletes.map(athlete => ({
      value: athlete.id,
      label: `${athlete.first_name} ${athlete.last_name}`,
    })),
  ]

  return (
    <AppShell>
      <PageHeader
        title={t.ses_title}
        subtitle={`${sessions.length} ${t.total.toLowerCase()}`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            {t.ses_newSession}
          </Button>
        }
      />

      <div className="mb-5 flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => setPageTab('sessions')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            pageTab === 'sessions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={14} />
          Sessions
        </button>
        <button
          onClick={() => setPageTab('requests')}
          className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            pageTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Requests
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      {pageTab === 'requests' && <SessionRequestsPanel />}

      {pageTab === 'sessions' && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<Calendar size={48} />}
              title={t.ses_noSessions}
              action={
                <Button onClick={openCreate}>
                  <Plus size={16} />
                  {t.ses_newSession}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <Card key={session.id} onClick={() => openEdit(session)} className="p-4">
                  <div className="flex items-center gap-4">
                    {session.athlete && (
                      <Avatar firstName={session.athlete.first_name} lastName={session.athlete.last_name} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">
                        {session.athlete
                          ? `${session.athlete.first_name} ${session.athlete.last_name}`
                          : 'Unknown athlete'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {fmtDate(session.scheduled_at)} at {fmtTime(session.scheduled_at)} - {session.duration_minutes}min -
                        {' '}
                        {session.session_type.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {session.risk_assessment && (
                        <Badge label={session.risk_assessment} className={riskColor(session.risk_assessment)} />
                      )}
                      <Badge label={session.status.replace('_', ' ')} className={statusBadge(session.status)} />
                      {(session.notes ?? '').includes('Session Recording Transcript') && (
                        <span
                          title="Has transcript"
                          className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600"
                        >
                          <Mic size={10} />
                          Audio
                        </span>
                      )}
                    </div>
                  </div>
                  {session.notes && !session.notes.includes('Session Recording Transcript') && (
                    <p className="mt-2 ml-10 line-clamp-1 text-xs text-gray-400">{session.notes}</p>
                  )}
                </Card>
              ))}
            </div>
          )}

          <Modal
            open={modalOpen}
            onClose={() => {
              setModalOpen(false)
              setShowRecorder(false)
            }}
            title={editing ? 'Edit Session' : t.ses_newSession}
            maxWidth="max-w-2xl"
          >
            <div className="space-y-4">
              <Select label="Athlete" value={form.athlete_id} onChange={setField('athlete_id') as never} options={athleteOptions} />

              <div className="grid grid-cols-2 gap-3">
                <Select label="Type" value={form.session_type} onChange={setField('session_type') as never} options={SESSION_TYPES} />
                <Select label="Status" value={form.status} onChange={setField('status') as never} options={SESSION_STATUSES} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Date & Time" type="datetime-local" value={form.scheduled_at} onChange={setField('scheduled_at')} />
                <Input label="Duration (min)" type="number" value={String(form.duration_minutes)} onChange={setField('duration_minutes')} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Location" value={form.location} onChange={setField('location')} />
                <Select
                  label="Risk Assessment"
                  value={form.risk_assessment}
                  onChange={setField('risk_assessment') as never}
                  options={RISK_LEVELS}
                />
              </div>

              <Input label="Session Goals" value={form.goals} onChange={setField('goals')} placeholder="Goals for this session..." />

              <div className="overflow-hidden rounded-xl border border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowRecorder(current => !current)}
                  className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  <span className="flex items-center gap-2">
                    <Mic size={15} className="text-red-500" />
                    {t.ses_record}
                    {form.notes.includes('Session Recording Transcript') && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Transcript ready</span>
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
                onChange={setField('notes') as never}
                rows={4}
                placeholder="Clinical notes, observations, transcript will appear here..."
              />

              <Input
                label="Homework / Between-session tasks"
                value={form.homework}
                onChange={setField('homework')}
                placeholder="Tasks for athlete between sessions..."
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="follow-up-required"
                  checked={form.follow_up_required}
                  onChange={event => setForm(current => ({ ...current, follow_up_required: event.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="follow-up-required" className="text-sm text-gray-700">
                  Follow-up required
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setModalOpen(false)
                    setShowRecorder(false)
                  }}
                >
                  {t.cancel}
                </Button>
                {saveError ? <p className="flex flex-1 items-center text-xs text-red-600">{saveError}</p> : null}
                <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id}>
                  {t.save} Session
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </AppShell>
  )
}
