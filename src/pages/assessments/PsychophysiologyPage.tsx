import { useState, useRef, useCallback } from 'react'
import { Plus, Activity, Save, Trash2, Upload, Watch, Heart, FileDown, CheckCircle, AlertCircle, X } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Select, Input, Spinner, EmptyState } from '@/components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, Legend, CartesianGrid, BarChart, Bar } from 'recharts'

// ── Muscle groups for EMG ─────────────────────────────────────
const MUSCLE_GROUPS = [
  'Trapezius (L)', 'Trapezius (R)', 'Deltoid (L)', 'Deltoid (R)',
  'Biceps Brachii (L)', 'Biceps Brachii (R)', 'Triceps (L)', 'Triceps (R)',
  'Rectus Abdominis', 'Obliques', 'Erector Spinae (L)', 'Erector Spinae (R)',
  'Gluteus Maximus (L)', 'Gluteus Maximus (R)', 'Quadriceps (L)', 'Quadriceps (R)',
  'Hamstrings (L)', 'Hamstrings (R)', 'Gastrocnemius (L)', 'Gastrocnemius (R)',
  'Tibialis Anterior (L)', 'Tibialis Anterior (R)',
]

// ── Brainwave bands ───────────────────────────────────────────
const BRAINWAVE_BANDS = [
  { key: 'delta', label: 'Delta', range: '0.5–4 Hz', note: 'Deep sleep, recovery' },
  { key: 'theta', label: 'Theta', range: '4–8 Hz', note: 'Relaxed focus, creativity' },
  { key: 'alpha', label: 'Alpha', range: '8–13 Hz', note: 'Calm alertness, flow states' },
  { key: 'beta', label: 'Beta', range: '13–30 Hz', note: 'Active thinking, stress' },
  { key: 'gamma', label: 'Gamma', range: '30–100 Hz', note: 'High processing, focus' },
]


// ── Wearable CSV Import ───────────────────────────────────────────────────────

type WearableSource = 'whoop' | 'garmin' | 'heartmath'

interface ParsedWearableSession {
  date: string
  source: WearableSource
  metrics: Record<string, number | string>
  raw_row: Record<string, string>
}

// WHOOP CSV columns we care about (v4.0 export format)
const WHOOP_FIELD_MAP: Record<string, string> = {
  'Date': 'date',
  'Recovery score %': 'recovery_score',
  'Resting heart rate (bpm)': 'rhr',
  'Heart rate variability (ms)': 'hrv_rmssd',
  'Skin temp (celsius)': 'skin_temp_c',
  'Blood oxygen %': 'spo2',
  'Day Strain': 'strain',
  'Average heart rate (bpm)': 'avg_hr',
  'Max heart rate (bpm)': 'max_hr',
  'Sleep performance %': 'sleep_performance',
  'Sleep duration (hours)': 'sleep_hours',
  'Respiratory rate (rpm)': 'breathing_rate',
}

// Garmin Daily Summary CSV
const GARMIN_FIELD_MAP: Record<string, string> = {
  'Date': 'date',
  'Avg Resting HR': 'rhr',
  'Min HR': 'min_hr',
  'Max HR': 'max_hr',
  'HRV (RMSSD)': 'hrv_rmssd',
  'Avg Stress Level': 'avg_stress',
  'Max Stress Level': 'max_stress',
  'Respiration Rate': 'breathing_rate',
  'Pulse Ox': 'spo2',
  'Body Battery': 'body_battery',
  'Stress Qualifier': 'stress_qualifier',
}

// HeartMath emWave / Inner Balance CSV
const HEARTMATH_FIELD_MAP: Record<string, string> = {
  'Date': 'date',
  'Session Length': 'session_minutes',
  'Achievement Score': 'achievement_score',
  'Average Coherence': 'avg_coherence',
  'High': 'high_coherence_pct',
  'Medium': 'medium_coherence_pct',
  'Low': 'low_coherence_pct',
  'Power': 'power_score',
  'Challenge Level': 'challenge_level',
  'Time in Coherence Zone (%)': 'coherence_zone_pct',
}

