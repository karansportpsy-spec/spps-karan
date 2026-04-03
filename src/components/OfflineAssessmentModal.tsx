// OfflineAssessmentModal.tsx
// Allows practitioners to log results from any offline / third-party
// assessment (Big Five, OMSAT, ACSI-28, Mental Toughness scales, etc.)
// Saves into the same `assessments` table with tool = 'EXTERNAL:<name>'

import { useState } from 'react'
import { Plus, Trash2, ClipboardList, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Modal, Button, Input, Select, Spinner } from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import { useCreateAssessment } from '@/hooks/useData'
import type { AssessmentTool } from '@/types'

// ── Preset external tools ──────────────────────────────────────────────────────

interface PresetTool {
  name: string
  code: string
  category: string
  description: string
  defaultSubscales: string[]
  totalRange?: [number, number]
  reference?: string
}

const PRESET_TOOLS: PresetTool[] = [
  // Personality
  {
    name: 'Big Five Personality Inventory',
    code: 'BFI',
    category: 'Personality',
    description: '44-item measure of Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism',
    defaultSubscales: ['Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Neuroticism'],
    totalRange: [44, 220],
    reference: 'John & Srivastava (1999)',
  },
  {
    name: 'NEO Personality Inventory – Revised',
    code: 'NEO-PI-R',
    category: 'Personality',
    description: '240-item comprehensive five-factor personality measure',
    defaultSubscales: ['Neuroticism', 'Extraversion', 'Openness', 'Agreeableness', 'Conscientiousness'],
    reference: 'Costa & McCrae (1992)',
  },
  // Mental Toughness
  {
    name: 'Mental Toughness Questionnaire 48',
    code: 'MTQ48',
    category: 'Mental Toughness',
    description: 'Measures mental toughness across 4Cs: Control, Commitment, Challenge, Confidence',
    defaultSubscales: ['Control (Life)', 'Control (Emotional)', 'Commitment', 'Challenge', 'Confidence (Abilities)', 'Confidence (Interpersonal)'],
    totalRange: [48, 240],
    reference: 'Clough et al. (2002)',
  },
  {
    name: 'Sport Mental Toughness Questionnaire',
    code: 'SMTQ',
    category: 'Mental Toughness',
    description: '14-item sport-specific mental toughness measure',
    defaultSubscales: ['Confidence', 'Constancy', 'Control'],
    totalRange: [14, 56],
    reference: 'Sheard et al. (2009)',
  },
  {
    name: 'Psychological Performance Inventory – Alt',
    code: 'PPI-A',
    category: 'Mental Toughness',
    description: '14-item alternative to the PPI measuring mental toughness in sport',
    defaultSubscales: ['Self-Belief', 'Desire & Motivation', 'Positive Cognition', 'Visualisation', 'Attentional Control', 'Emotional Intelligence', 'Attitude Control'],
    totalRange: [14, 70],
    reference: 'Golby et al. (2007)',
  },
  // Coping & Mental Skills
  {
    name: 'Ottawa Mental Skills Assessment Tool',
    code: 'OMSAT-3*',
    category: 'Mental Skills',
    description: '48-item assessment of 12 mental skills fundamental to performance',
    defaultSubscales: ['Goal Setting', 'Self-Confidence', 'Commitment', 'Stress Reactions', 'Fear Control', 'Relaxation', 'Activation', 'Imagery', 'Mental Practice', 'Focusing', 'Refocusing', 'Competition Planning'],
    totalRange: [48, 336],
    reference: 'Durand-Bush et al. (2001)',
  },
  {
    name: 'Athletic Coping Skills Inventory – 28',
    code: 'ACSI-28',
    category: 'Coping',
    description: '28-item measure of psychological skills used by athletes',
    defaultSubscales: ['Coping with Adversity', 'Peaking Under Pressure', 'Goal Setting/Mental Preparation', 'Concentration', 'Freedom from Worry', 'Confidence & Achievement Motivation', 'Coachability'],
    totalRange: [0, 84],
    reference: 'Smith et al. (1995)',
  },
  {
    name: 'Brief COPE',
    code: 'Brief-COPE',
    category: 'Coping',
    description: '28-item abbreviated COPE inventory for situational coping',
    defaultSubscales: ['Self-Distraction', 'Active Coping', 'Denial', 'Substance Use', 'Emotional Support', 'Instrumental Support', 'Behavioural Disengagement', 'Venting', 'Positive Reframing', 'Planning', 'Humor', 'Acceptance', 'Religion', 'Self-Blame'],
    reference: 'Carver (1997)',
  },
  // Anxiety
  {
    name: 'Competitive State Anxiety Inventory – 2',
    code: 'CSAI-2',
    category: 'Anxiety',
    description: '27-item competitive anxiety inventory with direction sub-scales',
    defaultSubscales: ['Cognitive Anxiety (Intensity)', 'Somatic Anxiety (Intensity)', 'Self-Confidence (Intensity)', 'Cognitive Anxiety (Direction)', 'Somatic Anxiety (Direction)', 'Self-Confidence (Direction)'],
    totalRange: [27, 108],
    reference: 'Martens et al. (1990)',
  },
  {
    name: 'Sport Anxiety Scale – 2',
    code: 'SAS-2',
    category: 'Anxiety',
    description: '15-item measure of competitive trait anxiety in athletes',
    defaultSubscales: ['Worry', 'Somatic Anxiety', 'Concentration Disruption'],
    totalRange: [15, 60],
    reference: 'Smith et al. (2006)',
  },
  // Motivation
  {
    name: 'Sport Motivation Scale – 6',
    code: 'SMS-6',
    category: 'Motivation',
    description: '24-item multidimensional sport motivation measure (Self-Determination Theory)',
    defaultSubscales: ['Intrinsic Motivation', 'Integrated Regulation', 'Identified Regulation', 'Introjected Regulation', 'External Regulation', 'Amotivation'],
    totalRange: [24, 168],
    reference: 'Mallett et al. (2007)',
  },
  // Burnout & Recovery
  {
    name: 'Athlete Burnout Questionnaire',
    code: 'ABQ',
    category: 'Burnout',
    description: '15-item measure of athlete burnout across 3 dimensions',
    defaultSubscales: ['Emotional/Physical Exhaustion', 'Reduced Sense of Accomplishment', 'Sport Devaluation'],
    totalRange: [15, 75],
    reference: 'Raedeke & Smith (2001)',
  },
  {
    name: 'Recovery-Stress Questionnaire for Athletes',
    code: 'RESTQ-Sport',
    category: 'Recovery',
    description: '52-item assessment of recovery-stress balance',
    defaultSubscales: ['General Stress', 'Emotional Stress', 'Social Stress', 'Conflicts/Pressure', 'Fatigue', 'Lack of Energy', 'Physical Complaints', 'Success', 'Social Recovery', 'Physical Recovery', 'General Well-being', 'Sleep Quality', 'Disturbed Breaks', 'Emotional Exhaustion', 'Injury', 'Being in Shape', 'Personal Accomplishment', 'Self-Efficacy', 'Self-Regulation'],
    reference: 'Kellmann & Kallus (2001)',
  },
  // Confidence & Self-Efficacy
  {
    name: 'Sport Confidence Inventory',
    code: 'SCI',
    category: 'Confidence',
    description: "14-item inventory assessing athlete's sport-specific confidence",
    defaultSubscales: ['Physical Skills & Training', 'Cognitive Efficiency', 'Resilience'],
    totalRange: [14, 140],
    reference: 'Vealey et al. (1998)',
  },
  // Well-being
  {
    name: 'PANAS – Positive & Negative Affect Schedule',
    code: 'PANAS',
    category: 'Affect',
    description: '20-item measure of positive and negative affect',
    defaultSubscales: ['Positive Affect', 'Negative Affect'],
    totalRange: [20, 100],
    reference: 'Watson et al. (1988)',
  },
  {
    name: 'Profile of Mood States – Short Form',
    code: 'POMS-SF',
    category: 'Mood',
    description: '30-item brief version of the POMS for repeated use',
    defaultSubscales: ['Tension', 'Depression', 'Anger', 'Vigour', 'Fatigue', 'Confusion'],
    totalRange: [0, 120],
    reference: 'Grove & Prapavessis (1992)',
  },
  // Custom
  {
    name: 'Custom / Other Tool',
    code: 'CUSTOM',
    category: 'Other',
    description: 'Enter any tool not listed above — name it and add your own subscales',
    defaultSubscales: [],
  },
]

