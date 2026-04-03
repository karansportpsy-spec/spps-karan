import { useState } from 'react'
import { Plus, Trash2, Save, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Select, Input, Spinner, EmptyState, Badge } from '@/components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface CustomScale {
  name: string
  score: string | number
  max_score?: string | number
  interpretation?: string
}

interface CustomAssessmentRecord {
  id: string
  practitioner_id: string
  athlete_id: string
  athlete?: { first_name: string; last_name: string }
  tool_name: string
  tool_version?: string
  source?: string
  administered_at: string
  scales: CustomScale[]
  total_score?: number
  overall_interpretation?: string
  clinical_notes?: string
  created_at: string
}

// ── Preset tool templates ─────────────────────────────────────

const TOOL_TEMPLATES: Record<string, { scales: CustomScale[]; source: string }> = {
  'Big Five (BFI-10)': {
    source: 'Rammstedt & John, 2007',
    scales: [
      { name: 'Extraversion', score: '', max_score: 5, interpretation: '' },
      { name: 'Agreeableness', score: '', max_score: 5, interpretation: '' },
      { name: 'Conscientiousness', score: '', max_score: 5, interpretation: '' },
      { name: 'Neuroticism', score: '', max_score: 5, interpretation: '' },
      { name: 'Openness', score: '', max_score: 5, interpretation: '' },
    ],
  },
  'OMSAT-3 (Mental Skills)': {
    source: 'Durand-Bush et al., 2001',
    scales: [
      { name: 'Goal Setting', score: '', max_score: 7, interpretation: '' },
      { name: 'Self-Confidence', score: '', max_score: 7, interpretation: '' },
      { name: 'Commitment', score: '', max_score: 7, interpretation: '' },
      { name: 'Stress Reactions', score: '', max_score: 7, interpretation: '' },
      { name: 'Fear Control', score: '', max_score: 7, interpretation: '' },
      { name: 'Relaxation', score: '', max_score: 7, interpretation: '' },
      { name: 'Activation', score: '', max_score: 7, interpretation: '' },
      { name: 'Imagery', score: '', max_score: 7, interpretation: '' },
      { name: 'Mental Practice', score: '', max_score: 7, interpretation: '' },
      { name: 'Attention Control', score: '', max_score: 7, interpretation: '' },
      { name: 'Competition Planning', score: '', max_score: 7, interpretation: '' },
      { name: 'Refocusing', score: '', max_score: 7, interpretation: '' },
    ],
  },
  'CSAI-2 (Competitive Anxiety)': {
    source: 'Martens et al., 1990',
    scales: [
      { name: 'Cognitive Anxiety', score: '', max_score: 36, interpretation: '' },
      { name: 'Somatic Anxiety', score: '', max_score: 36, interpretation: '' },
      { name: 'Self-Confidence', score: '', max_score: 36, interpretation: '' },
    ],
  },
  'Young Schema Questionnaire (YSQ)': {
    source: 'Young et al.',
    scales: [
      { name: 'Emotional Deprivation', score: '', max_score: 36, interpretation: '' },
      { name: 'Abandonment / Instability', score: '', max_score: 36, interpretation: '' },
      { name: 'Mistrust / Abuse', score: '', max_score: 36, interpretation: '' },
      { name: 'Social Isolation', score: '', max_score: 36, interpretation: '' },
      { name: 'Defectiveness / Shame', score: '', max_score: 36, interpretation: '' },
      { name: 'Failure to Achieve', score: '', max_score: 36, interpretation: '' },
      { name: 'Dependence / Incompetence', score: '', max_score: 36, interpretation: '' },
      { name: 'Subjugation', score: '', max_score: 36, interpretation: '' },
      { name: 'Self-Sacrifice', score: '', max_score: 36, interpretation: '' },
      { name: 'Approval Seeking', score: '', max_score: 36, interpretation: '' },
      { name: 'Punitiveness', score: '', max_score: 36, interpretation: '' },
      { name: 'Entitlement', score: '', max_score: 36, interpretation: '' },
    ],
  },
  'PANAS (Mood)': {
    source: 'Watson et al., 1988',
    scales: [
      { name: 'Positive Affect', score: '', max_score: 50, interpretation: '' },
      { name: 'Negative Affect', score: '', max_score: 50, interpretation: '' },
    ],
  },
  'Readiness to Change': {
    source: 'Prochaska & DiClemente',
    scales: [
      { name: 'Pre-contemplation', score: '', max_score: 30, interpretation: '' },
      { name: 'Contemplation', score: '', max_score: 30, interpretation: '' },
      { name: 'Action', score: '', max_score: 30, interpretation: '' },
    ],
  },
  'Custom (blank)': {
    source: '',
    scales: [{ name: '', score: '', max_score: '', interpretation: '' }],
  },
}

