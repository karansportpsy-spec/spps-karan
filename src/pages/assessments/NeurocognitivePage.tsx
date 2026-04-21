import { useState } from 'react'
import { Plus, Eye, Brain, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Select, Input, Spinner, EmptyState } from '@/components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'

// ── SENAPTEC Skills ───────────────────────────────────────────
const SENAPTEC_SKILLS = [
  { key: 'visual_clarity',       label: 'Visual Clarity',        domain: 'visual',     desc: 'Clear vision under performance demands' },
  { key: 'contrast_sensitivity', label: 'Contrast Sensitivity',  domain: 'visual',     desc: 'Detecting contrast for object recognition' },
  { key: 'near_far_quickness',   label: 'Near-Far Quickness',    domain: 'visual',     desc: 'Changing focus quickly for spatial judgment' },
  { key: 'target_capture',       label: 'Target Capture',        domain: 'visual',     desc: 'Peripheral to central vision coordination' },
  { key: 'depth_sensitivity',    label: 'Depth Sensitivity',     domain: 'processing', desc: 'Judging depth for navigation and timing' },
  { key: 'perception_span',      label: 'Perception Span',       domain: 'processing', desc: 'Perceiving and retaining broad visual information' },
  { key: 'multiple_object_tracking', label: 'Multiple Object Tracking', domain: 'processing', desc: 'Tracking movement of multiple objects' },
  { key: 'reaction_time',        label: 'Reaction Time',         domain: 'reaction',   desc: 'Reacting quickly to visual input' },
  { key: 'peripheral_reaction',  label: 'Peripheral Reaction',   domain: 'reaction',   desc: 'Moving quickly based on peripheral visual input' },
  { key: 'go_no_go',             label: 'Go / No Go',            domain: 'reaction',   desc: 'Inhibiting motion in response to new information' },
]

const DOMAIN_COLORS = {
  visual:     { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', radar: '#3b82f6' },
  processing: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', radar: '#8b5cf6' },
  reaction:   { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', radar: '#10b981' },
}

// ── Other platforms ───────────────────────────────────────────
const PLATFORMS = [
  'SENAPTEC Sensory Station',
  'Stroop Task (custom)',
  'Cambridge Cognition (CANTAB)',
  'Cogstate',
  'ImPACT Concussion Testing',
  'CNS Vital Signs',
  'BrainHQ',
  'Sparta Science',
  'FitLight Trainer',
  'Other (specify)',
]

const COMPARISON_GROUPS = [
  'General population', 'Sport-specific elite', 'Position-specific',
  'Age-matched peers', 'Team baseline', 'Personal baseline',
]

function blankForm() {
  return {
    athlete_id: '',
    platform: 'SENAPTEC Sensory Station',
    platform_custom: '',
    test_date: new Date().toISOString().slice(0, 10),
    comparison_group: 'General population',
    context: 'baseline',
    // SENAPTEC scores (percentile 0-100)
    ...Object.fromEntries(SENAPTEC_SKILLS.map(s => [s.key, ''])),
    // Optional custom scores for other platforms
    custom_metrics: [{ name: '', value: '', unit: 'percentile', interpretation: '' }],
    notes: '',
    raw_report_notes: '',
  }
}

function getColor(pct: number): string {
  if (pct >= 75) return 'text-green-600'
  if (pct >= 50) return 'text-blue-600'
  if (pct >= 25) return 'text-amber-600'
  return 'text-red-600'
}

function getBg(pct: number): string {
  if (pct >= 75) return 'bg-green-50'
  if (pct >= 50) return 'bg-blue-50'
  if (pct >= 25) return 'bg-amber-50'
  return 'bg-red-50'
}

function getLabel(pct: number): string {
  if (pct >= 90) return 'Excellent'
  if (pct >= 75) return 'Above Average'
  if (pct >= 50) return 'Average'
  if (pct >= 25) return 'Below Average'
  return 'Poor'
}

function useNeuroData(athleteId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['neuro', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('neurocognitive')
        .select('*, athlete:athletes(first_name,last_name,sport)')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) return []
      return data ?? []
    },
  })
}

function useSaveNeuro() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => {
      const row: Record<string, any> = { ...payload, practitioner_id: user!.id }
      const removedColumns = new Set<string>()
      const missingColumnRegex =
        /Could not find the ['"]([^'"]+)['"] column|column ["']([^"']+)["'] of relation ["']neurocognitive["'] does not exist/i

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase
          .from('neurocognitive')
          .insert(row)
          .select()
          .single()

        if (!error) return data

        const msg = error.message ?? ''
        if (error.code === '23502' && msg.includes('custom_metrics')) {
          row.custom_metrics = Array.isArray(row.custom_metrics) ? row.custom_metrics : []
          continue
        }

        const match = msg.match(missingColumnRegex)
        const missingColumn = match?.[1] ?? match?.[2]
        if (missingColumn && missingColumn in row && !removedColumns.has(missingColumn)) {
          delete row[missingColumn]
          removedColumns.add(missingColumn)
          continue
        }

        throw error
      }

      throw new Error('Failed to save neurocognitive assessment after compatibility retries.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['neuro'] }),
  })
}

