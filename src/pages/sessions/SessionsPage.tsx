// SessionsPage.tsx — with audio file import + AI transcription + analysis
import React, { useState, useRef } from 'react'
import { Plus, Calendar, Upload, ChevronDown, ChevronUp, FileAudio, Loader2, CheckCircle, AlertCircle, Sparkles, Trash2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Avatar, Modal, Input, Select, Textarea, Spinner, EmptyState } from '@/components/ui'
import { useSessions, useCreateSession, useUpdateSession } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { riskColor, fmtDate, fmtTime } from '@/lib/utils'
import type { Session } from '@/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { transcribeAudio, callGroq } from '@/lib/groq'

const SESSION_TYPES = ['individual', 'group', 'crisis', 'assessment', 'follow_up'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const SESSION_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'].map(v => ({ value: v, label: v }))

const AUDIO_LANGUAGES = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'or', label: 'Odia' },
]

const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.ogg,.webm,.flac,.mp4,.mpeg,.mpga'

function statusBadge(status: string) {
  const m: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-gray-100 text-gray-500',
    no_show: 'bg-red-100 text-red-700',
  }
  return m[status] ?? 'bg-gray-100 text-gray-600'
}

// ── Audio Import Panel ──────────────────────────────────────────────────────────

function AudioImportPanel({ athleteName, onTranscriptReady }: {
  athleteName?: string
  onTranscriptReady: (transcript: string, analysis: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('')
  const [step, setStep] = useState<'idle' | 'transcribing' | 'analysing' | 'done' | 'error'>('idle')
  const [transcript, setTranscript] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 25 * 1024 * 1024) { setError('File must be under 25 MB'); return }
    setFile(f); setError(''); setTranscript(''); setAnalysis(''); setStep('idle')
  }

  function clearFile() {
    setFile(null); setTranscript(''); setAnalysis(''); setStep('idle'); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleTranscribe() {
    if (!file) return
    setError(''); setStep('transcribing')
    setProgress('Uploading and transcribing audio…')
    try {
      const text = await transcribeAudio({
        file,
        language: language || undefined,
        prompt: athleteName
          ? `Sport psychology session with athlete ${athleteName}. Discussion covers mental performance, training, competition, and psychological wellbeing.`
          : `Sport psychology session discussing mental performance, training, competition, and psychological wellbeing.`,
      })
      if (!text.trim()) throw new Error('Transcription returned empty. Audio may be too quiet or unsupported format.')
      setTranscript(text); setStep('analysing'); setProgress('Generating AI session analysis…')

      const aiResult = await callGroq({
        system: `You are a senior sport psychologist analysing a session transcript. Write a structured clinical summary. Be concise, use bullet points. Include only sections with evidence from the transcript.`,
        messages: [{ role: 'user', content: `Analyse this sport psychology session transcript:\n\n## Session Summary\nBrief overview.\n\n## Key Themes\nBullet-point list.\n\n## Clinical Observations\nNotable psychological patterns, concerns, or strengths.\n\n## Risk Indicators\nSigns of distress, anxiety, burnout. State "None identified" if none.\n\n## Recommendations\nSuggested follow-up actions.\n\n---\nTRANSCRIPT:\n${text.slice(0, 8000)}` }],
        max_tokens: 1500,
      })
      setAnalysis(aiResult); setStep('done'); setProgress('')
      onTranscriptReady(text, aiResult)
    } catch (err: any) {
      setError(err.message ?? 'Transcription failed'); setStep('error'); setProgress('')
    }
  }

  return (
    <div className="space-y-3">
      <div onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${file ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}>
        <input ref={fileRef} type="file" accept={ACCEPTED_AUDIO} onChange={handleFilePick} className="hidden" />
        {file ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><FileAudio size={20} className="text-blue-600" /></div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900 truncate max-w-xs">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); clearFile() }} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
          </div>
        ) : (
          <div className="py-2">
            <Upload size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">Click to upload audio file</p>
            <p className="text-xs text-gray-400 mt-1">MP3, WAV, M4A, OGG, FLAC · Max 25 MB</p>
          </div>
        )}
      </div>

      {file && step === 'idle' && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Audio language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              {AUDIO_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <button onClick={handleTranscribe} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0">
            <Sparkles size={15} /> Transcribe & Analyse
          </button>
        </div>
      )}

      {(step === 'transcribing' || step === 'analysing') && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
          <Loader2 size={18} className="text-blue-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">{progress}</p>
            <p className="text-xs text-blue-500 mt-0.5">{step === 'transcribing' ? 'Using Groq Whisper AI — may take 10–30s' : 'Generating clinical summary…'}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => { setStep('idle'); setError('') }} className="text-xs text-red-500 underline mt-1">Try again</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
            <CheckCircle size={16} className="text-green-500 shrink-0" />
            <p className="text-sm text-green-700 font-medium">Transcript and analysis added to session notes</p>
          </div>
          <details className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-2.5 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100">View Transcript ({transcript.split(/\s+/).length} words)</summary>
            <div className="px-4 py-3 border-t text-sm text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap">{transcript}</div>
          </details>
          <details className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-2.5 text-sm font-medium text-purple-700 cursor-pointer hover:bg-purple-100">View AI Analysis</summary>
            <div className="px-4 py-3 border-t text-sm text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap">{analysis}</div>
          </details>
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const { t } = useLanguage()
  const { data: sessions = [], isLoading } = useSessions()
  const { data: athletes = [] } = useAthletes()
  const createSession = useCreateSession()
  const updateSession = useUpdateSession()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Session | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showAudioPanel, setShowAudioPanel] = useState(false)
  const [form, setForm] = useState({
    athlete_id: '', session_type: 'individual', status: 'scheduled',
    scheduled_at: new Date().toISOString().slice(0, 16),
    duration_minutes: 50, location: '', notes: '', risk_assessment: 'low',
    follow_up_required: false, goals: '', homework: '',
  })

  const selectedAthlete = athletes.find(a => a.id === form.athlete_id)

  function openCreate() {
    setEditing(null)
    setForm({ athlete_id: '', session_type: 'individual', status: 'scheduled', scheduled_at: new Date().toISOString().slice(0, 16), duration_minutes: 50, location: '', notes: '', risk_assessment: 'low', follow_up_required: false, goals: '', homework: '' })
    setShowAudioPanel(false); setModalOpen(true)
  }

  function openEdit(s: Session) {
    setEditing(s)
    setForm({ athlete_id: s.athlete_id, session_type: s.session_type, status: s.status, scheduled_at: s.scheduled_at.slice(0, 16), duration_minutes: s.duration_minutes, location: s.location ?? '', notes: s.notes ?? '', risk_assessment: s.risk_assessment ?? 'low', follow_up_required: s.follow_up_required, goals: s.goals ?? '', homework: (s as any).homework ?? '' })
    setShowAudioPanel(false); setModalOpen(true)
  }

  function set(k: string) { return (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value })) }

  function handleTranscriptReady(transcript: string, analysis: string) {
    setForm(f => ({ ...f, notes: [f.notes, '\n\n━━━ AI Session Transcript ━━━', transcript, '\n\n━━━ AI Session Analysis ━━━', analysis].filter(Boolean).join('\n') }))
  }

  async function handleSave() {
    setSaving(true); setSaveError('')
    try {
      const payload = { ...form, scheduled_at: new Date(form.scheduled_at).toISOString() } as any
      if (editing) await updateSession.mutateAsync({ id: editing.id, ...payload })
      else await createSession.mutateAsync(payload)
      setModalOpen(false); setShowAudioPanel(false)
    } catch (err: any) { setSaveError('Save failed: ' + (err?.message ?? 'unknown error')) }
    finally { setSaving(false) }
  }

  const athleteOptions = [{ value: '', label: '— Select athlete —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]

  return (
    <AppShell>
      <PageHeader title={t.ses_title} subtitle={`${sessions.length} ${t.total.toLowerCase()}`}
        action={<Button onClick={openCreate}><Plus size={16} /> {t.ses_newSession}</Button>} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={<Calendar size={48} />} title={t.ses_noSessions} action={<Button onClick={openCreate}><Plus size={16} />{t.ses_newSession}</Button>} />
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <Card key={s.id} onClick={() => openEdit(s)} className="p-4">
              <div className="flex items-center gap-4">
                {s.athlete && <Avatar firstName={s.athlete.first_name} lastName={s.athlete.last_name} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{s.athlete ? `${s.athlete.first_name} ${s.athlete.last_name}` : 'Unknown athlete'}</p>
                  <p className="text-xs text-gray-400">{fmtDate(s.scheduled_at)} at {fmtTime(s.scheduled_at)} · {s.duration_minutes}min · {s.session_type.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.risk_assessment && <Badge label={s.risk_assessment} className={riskColor(s.risk_assessment)} />}
                  <Badge label={s.status.replace('_', ' ')} className={statusBadge(s.status)} />
                  {(s.notes ?? '').includes('AI Session Transcript') && (
                    <span title="Has AI transcript" className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Sparkles size={10} /> AI</span>
                  )}
                </div>
              </div>
              {s.notes && !s.notes.includes('AI Session Transcript') && (<p className="text-xs text-gray-400 mt-2 ml-10 line-clamp-1">{s.notes}</p>)}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setShowAudioPanel(false) }} title={editing ? 'Edit Session' : t.ses_newSession} maxWidth="max-w-2xl">
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

          {/* Audio import panel */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowAudioPanel(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700">
              <span className="flex items-center gap-2">
                <Upload size={15} className="text-blue-500" />
                Import Audio & AI Transcription
                {form.notes.includes('AI Session Transcript') && (<span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Transcript ready</span>)}
              </span>
              {showAudioPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showAudioPanel && (
              <div className="p-4 border-t border-gray-100">
                <AudioImportPanel athleteName={selectedAthlete ? `${selectedAthlete.first_name} ${selectedAthlete.last_name}` : undefined} onTranscriptReady={handleTranscriptReady} />
              </div>
            )}
          </div>

          <Textarea label="Session Notes" value={form.notes} onChange={set('notes') as any} rows={4} placeholder="Clinical notes… AI transcript and analysis will appear here when imported." />
          <Input label="Homework / Between-session tasks" value={form.homework} onChange={set('homework')} placeholder="Tasks for athlete between sessions…" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="fu" checked={form.follow_up_required} onChange={e => setForm(f => ({ ...f, follow_up_required: e.target.checked }))} className="w-4 h-4 rounded" />
            <label htmlFor="fu" className="text-sm text-gray-700">Follow-up required</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); setShowAudioPanel(false); setSaveError('') }}>{t.cancel}</Button>
            <div className="flex items-center gap-3">
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id}>{t.save} Session</Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