function detectSource(headers: string[]): WearableSource | null {
  const h = headers.join(',').toLowerCase()
  if (h.includes('recovery score') || h.includes('day strain') || h.includes('whoop')) return 'whoop'
  if (h.includes('body battery') || h.includes('garmin') || h.includes('stress qualifier')) return 'garmin'
  if (h.includes('coherence') || h.includes('heartmath') || h.includes('achievement score')) return 'heartmath'
  return null
}

function getFieldMap(source: WearableSource): Record<string, string> {
  if (source === 'whoop') return WHOOP_FIELD_MAP
  if (source === 'garmin') return GARMIN_FIELD_MAP
  return HEARTMATH_FIELD_MAP
}

function parseWearableCSV(csvText: string, source: WearableSource): ParsedWearableSession[] {
  const lines = csvText.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Find header row (may have preamble rows in WHOOP export)
  let headerIdx = 0
  const fieldMap = getFieldMap(source)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim())
    const matchCount = cols.filter(c => Object.keys(fieldMap).some(k => c.toLowerCase().includes(k.toLowerCase().slice(0, 6)))).length
    if (matchCount >= 2) { headerIdx = i; break }
  }

  const headers = lines[headerIdx].split(',').map(c => c.replace(/"/g, '').trim())
  const sessions: ParsedWearableSession[] = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(c => c.replace(/"/g, '').trim())
    if (vals.every(v => !v)) continue

    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => { raw[h] = vals[idx] ?? '' })

    const metrics: Record<string, number | string> = {}
    Object.entries(fieldMap).forEach(([csvCol, metricKey]) => {
      const val = raw[csvCol]
      if (val !== undefined && val !== '' && val !== '--') {
        const num = parseFloat(val.replace('%', ''))
        metrics[metricKey] = isNaN(num) ? val : num
      }
    })

    const dateVal = raw['Date'] || raw['date'] || vals[0]
    if (!dateVal) continue

    sessions.push({ date: dateVal, source, metrics, raw_row: raw })
  }

  return sessions.reverse() // chronological order
}

// ── Blank form ────────────────────────────────────────────────
function blankForm() {
  return {
    athlete_id: '',
    session_context: 'resting',
    // HRV
    hrv_rmssd: '', hrv_sdnn: '', hrv_lf_hf_ratio: '', hrv_pnn50: '',
    // Basic
    rhr: '', pulse_rate: '', spo2: '', breathing_rate: '',
    systolic_bp: '', diastolic_bp: '',
    // EMG
    emg_entries: [{ muscle: 'Trapezius (L)', mvc_percentage: '', amplitude_uv: '', notes: '' }],
    // Brainwave
    eeg_device: '', eeg_protocol: '',
    delta: '', theta: '', alpha: '', beta: '', gamma: '',
    // Galvanic
    gsr_baseline: '', gsr_peak: '', skin_temp_c: '',
    // Notes
    device_used: '', measurement_notes: '',
  }
}

function usePhysioData(athleteId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['physio', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('psychophysiology')
        .select('*, athlete:athletes(first_name,last_name)')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) return []
      return data ?? []
    },
  })
}

function useSavePhysio() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase
        .from('psychophysiology')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['physio'] }),
  })
}