export default function NeurocognitivePage() {
  const { data: athletes = [] } = useAthletes()
  const [filterAthleteId, setFilterAthleteId] = useState('')
  const { data: records = [], isLoading } = useNeuroData(filterAthleteId)
  const save = useSaveNeuro()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<any>(blankForm())
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isSenaptec = form.platform === 'SENAPTEC Sensory Station'

  function f(k: string, v: string) { setForm((p: any) => ({ ...p, [k]: v })) }

  function addCustomMetric() {
    setForm((p: any) => ({
      ...p,
      custom_metrics: [...p.custom_metrics, { name: '', value: '', unit: 'percentile', interpretation: '' }],
    }))
  }

  function updateMetric(idx: number, key: string, val: string) {
    setForm((p: any) => {
      const m = [...p.custom_metrics]
      m[idx] = { ...m[idx], [key]: val }
      return { ...p, custom_metrics: m }
    })
  }

  async function handleSave() {
    if (!form.athlete_id) return
    setSaving(true)
    try {
      const senaptecScores = isSenaptec
        ? Object.fromEntries(SENAPTEC_SKILLS.map(s => [s.key, parseFloat(form[s.key]) || null]))
        : {}

      await save.mutateAsync({
        athlete_id: form.athlete_id,
        platform: form.platform === 'Other (specify)' ? form.platform_custom : form.platform,
        test_date: form.test_date,
        comparison_group: form.comparison_group,
        context: form.context,
        senaptec_scores: isSenaptec ? senaptecScores : {},
        custom_metrics: !isSenaptec ? form.custom_metrics.filter((m: any) => m.name && m.value) : [],
        notes: form.notes,
        raw_report_notes: form.raw_report_notes,
      })
      setModalOpen(false)
      setForm(blankForm())
    } catch (err: any) {
      alert(err?.message ?? 'Failed to save neurocognitive assessment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Neurocognitive"
        subtitle="SENAPTEC · CANTAB · ImPACT · Visual & Sensorimotor Skills"
        action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Assessment</Button>}
      />

      <div className="mb-4 text-xs bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
        <Zap size={13} className="text-sky-500 shrink-0 mt-0.5" />
        <p className="text-sky-700 leading-relaxed">
          <strong>NeuroTracker 3D-MOT</strong> sessions are logged under{' '}
          <a href="/lab" className="underline font-semibold hover:text-sky-900">Mental Performance Lab</a>{' '}
          — it has a dedicated rich data entry form with threshold speed, dual-task, and session gain metrics.
        </p>
      </div>

      <div className="mb-4">
        <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All athletes</option>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
        </select>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : records.length === 0 ? (
          <EmptyState icon={<Brain size={48} />} title="No neurocognitive records"
            description="Add SENAPTEC, CANTAB, ImPACT, or other platform data"
            action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Assessment</Button>} />
        ) : (
          <div className="space-y-4">
            {records.map((r: any) => {
              const isExpanded = expandedId === r.id
              const scores = r.senaptec_scores ?? {}
              const radarData = SENAPTEC_SKILLS.filter(s => scores[s.key] != null).map(s => ({
                skill: s.label.split(' ')[0],
                percentile: scores[s.key],
                fullMark: 100,
              }))
              const avgScore = radarData.length > 0
                ? Math.round(radarData.reduce((a, d) => a + d.percentile, 0) / radarData.length)
                : null

              return (
                <Card key={r.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{r.athlete?.first_name} {r.athlete?.last_name}</p>
                      <p className="text-xs text-gray-400">{r.platform} · {fmtDate(r.test_date ?? r.created_at)} · vs {r.comparison_group}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {avgScore != null && (
                        <div className={`text-center px-3 py-1 rounded-lg ${getBg(avgScore)}`}>
                          <p className={`text-lg font-bold ${getColor(avgScore)}`}>{avgScore}%</p>
                          <p className="text-xs text-gray-400">avg</p>
                        </div>
                      )}
                      <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Quick domain summary */}
                  {r.senaptec_scores && (
                    <div className="flex gap-2 mt-3">
                      {['visual', 'processing', 'reaction'].map(domain => {
                        const skills = SENAPTEC_SKILLS.filter(s => s.domain === domain)
                        const vals = skills.map(s => scores[s.key]).filter(v => v != null)
                        if (!vals.length) return null
                        const avg = Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
                        const dc = DOMAIN_COLORS[domain as keyof typeof DOMAIN_COLORS]
                        return (
                          <div key={domain} className={`flex-1 text-center p-2 rounded-lg ${dc.bg} border ${dc.border}`}>
                            <p className={`text-sm font-bold ${dc.text}`}>{avg}%</p>
                            <p className={`text-xs capitalize ${dc.text}`}>{domain}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && r.senaptec_scores && (
                    <div className="mt-4 border-t pt-4">
                      {/* Radar chart */}
                      {radarData.length >= 3 && (
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10 }} />
                            <Radar dataKey="percentile" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                            <Tooltip formatter={(v: number) => [`${v}th percentile`]} />
                          </RadarChart>
                        </ResponsiveContainer>
                      )}

                      {/* Skills table */}
                      <div className="space-y-2 mt-3">
                        {['visual', 'processing', 'reaction'].map(domain => {
                          const dc = DOMAIN_COLORS[domain as keyof typeof DOMAIN_COLORS]
                          const domainSkills = SENAPTEC_SKILLS.filter(s => s.domain === domain && scores[s.key] != null)
                          if (!domainSkills.length) return null
                          return (
                            <div key={domain}>
                              <p className={`text-xs font-semibold uppercase tracking-wide ${dc.text} mb-1 capitalize`}>{domain} Skills</p>
                              {domainSkills.map(s => {
                                const pct = scores[s.key]
                                return (
                                  <div key={s.key} className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-gray-600 w-36 shrink-0">{s.label}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                                      <div className={`h-2 rounded-full ${pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-xs font-medium w-16 text-right ${getColor(pct)}`}>{pct}th · {getLabel(pct)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>

                      {r.notes && (
                        <div className="mt-3 bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                          <p className="text-sm text-gray-700">{r.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom metrics */}
                  {isExpanded && r.custom_metrics && r.custom_metrics.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {r.custom_metrics.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">{m.name}</span>
                          <span className="font-medium text-gray-900">{m.value} {m.unit}</span>
                        </div>
                      ))}
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
              <h2 className="font-bold text-gray-900">New Neurocognitive Assessment</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Athlete *" value={form.athlete_id} onChange={e => f('athlete_id', e.target.value)}
                  options={[{ value: '', label: '— Select —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]} />
                <Input label="Test Date" type="date" value={form.test_date} onChange={e => f('test_date', e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select label="Platform" value={form.platform} onChange={e => f('platform', e.target.value)}
                  options={PLATFORMS.map(p => ({ value: p, label: p }))} />
                <Select label="Context" value={form.context} onChange={e => f('context', e.target.value)}
                  options={[
                    { value: 'baseline', label: 'Baseline' },
                    { value: 'pre_season', label: 'Pre-season' },
                    { value: 'mid_season', label: 'Mid-season' },
                    { value: 'post_concussion', label: 'Post-concussion' },
                    { value: 'follow_up', label: 'Follow-up' },
                  ]} />
              </div>

              {form.platform === 'Other (specify)' && (
                <Input label="Platform name" value={form.platform_custom} onChange={e => f('platform_custom', e.target.value)} placeholder="e.g. Cogstate, BrainHQ, FitLight..." />
              )}

              <Select label="Comparison Group" value={form.comparison_group} onChange={e => f('comparison_group', e.target.value)}
                options={COMPARISON_GROUPS.map(g => ({ value: g, label: g }))} />

              {/* SENAPTEC skills */}
              {isSenaptec && (
                <div className="space-y-3">
                  {['visual', 'processing', 'reaction'].map(domain => {
                    const dc = DOMAIN_COLORS[domain as keyof typeof DOMAIN_COLORS]
                    const domainSkills = SENAPTEC_SKILLS.filter(s => s.domain === domain)
                    return (
                      <div key={domain}>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 capitalize ${dc.text}`}>{domain} Skills — Percentile (0–100)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {domainSkills.map(s => (
                            <div key={s.key}>
                              <label className="text-xs text-gray-600">{s.label}</label>
                              <input type="number" min={0} max={100} value={form[s.key]} onChange={e => f(s.key, e.target.value)}
                                placeholder="0–100"
                                className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Custom platform metrics */}
              {!isSenaptec && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Metrics</p>
                    <Button variant="secondary" size="sm" onClick={addCustomMetric}><Plus size={12} /> Add Metric</Button>
                  </div>
                  {form.custom_metrics.map((m: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 p-3 bg-gray-50 rounded-xl">
                      <input value={m.name} onChange={e => updateMetric(idx, 'name', e.target.value)}
                        placeholder="Metric name" className="col-span-2 text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
                      <input type="number" value={m.value} onChange={e => updateMetric(idx, 'value', e.target.value)}
                        placeholder="Value" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
                      <select value={m.unit} onChange={e => updateMetric(idx, 'unit', e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                        <option>percentile</option>
                        <option>ms</option>
                        <option>score</option>
                        <option>z-score</option>
                        <option>raw</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700">Clinical Notes / Recommendations</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
                  placeholder="Interpretation, recommendations, follow-up..."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-2 p-5 border-t">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving} disabled={!form.athlete_id}>
                Save Assessment
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
