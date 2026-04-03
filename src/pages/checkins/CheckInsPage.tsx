import { useState } from 'react'
import { Plus, Activity } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Avatar, Modal, Select, ScoreRing, Spinner, EmptyState } from '@/components/ui'
import { useCheckIns, useCreateCheckIn } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700 capitalize">{label}</span>
        <span className="font-semibold text-gray-900">{value}/10</span>
      </div>
      <input
        type="range" min={1} max={10} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full accent-blue-600 cursor-pointer"
      />
    </div>
  )
}

const BLANK_FORM = {
  athlete_id: '',
  mood_score: 7,
  stress_score: 5,
  sleep_score: 7,
  motivation_score: 7,
  readiness_score: 7,
  notes: '',
}

export default function CheckInsPage() {
  const { data: checkins = [], isLoading } = useCheckIns()
  const { data: athletes = [] } = useAthletes()
  const createCheckIn = useCreateCheckIn()

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState(BLANK_FORM)

  const athleteOptions = [
    { value: '', label: '— Select athlete —' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  function openModal() {
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.athlete_id) return
    setSaving(true)
    setSaveError('')
    try {
      await createCheckIn.mutateAsync({
        ...form,
        checked_in_at: new Date().toISOString(),
      })
      setModalOpen(false)
    } catch (err: any) {
      setSaveError('Save failed: ' + (err?.message ?? 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Chart data — most recent 14 check-ins in chronological order
  const chartData = [...checkins]
    .reverse()
    .slice(-14)
    .map(c => ({
      date:   fmtDate(c.checked_in_at, 'dd/MM'),
      Mood:   c.mood_score,
      Stress: c.stress_score,
      Sleep:  c.sleep_score,
    }))

  return (
    <AppShell>
      <PageHeader
        title="Check-Ins"
        subtitle={`${checkins.length} recorded`}
        action={<Button onClick={openModal}><Plus size={16} />New Check-In</Button>}
      />

      {/* Trend chart */}
      {checkins.length > 1 && (
        <Card className="p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">14-Day Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Mood"   stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Stress" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Sleep"  stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : checkins.length === 0 ? (
        <EmptyState
          icon={<Activity size={48} />}
          title="No check-ins yet"
          description="Record your first athlete check-in to start tracking wellbeing trends."
          action={<Button onClick={openModal}><Plus size={16} />New Check-In</Button>}
        />
      ) : (
        <div className="space-y-3">
          {checkins.map(c => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {c.athlete && (
                  <Avatar firstName={c.athlete.first_name} lastName={c.athlete.last_name} size="sm" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {c.athlete ? `${c.athlete.first_name} ${c.athlete.last_name}` : 'Unknown athlete'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(c.checked_in_at, 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0 flex-wrap">
                  <ScoreRing score={c.mood_score}       label="mood"   size={52} />
                  <ScoreRing score={c.stress_score}     label="stress" size={52} />
                  <ScoreRing score={c.sleep_score}      label="sleep"  size={52} />
                  <ScoreRing score={c.motivation_score} label="motiv"  size={52} />
                  <ScoreRing score={c.readiness_score}  label="ready"  size={52} />
                </div>
              </div>
              {c.notes && (
                <p className="text-xs text-gray-500 mt-2 ml-12 italic">{c.notes}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Check-In">
        <div className="space-y-5">
          <Select
            label="Athlete"
            value={form.athlete_id}
            onChange={e => setForm(f => ({ ...f, athlete_id: e.target.value }))}
            options={athleteOptions}
          />
          <ScoreSlider label="Mood"        value={form.mood_score}       onChange={v => setForm(f => ({ ...f, mood_score: v }))} />
          <ScoreSlider label="Stress"      value={form.stress_score}     onChange={v => setForm(f => ({ ...f, stress_score: v }))} />
          <ScoreSlider label="Sleep"       value={form.sleep_score}      onChange={v => setForm(f => ({ ...f, sleep_score: v }))} />
          <ScoreSlider label="Motivation"  value={form.motivation_score} onChange={v => setForm(f => ({ ...f, motivation_score: v }))} />
          <ScoreSlider label="Readiness"   value={form.readiness_score}  onChange={v => setForm(f => ({ ...f, readiness_score: v }))} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any observations or flags…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); setSaveError('') }}>Cancel</Button>
            <div className="flex items-center gap-3">
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id}>
                Save Check-In
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