export default function PsychophysiologyPage() {
  const { data: athletes = [] } = useAthletes()
  const [filterAthleteId, setFilterAthleteId] = useState('')
  const { data: records = [], isLoading } = usePhysioData(filterAthleteId)
  const save = useSavePhysio()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(blankForm())
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'hrv' | 'emg' | 'eeg' | 'other'>('hrv')
  const [pageTab, setPageTab] = useState<'manual' | 'wearables'>('manual')

  // Wearables state
  const [wearableSessions, setWearableSessions] = useState<ParsedWearableSession[]>([])
  const [wearableSource, setWearableSource] = useState<WearableSource | null>(null)
  const [wearableAthlete, setWearableAthlete] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [savingWearable, setSavingWearable] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleWearableFile = useCallback(async (file: File) => {
    setImportError(null)
    setImportSuccess(null)
    setImporting(true)
    setWearableSessions([])
    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      const headers = lines.slice(0, 5).join(',')
      const detected = detectSource(headers.split(','))
      if (!detected) {
        setImportError('Could not detect wearable format. Supported: WHOOP, Garmin Daily Summary, HeartMath emWave/Inner Balance CSV.')
        return
      }
      setWearableSource(detected)
      const parsed = parseWearableCSV(text, detected)
      if (!parsed.length) {
        setImportError('No data rows found in file. Please check the CSV format.')
        return
      }
      setWearableSessions(parsed)
      setImportSuccess(`Detected ${detected.toUpperCase()} · ${parsed.length} sessions parsed`)
    } catch (e: any) {
      setImportError('Failed to read file: ' + e.message)
    } finally {
      setImporting(false)
    }
  }, [])

  async function saveWearableData() {
    if (!wearableAthlete || !wearableSessions.length || !wearableSource) return
    setSavingWearable(true)
    try {
      const payload = wearableSessions.map(s => {
        const m = s.metrics
        return {
          athlete_id: wearableAthlete,
          record_type: 'wearable',
          session_context: 'wearable_import',
          hrv: {
            rmssd: typeof m.hrv_rmssd === 'number' ? m.hrv_rmssd : null,
          },
          vitals: {
            rhr: typeof m.rhr === 'number' ? m.rhr : null,
            spo2: typeof m.spo2 === 'number' ? m.spo2 : null,
            breathing_rate: typeof m.breathing_rate === 'number' ? m.breathing_rate : null,
          },
          gsr: {
            skin_temp_c: typeof m.skin_temp_c === 'number' ? m.skin_temp_c : null,
          },
          wearable_data: { source: wearableSource, ...m },
          device_used: wearableSource === 'whoop' ? 'WHOOP 4.0' : wearableSource === 'garmin' ? 'Garmin Device' : 'HeartMath emWave',
          notes: `Imported from ${wearableSource} CSV · ${s.date}`,
          created_at: (() => {
            try { return new Date(s.date).toISOString() } catch { return new Date().toISOString() }
          })(),
        }
      })

      for (const row of payload) {
        await save.mutateAsync(row)
      }
      setImportSuccess(`✓ Saved ${payload.length} sessions to athlete profile`)
      setWearableSessions([])
    } catch (e: any) {
      setImportError('Save failed: ' + e.message)
    } finally {
      setSavingWearable(false)
    }
  }

  function f(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  function addEmgEntry() {
    setForm(prev => ({
      ...prev,
      emg_entries: [...prev.emg_entries, { muscle: MUSCLE_GROUPS[0], mvc_percentage: '', amplitude_uv: '', notes: '' }],
    }))
  }

  function updateEmg(idx: number, key: string, val: string) {
    setForm(prev => {
      const entries = [...prev.emg_entries]
      entries[idx] = { ...entries[idx], [key]: val }
      return { ...prev, emg_entries: entries }
    })
  }

  function removeEmg(idx: number) {
    setForm(prev => ({ ...prev, emg_entries: prev.emg_entries.filter((_, i) => i !== idx) }))
  }

  async function handleSave() {
    if (!form.athlete_id) return
    setSaving(true)
    try {
      const payload = {
        athlete_id: form.athlete_id,
        record_type: 'manual',
        session_context: form.session_context,
        hrv: {
          rmssd: parseFloat(form.hrv_rmssd) || null,
          sdnn: parseFloat(form.hrv_sdnn) || null,
          lf_hf_ratio: parseFloat(form.hrv_lf_hf_ratio) || null,
          pnn50: parseFloat(form.hrv_pnn50) || null,
        },
        vitals: {
          rhr: parseFloat(form.rhr) || null,
          pulse_rate: parseFloat(form.pulse_rate) || null,
          spo2: parseFloat(form.spo2) || null,
          breathing_rate: parseFloat(form.breathing_rate) || null,
          systolic_bp: parseFloat(form.systolic_bp) || null,
          diastolic_bp: parseFloat(form.diastolic_bp) || null,
        },
        emg: form.emg_entries.filter(e => e.muscle && e.mvc_percentage),
        eeg: {
          device: form.eeg_device,
          protocol: form.eeg_protocol,
          bands: {
            delta: parseFloat(form.delta) || null,
            theta: parseFloat(form.theta) || null,
            alpha: parseFloat(form.alpha) || null,
            beta: parseFloat(form.beta) || null,
            gamma: parseFloat(form.gamma) || null,
          },
        },
        gsr: {
          baseline: parseFloat(form.gsr_baseline) || null,
          peak: parseFloat(form.gsr_peak) || null,
          skin_temp_c: parseFloat(form.skin_temp_c) || null,
        },
        device_used: form.device_used,
        notes: form.measurement_notes,
      }
      await save.mutateAsync(payload)
      setModalOpen(false)
      setForm(blankForm())
    } catch (err: any) {
      alert(err?.message ?? 'Failed to save psychophysiology record.')
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'hrv',   label: 'HRV & Vitals' },
    { id: 'emg',   label: 'EMG' },
    { id: 'eeg',   label: 'EEG / Brainwave' },
    { id: 'other', label: 'GSR & Other' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Psychophysiology"
        subtitle="HRV · Biofeedback · EMG · Brainwave · Wearables"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPageTab('wearables')}>
              <Watch size={15} /> Import Wearables
            </Button>
            <Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Record</Button>
          </div>
        }
      />

      {/* Page-level tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        <button onClick={() => setPageTab('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${pageTab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Activity size={14} /> Manual Records
        </button>
        <button onClick={() => setPageTab('wearables')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${pageTab === 'wearables' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Watch size={14} /> Wearables Import
        </button>
      </div>

      {/* ── Wearables Import Section ─────────────────────────────────────── */}
      {pageTab === 'wearables' && (
        <WearablesImportSection
          athletes={athletes}
          wearableSessions={wearableSessions}
          wearableSource={wearableSource}
          wearableAthlete={wearableAthlete}
          importing={importing}
          savingWearable={savingWearable}
          importError={importError}
          importSuccess={importSuccess}
          fileRef={fileRef}
          onAthleteChange={setWearableAthlete}
          onFileChange={handleWearableFile}
          onSave={saveWearableData}
          onClear={() => { setWearableSessions([]); setWearableSource(null); setImportError(null); setImportSuccess(null) }}
        />
      )}

      {pageTab === 'manual' && (
      <>
      {/* Filter */}
      <div className="mb-4">
        <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All athletes</option>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
        </select>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : records.length === 0 ? (
          <EmptyState icon={<Activity size={48} />} title="No psychophysiology records"
            description="Record HRV, EMG, brainwave, and biofeedback data"
            action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Record</Button>} />
        ) : (
          <div className="space-y-4">
            {records.map((r: any) => {
              const brainData = r.eeg?.bands ? BRAINWAVE_BANDS.map(b => ({ name: b.label, value: r.eeg.bands[b.key] ?? 0 })) : []
              return (
                <Card key={r.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {r.athlete?.first_name} {r.athlete?.last_name}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(r.created_at)} · {r.session_context}</p>
                    </div>
                    {r.device_used && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{r.device_used}</span>}
                  </div>

                  {/* HRV Summary */}
                  {r.hrv && Object.values(r.hrv).some(Boolean) && (
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      {[
                        { label: 'RMSSD', val: r.hrv.rmssd, unit: 'ms', good: (v: number) => v > 50 },
                        { label: 'SDNN', val: r.hrv.sdnn, unit: 'ms', good: (v: number) => v > 50 },
                        { label: 'LF/HF', val: r.hrv.lf_hf_ratio, unit: '', good: (v: number) => v < 2 },
                        { label: 'pNN50', val: r.hrv.pnn50, unit: '%', good: (v: number) => v > 20 },
                      ].map(({ label, val, unit, good }) => val != null && (
                        <div key={label} className={`rounded-lg p-2 text-center ${good(val) ? 'bg-green-50' : 'bg-amber-50'}`}>
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="font-bold text-gray-900">{val}{unit}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Vitals */}
                  {r.vitals && Object.values(r.vitals).some(Boolean) && (
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      {[
                        { l: 'RHR', v: r.vitals.rhr, u: 'bpm' },
                        { l: 'SpO₂', v: r.vitals.spo2, u: '%' },
                        { l: 'Breathing', v: r.vitals.breathing_rate, u: '/min' },
                        { l: 'BP Sys', v: r.vitals.systolic_bp, u: 'mmHg' },
                        { l: 'BP Dia', v: r.vitals.diastolic_bp, u: 'mmHg' },
                        { l: 'Pulse', v: r.vitals.pulse_rate, u: 'bpm' },
                      ].filter(x => x.v != null).map(({ l, v, u }) => (
                        <div key={l} className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-400">{l}</p>
                          <p className="font-bold text-gray-800 text-sm">{v} <span className="text-xs font-normal text-gray-400">{u}</span></p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Brainwave chart */}
                  {brainData.some(d => d.value > 0) && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs text-gray-500 font-medium mb-2">Brainwave Profile (μV²/Hz)</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <RadarChart data={brainData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* EMG summary */}
                  {r.emg && r.emg.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs text-gray-500 font-medium mb-2">EMG Readings</p>
                      <div className="space-y-1">
                        {r.emg.map((e: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-40 shrink-0">{e.muscle}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(e.mvc_percentage), 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-12 text-right">{e.mvc_percentage}% MVC</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

      </>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-4 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-900">New Psychophysiology Record</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Athlete + Context */}
              <div className="grid grid-cols-2 gap-3">
                <Select label="Athlete *" value={form.athlete_id} onChange={e => f('athlete_id', e.target.value)}
                  options={[{ value: '', label: '— Select —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]} />
                <Select label="Context" value={form.session_context} onChange={e => f('session_context', e.target.value)}
                  options={[
                    { value: 'resting', label: 'Resting baseline' },
                    { value: 'pre_competition', label: 'Pre-competition' },
                    { value: 'post_competition', label: 'Post-competition' },
                    { value: 'training', label: 'During training' },
                    { value: 'recovery', label: 'Recovery session' },
                    { value: 'intervention', label: 'Intervention session' },
                  ]} />
              </div>

              <Input label="Device / Platform used" value={form.device_used} onChange={e => f('device_used', e.target.value)}
                placeholder="e.g. Polar H10, Muse 2, BioRadio, Shimmer" />

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* HRV & Vitals */}
              {activeTab === 'hrv' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Heart Rate Variability</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="RMSSD (ms)" type="number" value={form.hrv_rmssd} onChange={e => f('hrv_rmssd', e.target.value)} placeholder="e.g. 42.5" />
                    <Input label="SDNN (ms)" type="number" value={form.hrv_sdnn} onChange={e => f('hrv_sdnn', e.target.value)} placeholder="e.g. 55.3" />
                    <Input label="LF/HF Ratio" type="number" value={form.hrv_lf_hf_ratio} onChange={e => f('hrv_lf_hf_ratio', e.target.value)} placeholder="e.g. 1.8" />
                    <Input label="pNN50 (%)" type="number" value={form.hrv_pnn50} onChange={e => f('hrv_pnn50', e.target.value)} placeholder="e.g. 28.4" />
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Vitals</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="RHR (bpm)" type="number" value={form.rhr} onChange={e => f('rhr', e.target.value)} />
                    <Input label="Pulse Rate (bpm)" type="number" value={form.pulse_rate} onChange={e => f('pulse_rate', e.target.value)} />
                    <Input label="SpO₂ (%)" type="number" value={form.spo2} onChange={e => f('spo2', e.target.value)} />
                    <Input label="Breathing Rate (/min)" type="number" value={form.breathing_rate} onChange={e => f('breathing_rate', e.target.value)} />
                    <Input label="Systolic BP (mmHg)" type="number" value={form.systolic_bp} onChange={e => f('systolic_bp', e.target.value)} />
                    <Input label="Diastolic BP (mmHg)" type="number" value={form.diastolic_bp} onChange={e => f('diastolic_bp', e.target.value)} />
                  </div>
                </div>
              )}

              {/* EMG */}
              {activeTab === 'emg' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">EMG Readings</p>
                    <Button variant="secondary" size="sm" onClick={addEmgEntry}><Plus size={12} /> Add Muscle</Button>
                  </div>
                  {form.emg_entries.map((entry, idx) => (
                    <div key={idx} className="flex gap-2 items-end p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 font-medium">Muscle Group</label>
                        <select value={entry.muscle} onChange={e => updateEmg(idx, 'muscle', e.target.value)}
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                          {MUSCLE_GROUPS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="text-xs text-gray-500 font-medium">% MVC</label>
                        <input type="number" value={entry.mvc_percentage} onChange={e => updateEmg(idx, 'mvc_percentage', e.target.value)}
                          placeholder="0–100" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      <div className="w-24">
                        <label className="text-xs text-gray-500 font-medium">Amp (μV)</label>
                        <input type="number" value={entry.amplitude_uv} onChange={e => updateEmg(idx, 'amplitude_uv', e.target.value)}
                          placeholder="μV" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      <button onClick={() => removeEmg(idx)} className="text-gray-300 hover:text-red-400 mb-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* EEG / Brainwave */}
              {activeTab === 'eeg' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="EEG Device" value={form.eeg_device} onChange={e => f('eeg_device', e.target.value)} placeholder="e.g. Muse 2, OpenBCI" />
                    <Input label="Protocol / State" value={form.eeg_protocol} onChange={e => f('eeg_protocol', e.target.value)} placeholder="e.g. eyes closed, task" />
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Brainwave Bands (μV²/Hz or relative %)</p>
                  {BRAINWAVE_BANDS.map(b => (
                    <div key={b.key} className="flex items-center gap-3">
                      <div className="w-20 shrink-0">
                        <p className="text-sm font-medium text-gray-700">{b.label}</p>
                        <p className="text-xs text-gray-400">{b.range}</p>
                      </div>
                      <input type="number" value={(form as any)[b.key]} onChange={e => f(b.key, e.target.value)}
                        placeholder="Value" className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
                      <p className="text-xs text-gray-400">{b.note}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Other */}
              {activeTab === 'other' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Galvanic Skin Response / Temperature</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="GSR Baseline (μS)" type="number" value={form.gsr_baseline} onChange={e => f('gsr_baseline', e.target.value)} />
                    <Input label="GSR Peak (μS)" type="number" value={form.gsr_peak} onChange={e => f('gsr_peak', e.target.value)} />
                    <Input label="Skin Temp (°C)" type="number" value={form.skin_temp_c} onChange={e => f('skin_temp_c', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Measurement Notes</label>
                    <textarea value={form.measurement_notes} onChange={e => f('measurement_notes', e.target.value)} rows={3}
                      placeholder="Conditions, artefacts, observations..."
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-5 border-t">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving} disabled={!form.athlete_id}>
                <Save size={16} /> Save Record
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

// ── WearablesImportSection ────────────────────────────────────────────────────

const WEARABLE_SOURCE_META = {
  whoop: {
    label: 'WHOOP 4.0',
    icon: '💪',
    color: 'bg-red-100 text-red-700',
    fields: ['Recovery Score', 'HRV (RMSSD)', 'RHR', 'Sleep Performance', 'Strain', 'SpO₂', 'Skin Temp', 'Breathing Rate'],
    instructions: 'WHOOP → App → More → Export Data → Download CSV. Use the "Daily" export.',
  },
  garmin: {
    label: 'Garmin Connect',
    icon: '⌚',
    color: 'bg-blue-100 text-blue-700',
    fields: ['Avg Resting HR', 'HRV RMSSD', 'Stress Level', 'Body Battery', 'Respiration Rate', 'SpO₂'],
    instructions: 'Garmin Connect web → Health Stats → Heart Rate Variability → Export → CSV.',
  },
  heartmath: {
    label: 'HeartMath emWave / Inner Balance',
    icon: '❤️',
    color: 'bg-emerald-100 text-emerald-700',
    fields: ['Coherence Score', 'High/Medium/Low Coherence %', 'Achievement Score', 'Power Score', 'Challenge Level'],
    instructions: 'emWave Pro or Inner Balance desktop app → Reports → Export Sessions as CSV.',
  },
}

function WearablesImportSection({
  athletes, wearableSessions, wearableSource, wearableAthlete,
  importing, savingWearable, importError, importSuccess,
  fileRef, onAthleteChange, onFileChange, onSave, onClear
}: any) {
  const meta = wearableSource ? WEARABLE_SOURCE_META[wearableSource as keyof typeof WEARABLE_SOURCE_META] : null

  // Build trend charts from parsed sessions
  const trendData = wearableSessions.slice(-30).map((s: ParsedWearableSession) => ({
    date: s.date.slice(0, 10),
    HRV: typeof s.metrics.hrv_rmssd === 'number' ? s.metrics.hrv_rmssd : undefined,
    RHR: typeof s.metrics.rhr === 'number' ? s.metrics.rhr : undefined,
    Recovery: typeof s.metrics.recovery_score === 'number' ? s.metrics.recovery_score : undefined,
    Coherence: typeof s.metrics.avg_coherence === 'number' ? s.metrics.avg_coherence : undefined,
    Battery: typeof s.metrics.body_battery === 'number' ? s.metrics.body_battery : undefined,
  }))

  return (
    <div className="space-y-5">
      {/* Source cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {Object.entries(WEARABLE_SOURCE_META).map(([key, m]) => (
          <div key={key} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{m.icon}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.color}`}>{m.label}</span>
            </div>
            <div className="space-y-0.5 mb-3">
              {m.fields.slice(0, 4).map(f => (
                <p key={f} className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" /> {f}
                </p>
              ))}
              {m.fields.length > 4 && <p className="text-xs text-gray-300">+{m.fields.length - 4} more…</p>}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed italic">{m.instructions}</p>
          </div>
        ))}
      </div>

      {/* Upload zone */}
      <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${importing ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileChange(f) }}>
        {importing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-600">Parsing CSV…</p>
          </div>
        ) : (
          <>
            <Upload size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-700 mb-1">Drop your wearable CSV here</p>
            <p className="text-xs text-gray-400 mb-3">WHOOP · Garmin Connect · HeartMath emWave / Inner Balance</p>
            <label className="cursor-pointer">
              <span className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                Choose CSV File
              </span>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f) }} />
            </label>
          </>
        )}
      </div>

      {/* Status messages */}
      {importError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{importError}</p>
        </div>
      )}
      {importSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={15} className="text-green-500 shrink-0" />
          <p className="text-sm text-green-700 font-medium">{importSuccess}</p>
        </div>
      )}

      {/* Parsed data preview */}
      {wearableSessions.length > 0 && meta && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{meta.icon}</span>
              <div>
                <p className="font-semibold text-gray-900">{meta.label} — {wearableSessions.length} sessions</p>
                <p className="text-xs text-gray-400">
                  {wearableSessions[0]?.date} → {wearableSessions[wearableSessions.length - 1]?.date}
                </p>
              </div>
            </div>
            <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
              <X size={13} /> Clear
            </button>
          </div>

          {/* Trend charts */}
          {trendData.length > 1 && (
            <div className="grid lg:grid-cols-2 gap-4">
              {(['HRV', 'Recovery', 'Coherence', 'Battery'] as const).map(key => {
                const hasData = trendData.some((d: any) => d[key] !== undefined)
                if (!hasData) return null
                const colors: Record<string, string> = { HRV: '#8b5cf6', Recovery: '#10b981', Coherence: '#ec4899', Battery: '#3b82f6', RHR: '#ef4444' }
                return (
                  <div key={key} className="bg-white border border-gray-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{key} Trend</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={trendData} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 8 }} tickFormatter={d => d.slice(5)} />
                        <YAxis tick={{ fontSize: 8 }} />
                        <Tooltip labelFormatter={l => l} />
                        <Line type="monotone" dataKey={key} stroke={colors[key]} strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
          )}

          {/* Assign to athlete + save */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">Assign to Athlete *</label>
              <select value={wearableAthlete} onChange={e => onAthleteChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="">— Select athlete —</option>
                {athletes.map((a: any) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
              </select>
            </div>
            <button onClick={onSave} disabled={!wearableAthlete || savingWearable}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0">
              {savingWearable
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                : <><FileDown size={15} /> Save {wearableSessions.length} Sessions to Profile</>}
            </button>
          </div>

          {/* Data table preview */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview (first 10 rows)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                    {Object.keys(wearableSessions[0]?.metrics ?? {}).slice(0, 6).map(k => (
                      <th key={k} className="text-left px-3 py-2 text-gray-500 font-medium capitalize">{k.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wearableSessions.slice(0, 10).map((s: ParsedWearableSession, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{s.date}</td>
                      {Object.entries(s.metrics).slice(0, 6).map(([k, v]) => (
                        <td key={k} className="px-3 py-2 text-gray-700">{typeof v === 'number' ? v.toFixed(1) : v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