// ── Data hooks ────────────────────────────────────────────────

function useCustomAssessments(athleteId: string) {
  const { user } = useAuth()
  return useQuery<CustomAssessmentRecord[]>({
    queryKey: ['custom_assessments', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('custom_assessments')
        .select('*, athlete:athletes(first_name,last_name)')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) return []
      return (data ?? []) as CustomAssessmentRecord[]
    },
  })
}

function useSaveCustomAssessment() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase
        .from('custom_assessments')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom_assessments'] }),
  })
}

// ── Component ─────────────────────────────────────────────────

function blankForm() {
  return {
    athlete_id: '',
    tool_name: 'Custom (blank)',
    tool_version: '',
    source: '',
    administered_at: new Date().toISOString().slice(0, 10),
    scales: [{ name: '', score: '', max_score: '', interpretation: '' }] as CustomScale[],
    overall_interpretation: '',
    clinical_notes: '',
  }
}

export default function CustomAssessmentPage() {
  const { data: athletes = [] } = useAthletes()
  const [filterAthleteId, setFilterAthleteId] = useState('')
  const { data: records = [], isLoading } = useCustomAssessments(filterAthleteId)
  const save = useSaveCustomAssessment()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<any>(blankForm())
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function f(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })) }

  function selectTemplate(name: string) {
    const tpl = TOOL_TEMPLATES[name]
    if (!tpl) return
    setForm((p: any) => ({
      ...p,
      tool_name: name,
      source: tpl.source,
      scales: tpl.scales.map(s => ({ ...s })),
    }))
  }

  function updateScale(idx: number, key: string, val: string) {
    setForm((p: any) => {
      const scales = [...p.scales]
      scales[idx] = { ...scales[idx], [key]: val }
      return { ...p, scales }
    })
  }

  function addScale() {
    setForm((p: any) => ({
      ...p,
      scales: [...p.scales, { name: '', score: '', max_score: '', interpretation: '' }],
    }))
  }

  function removeScale(idx: number) {
    setForm((p: any) => ({ ...p, scales: p.scales.filter((_: any, i: number) => i !== idx) }))
  }

  async function handleSave() {
    if (!form.athlete_id || !form.tool_name) return
    setSaving(true)
    try {
      const total = form.scales
        .map((s: CustomScale) => parseFloat(s.score as string) || 0)
        .reduce((a: number, b: number) => a + b, 0)

      await save.mutateAsync({
        athlete_id: form.athlete_id,
        tool_name: form.tool_name === 'Custom (blank)' ? (form.scales[0]?.name ? form.tool_name : 'Custom') : form.tool_name,
        tool_version: form.tool_version || null,
        source: form.source || null,
        administered_at: form.administered_at,
        scales: form.scales.filter((s: CustomScale) => s.name),
        total_score: total > 0 ? total : null,
        overall_interpretation: form.overall_interpretation || null,
        clinical_notes: form.clinical_notes || null,
      })
      setModalOpen(false)
      setForm(blankForm())
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Custom Assessments"
        subtitle="Add any psychometric tool — Big Five, OMSAT-3, YSQ, CSAI-2, or build your own"
        action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Assessment</Button>}
      />

      <div className="mb-4">
        <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All athletes</option>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
        </select>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : records.length === 0 ? (
          <EmptyState icon={<ClipboardList size={48} />} title="No custom assessments"
            description="Add scores from any psychometric tool — Big Five, OMSAT-3, YSQ, CSAI-2, or any other inventory"
            action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Assessment</Button>} />
        ) : (
          <div className="space-y-3">
            {records.map(r => {
              const isExpanded = expandedId === r.id
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{r.tool_name}</p>
                      <p className="text-xs text-gray-400">
                        {r.athlete?.first_name} {r.athlete?.last_name} · {fmtDate(r.administered_at)}
                        {r.source ? ` · ${r.source}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.total_score != null && (
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">{r.total_score}</p>
                          <p className="text-xs text-gray-400">total</p>
                        </div>
                      )}
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Scale summary bars */}
                  {r.scales.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {r.scales.map((s, i) => {
                        const val = parseFloat(s.score as string) || 0
                        const max = parseFloat(s.max_score as string) || 100
                        const pct = Math.min((val / max) * 100, 100)
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                              <span className="truncate max-w-[80px]">{s.name || `Scale ${i+1}`}</span>
                              <span>{val}{s.max_score ? `/${s.max_score}` : ''}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 border-t pt-4 space-y-3">
                      {r.scales.map((s, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{s.name || `Scale ${i+1}`}</p>
                            {s.interpretation && <p className="text-xs text-gray-500 mt-0.5">{s.interpretation}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold text-gray-900">{s.score}{s.max_score ? `/${s.max_score}` : ''}</p>
                          </div>
                        </div>
                      ))}
                      {r.overall_interpretation && (
                        <div className="p-3 bg-blue-50 rounded-xl">
                          <p className="text-xs font-medium text-blue-600 mb-1">Overall Interpretation</p>
                          <p className="text-sm text-blue-900">{r.overall_interpretation}</p>
                        </div>
                      )}
                      {r.clinical_notes && (
                        <div className="p-3 bg-gray-50 rounded-xl">
                          <p className="text-xs font-medium text-gray-500 mb-1">Clinical Notes</p>
                          <p className="text-sm text-gray-700">{r.clinical_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-4 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-900">Add Custom Assessment</h2>
              <button onClick={() => { setModalOpen(false); setForm(blankForm()) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Athlete + Date */}
              <div className="grid grid-cols-2 gap-3">
                <Select label="Athlete *" value={form.athlete_id} onChange={e => f('athlete_id', e.target.value)}
                  options={[{ value: '', label: '— Select —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]} />
                <Input label="Date Administered" type="date" value={form.administered_at} onChange={e => f('administered_at', e.target.value)} />
              </div>

              {/* Quick template picker */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Select Tool Template</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(TOOL_TEMPLATES).map(name => (
                    <button key={name} onClick={() => selectTemplate(name)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        form.tool_name === name
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tool details */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Tool Name *" value={form.tool_name} onChange={e => f('tool_name', e.target.value)}
                  placeholder="e.g. Big Five (BFI-10)" />
                <Input label="Source / Reference" value={form.source} onChange={e => f('source', e.target.value)}
                  placeholder="e.g. Rammstedt & John, 2007" />
              </div>

              {/* Scales */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Scale Scores</label>
                  <Button variant="secondary" size="sm" onClick={addScale}><Plus size={12} /> Add Scale</Button>
                </div>
                <div className="space-y-2">
                  {form.scales.map((scale: CustomScale, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-xl">
                      <div className="col-span-4">
                        <label className="text-xs text-gray-500">Scale / Sub-scale Name</label>
                        <input value={scale.name} onChange={e => updateScale(idx, 'name', e.target.value)}
                          placeholder="e.g. Neuroticism"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">Score</label>
                        <input type="number" value={scale.score as string} onChange={e => updateScale(idx, 'score', e.target.value)}
                          placeholder="0"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">Max</label>
                        <input type="number" value={scale.max_score as string} onChange={e => updateScale(idx, 'max_score', e.target.value)}
                          placeholder="100"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs text-gray-500">Interpretation</label>
                        <input value={scale.interpretation ?? ''} onChange={e => updateScale(idx, 'interpretation', e.target.value)}
                          placeholder="High / Elevated / Normal…"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeScale(idx)} className="text-gray-300 hover:text-red-400 mb-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interpretation + Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700">Overall Interpretation</label>
                <textarea value={form.overall_interpretation} onChange={e => f('overall_interpretation', e.target.value)}
                  rows={2} placeholder="Overall clinical interpretation of the scores…"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Clinical Notes</label>
                <textarea value={form.clinical_notes} onChange={e => f('clinical_notes', e.target.value)}
                  rows={2} placeholder="Any additional clinical observations, recommendations…"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-2 p-5 border-t">
              <Button variant="secondary" className="flex-1" onClick={() => { setModalOpen(false); setForm(blankForm()) }}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}
                disabled={!form.athlete_id || !form.tool_name}>
                <Save size={16} /> Save to Athlete Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