const CATEGORIES = ['All', ...Array.from(new Set(PRESET_TOOLS.map(t => t.category)))]

const ADMIN_CONTEXTS = [
  { value: 'baseline',          label: 'Baseline / Initial Assessment' },
  { value: 'pre_competition',   label: 'Pre-Competition' },
  { value: 'post_competition',  label: 'Post-Competition' },
  { value: 'mid_season',        label: 'Mid-Season' },
  { value: 'post_season',       label: 'Post-Season' },
  { value: 'follow_up',         label: 'Follow-up / Progress' },
  { value: 'clinical_review',   label: 'Clinical Review' },
  { value: 'other',             label: 'Other' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscaleEntry {
  id: string
  name: string
  score: string
  maxScore: string
  interpretation: string
}

function newSubscale(name = ''): SubscaleEntry {
  return { id: crypto.randomUUID(), name, score: '', maxScore: '', interpretation: '' }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToolCard({ tool, selected, onClick }: { tool: PresetTool; selected: boolean; onClick: () => void }) {
  const categoryColors: Record<string, string> = {
    Personality:     'bg-violet-100 text-violet-700',
    'Mental Toughness': 'bg-blue-100 text-blue-700',
    'Mental Skills': 'bg-cyan-100 text-cyan-700',
    Coping:          'bg-teal-100 text-teal-700',
    Anxiety:         'bg-red-100 text-red-700',
    Motivation:      'bg-amber-100 text-amber-700',
    Burnout:         'bg-orange-100 text-orange-700',
    Recovery:        'bg-green-100 text-green-700',
    Confidence:      'bg-indigo-100 text-indigo-700',
    Affect:          'bg-pink-100 text-pink-700',
    Mood:            'bg-rose-100 text-rose-700',
    Other:           'bg-gray-100 text-gray-600',
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-gray-900">{tool.code}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[tool.category] ?? 'bg-gray-100 text-gray-600'}`}>
              {tool.category}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-snug">{tool.description}</p>
          {tool.reference && (
            <p className="text-xs text-gray-300 mt-0.5 italic">{tool.reference}</p>
          )}
        </div>
        {selected && (
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">✓</span>
          </div>
        )}
      </div>
    </button>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  preselectedAthleteId?: string
}

export default function OfflineAssessmentModal({ open, onClose, preselectedAthleteId }: Props) {
  const { data: athletes = [] } = useAthletes()
  const createAssessment = useCreateAssessment()

  // Step: 1 = select tool, 2 = enter scores
  const [step, setStep] = useState<1 | 2>(1)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTool, setSelectedTool] = useState<PresetTool | null>(null)
  const [showAllTools, setShowAllTools] = useState(false)

  // Step 2 form
  const [athleteId, setAthleteId] = useState(preselectedAthleteId ?? '')
  const [customToolName, setCustomToolName] = useState('')
  const [adminContext, setAdminContext] = useState('baseline')
  const [adminDate, setAdminDate] = useState(new Date().toISOString().slice(0, 10))
  const [subscales, setSubscales] = useState<SubscaleEntry[]>([])
  const [totalScore, setTotalScore] = useState('')
  const [totalMax, setTotalMax] = useState('')
  const [interpretation, setInterpretation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showTips, setShowTips] = useState(false)

  const filteredTools = PRESET_TOOLS.filter(t => {
    const matchCat = categoryFilter === 'All' || t.category === categoryFilter
    const q = searchTerm.toLowerCase()
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    return matchCat && matchQ
  })

  const displayedTools = showAllTools ? filteredTools : filteredTools.slice(0, 9)

  function selectTool(tool: PresetTool) {
    setSelectedTool(tool)
    setSubscales(
      tool.defaultSubscales.length > 0
        ? tool.defaultSubscales.map(name => newSubscale(name))
        : [newSubscale()]
    )
    if (tool.totalRange) {
      setTotalMax(String(tool.totalRange[1]))
    }
  }

  function proceedToStep2() {
    if (!selectedTool) return
    setStep(2)
  }

  function updateSubscale(id: string, field: keyof SubscaleEntry, value: string) {
    setSubscales(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function addSubscale() {
    setSubscales(prev => [...prev, newSubscale()])
  }

  function removeSubscale(id: string) {
    setSubscales(prev => prev.filter(s => s.id !== id))
  }

  // Auto-compute total from subscale scores
  function autoTotal() {
    const sum = subscales.reduce((acc, s) => {
      const v = parseFloat(s.score)
      return acc + (isNaN(v) ? 0 : v)
    }, 0)
    setTotalScore(String(sum))
  }

  function reset() {
    setStep(1)
    setSelectedTool(null)
    setCustomToolName('')
    setAthleteId(preselectedAthleteId ?? '')
    setAdminContext('baseline')
    setAdminDate(new Date().toISOString().slice(0, 10))
    setSubscales([])
    setTotalScore('')
    setTotalMax('')
    setInterpretation('')
    setNotes('')
    setCategoryFilter('All')
    setSearchTerm('')
    setShowAllTools(false)
  }

  async function handleSave() {
    if (!athleteId || !selectedTool) return
    setSaving(true)
    try {
      const toolCode = selectedTool.code === 'CUSTOM'
        ? `EXTERNAL:${customToolName.trim().toUpperCase()}`
        : `EXTERNAL:${selectedTool.code}`

      // Build scores map from subscales
      const scoresMap: Record<string, number> = {}
      subscales.forEach(s => {
        if (s.name && s.score !== '') {
          scoresMap[s.name] = parseFloat(s.score) || 0
        }
      })

      // Build notes string with context, interpretation, and clinician notes
      const noteLines = [
        `Tool: ${selectedTool.code === 'CUSTOM' ? customToolName : selectedTool.name}`,
        selectedTool.reference ? `Reference: ${selectedTool.reference}` : '',
        `Context: ${ADMIN_CONTEXTS.find(a => a.value === adminContext)?.label ?? adminContext}`,
        totalMax ? `Score: ${totalScore} / ${totalMax}` : totalScore ? `Total Score: ${totalScore}` : '',
        interpretation ? `Interpretation: ${interpretation}` : '',
        notes ? `\nClinician Notes:\n${notes}` : '',
      ].filter(Boolean).join('\n')

      await createAssessment.mutateAsync({
        athlete_id: athleteId,
        tool: toolCode as AssessmentTool,
        administered_at: new Date(adminDate).toISOString(),
        scores: scoresMap,
        total_score: parseFloat(totalScore) || 0,
        notes: noteLines,
      })

      reset()
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const canProceed = !!selectedTool && (selectedTool.code !== 'CUSTOM' || customToolName.trim().length > 0)
  const canSave = !!athleteId && subscales.some(s => s.score !== '')

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title={step === 1 ? 'Log Offline / External Assessment' : `Log: ${selectedTool?.code === 'CUSTOM' ? customToolName || 'Custom Tool' : selectedTool?.code}`}
      maxWidth="max-w-3xl"
    >
      {/* ── STEP 1: Tool Selection ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Select from 16+ validated sport psychology instruments, or enter any custom tool.
            Results are saved to the athlete's assessment record and appear in Case Formulation.
          </p>

          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ClipboardList size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tool grid */}
          <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {displayedTools.map(tool => (
              <ToolCard
                key={tool.code}
                tool={tool}
                selected={selectedTool?.code === tool.code}
                onClick={() => selectTool(tool)}
              />
            ))}
            {filteredTools.length === 0 && (
              <div className="col-span-2 text-center py-8 text-gray-400 text-sm">
                No tools match — use "Custom / Other Tool" to log any instrument
              </div>
            )}
          </div>

          {filteredTools.length > 9 && (
            <button
              onClick={() => setShowAllTools(v => !v)}
              className="w-full text-xs text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1 py-1"
            >
              {showAllTools ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {filteredTools.length} tools</>}
            </button>
          )}

          {/* Custom name input */}
          {selectedTool?.code === 'CUSTOM' && (
            <div>
              <label className="text-sm font-medium text-gray-700">Custom Tool Name *</label>
              <input
                value={customToolName}
                onChange={e => setCustomToolName(e.target.value)}
                placeholder="e.g. Mental Toughness Scale – Sheard, OMSAT-3*, etc."
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button onClick={proceedToStep2} disabled={!canProceed}>
              Next: Enter Scores →
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Enter Scores ───────────────────────────────────────────── */}
      {step === 2 && selectedTool && (
        <div className="space-y-5">
          {/* Tool info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-blue-900">
                  {selectedTool.code === 'CUSTOM' ? customToolName : `${selectedTool.code} — ${selectedTool.name}`}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">{selectedTool.description}</p>
                {selectedTool.reference && (
                  <p className="text-xs text-blue-400 italic mt-0.5">{selectedTool.reference}</p>
                )}
              </div>
              <button onClick={() => setShowTips(v => !v)} className="text-blue-400 hover:text-blue-600 ml-2 shrink-0">
                <Info size={16} />
              </button>
            </div>
            {showTips && selectedTool.totalRange && (
              <p className="text-xs text-blue-700 mt-2 bg-blue-100 rounded-lg p-2">
                Score range: {selectedTool.totalRange[0]} – {selectedTool.totalRange[1]}
              </p>
            )}
          </div>

          {/* Athlete + Context */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Athlete *</label>
              <select
                value={athleteId}
                onChange={e => setAthleteId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Select athlete —</option>
                {athletes.map(a => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Date Administered"
              type="date"
              value={adminDate}
              onChange={e => setAdminDate((e.target as HTMLInputElement).value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Administration Context</label>
            <select
              value={adminContext}
              onChange={e => setAdminContext(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ADMIN_CONTEXTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Subscale scores */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Subscale Scores</label>
              <Button variant="secondary" size="sm" onClick={addSubscale}>
                <Plus size={13} /> Add Subscale
              </Button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {subscales.map((s, idx) => (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input
                      value={s.name}
                      onChange={e => updateSubscale(s.id, 'name', e.target.value)}
                      placeholder={`Subscale ${idx + 1} name`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={s.score}
                      onChange={e => updateSubscale(s.id, 'score', e.target.value)}
                      placeholder="Score"
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-1 text-center text-gray-300 text-sm">/</div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={s.maxScore}
                      onChange={e => updateSubscale(s.id, 'maxScore', e.target.value)}
                      placeholder="Max"
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => removeSubscale(s.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                      disabled={subscales.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Interpretation per subscale */}
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
              {subscales.filter(s => s.name).map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-32 shrink-0 truncate">{s.name}</span>
                  <input
                    value={s.interpretation}
                    onChange={e => updateSubscale(s.id, 'interpretation', e.target.value)}
                    placeholder="Interpretation / band (optional)"
                    className="flex-1 border border-gray-100 bg-gray-50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Total score */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Total Score</label>
              <button
                onClick={autoTotal}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                ↑ Auto-sum subscales
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <input
                  type="number"
                  value={totalScore}
                  onChange={e => setTotalScore(e.target.value)}
                  placeholder="Total"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-1">
                <input
                  type="number"
                  value={totalMax}
                  onChange={e => setTotalMax(e.target.value)}
                  placeholder="Max possible"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-1">
                <input
                  value={interpretation}
                  onChange={e => setInterpretation(e.target.value)}
                  placeholder="Overall band (e.g. High)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Clinical notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Clinician Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Clinical observations, athlete context, recommendations, follow-up actions…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { reset(); onClose() }}>Cancel</Button>
              <Button onClick={handleSave} loading={saving} disabled={!canSave}>
                Save Assessment
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
