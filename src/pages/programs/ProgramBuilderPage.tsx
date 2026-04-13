// src/pages/programs/ProgramBuilderPage.tsx
// Practitioner tool: create intervention programs, add tasks, assign to athletes, track progress

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Layers, Target, ChevronRight, Edit2, Trash2, Users, CheckCircle,
  Clock, Zap, BookOpen, Video, Mic, Award, AlignLeft, Star, BarChart2,
  Calendar, ChevronDown, ChevronUp, Copy, X, Play, Pause, AlertCircle,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Modal, Input, Select, Spinner, EmptyState } from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'anxiety_management',       label: 'Anxiety Management',       emoji: '😰', color: 'bg-red-100 text-red-700' },
  { value: 'performance_enhancement',  label: 'Performance Enhancement',  emoji: '🚀', color: 'bg-blue-100 text-blue-700' },
  { value: 'mindfulness',             label: 'Mindfulness',              emoji: '🧘', color: 'bg-teal-100 text-teal-700' },
  { value: 'goal_setting',            label: 'Goal Setting',             emoji: '🎯', color: 'bg-amber-100 text-amber-700' },
  { value: 'imagery',                 label: 'Imagery & Visualisation',  emoji: '🌅', color: 'bg-purple-100 text-purple-700' },
  { value: 'relaxation',              label: 'Relaxation',               emoji: '🌿', color: 'bg-green-100 text-green-700' },
  { value: 'confidence',              label: 'Confidence Building',      emoji: '💪', color: 'bg-orange-100 text-orange-700' },
  { value: 'custom',                  label: 'Custom',                   emoji: '⚙️', color: 'bg-gray-100 text-gray-700' },
]

const TASK_TYPES = [
  { value: 'exercise',     label: 'Mental Exercise',  icon: Zap,       color: 'text-orange-500 bg-orange-50' },
  { value: 'journal',      label: 'Journal Entry',    icon: BookOpen,  color: 'text-blue-500 bg-blue-50' },
  { value: 'video_watch',  label: 'Watch Video',      icon: Video,     color: 'text-purple-500 bg-purple-50' },
  { value: 'audio_listen', label: 'Listen to Audio',  icon: Mic,       color: 'text-pink-500 bg-pink-50' },
  { value: 'breathing',    label: 'Breathing Exercise',icon: Award,    color: 'text-teal-500 bg-teal-50' },
  { value: 'reading',      label: 'Reading',          icon: AlignLeft, color: 'text-indigo-500 bg-indigo-50' },
  { value: 'self_rating',  label: 'Self-Rating',      icon: Star,      color: 'text-amber-500 bg-amber-50' },
  { value: 'check_in',     label: 'Check-In',         icon: BarChart2, color: 'text-green-500 bg-green-50' },
]

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getCategoryMeta(cat?: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1]
}
function getTaskTypeMeta(tt: string) {
  return TASK_TYPES.find(t => t.value === tt) ?? TASK_TYPES[0]
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Program { id: string; practitioner_id: string; title: string; description?: string; category?: string; duration_weeks?: number; is_template: boolean; created_at: string }
interface Task { id: string; program_id: string; title: string; description?: string; task_type: string; content_url?: string; content_text?: string; week_number?: number; day_of_week?: number; duration_minutes?: number; is_mandatory: boolean; sort_order: number }
interface Assignment { id: string; program_id: string; athlete_id: string; practitioner_id: string; start_date: string; end_date?: string; status: string; notes?: string; assigned_at: string; athlete?: { first_name: string; last_name: string; sport: string } }

// ── Hooks ─────────────────────────────────────────────────────────────────────

function usePrograms() {
  const { user } = useAuth()
  return useQuery<Program[]>({
    queryKey: ['intervention_programs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('intervention_programs').select('*').eq('practitioner_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data as Program[]
    },
  })
}

function useProgramTasks(programId?: string) {
  return useQuery<Task[]>({
    queryKey: ['intervention_tasks', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase.from('intervention_tasks').select('*').eq('program_id', programId!).order('week_number').order('day_of_week').order('sort_order')
      if (error) throw error
      return data as Task[]
    },
  })
}

function useAssignments(programId?: string) {
  const { user } = useAuth()
  return useQuery<Assignment[]>({
    queryKey: ['athlete_programs', user?.id, programId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('athlete_programs').select('*, athlete:athletes(first_name,last_name,sport)').eq('practitioner_id', user!.id)
      if (programId) q = q.eq('program_id', programId)
      const { data, error } = await q.order('assigned_at', { ascending: false })
      if (error) throw error
      return data as Assignment[]
    },
  })
}

// ── Task Editor Modal ─────────────────────────────────────────────────────────

function TaskEditorModal({ task, programWeeks, onSave, onClose }: {
  task?: Task | null; programWeeks: number; onSave: (t: Partial<Task>) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    task_type: task?.task_type ?? 'exercise',
    content_text: task?.content_text ?? '',
    content_url: task?.content_url ?? '',
    week_number: task?.week_number ?? 1,
    day_of_week: task?.day_of_week ?? null as number | null,
    duration_minutes: task?.duration_minutes ?? 10,
    is_mandatory: task?.is_mandatory ?? true,
    sort_order: task?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  const ttMeta = getTaskTypeMeta(form.task_type)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">{task ? 'Edit Task' : 'Add Task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          <Input label="Task Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Box Breathing Exercise" />

          {/* Task type selector */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Task Type</p>
            <div className="grid grid-cols-2 gap-2">
              {TASK_TYPES.map(tt => {
                const Icon = tt.icon
                return (
                  <button key={tt.value} onClick={() => setForm(f => ({ ...f, task_type: tt.value }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                      form.task_type === tt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600 hover:border-gray-200'
                    }`}>
                    <Icon size={14} /> {tt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Week</label>
              <select value={form.week_number ?? 1} onChange={e => setForm(f => ({ ...f, week_number: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {Array.from({ length: Math.max(programWeeks, 1) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Week {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Day</label>
              <select value={form.day_of_week ?? ''} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value ? +e.target.value : null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Any day</option>
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Duration (min)</label>
              <input type="number" min={1} max={120} value={form.duration_minutes ?? ''} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Instructions / Content</label>
            <textarea value={form.content_text} onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} rows={3}
              placeholder="Detailed instructions the athlete will see…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <Input label="Content URL (optional)" value={form.content_url ?? ''} onChange={e => setForm(f => ({ ...f, content_url: e.target.value }))} placeholder="https://youtube.com/watch?v=…" />

          <Input label="Description (optional)" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description for practitioner reference" />

          <div className="flex items-center gap-2">
            <input type="checkbox" id="mandatory" checked={form.is_mandatory} onChange={e => setForm(f => ({ ...f, is_mandatory: e.target.checked }))} className="w-4 h-4 rounded" />
            <label htmlFor="mandatory" className="text-sm text-gray-700">Mandatory task (athlete must complete)</label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} loading={saving} disabled={!form.title.trim()}>
              <CheckCircle size={14} /> {task ? 'Update Task' : 'Add Task'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Assign Program Modal ──────────────────────────────────────────────────────

function AssignModal({ program, athletes, existingAssignments, onAssign, onClose }: {
  program: Program; athletes: any[]; existingAssignments: Assignment[]
  onAssign: (athleteId: string, startDate: string, notes: string) => Promise<void>; onClose: () => void
}) {
  const assignedIds = new Set(existingAssignments.filter(a => a.status === 'active' || a.status === 'pending').map(a => a.athlete_id))
  const available = athletes.filter(a => !assignedIds.has(a.id))

  const [selectedId, setSelectedId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAssign() {
    if (!selectedId) return
    setSaving(true)
    await onAssign(selectedId, startDate, notes)
    setSaving(false)
    onClose()
  }

  const catMeta = getCategoryMeta(program.category)

  return (
    <Modal open onClose={onClose} title="Assign Program to Athlete" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className={`flex items-center gap-3 p-3 rounded-xl ${catMeta.color}`}>
          <span className="text-xl">{catMeta.emoji}</span>
          <div>
            <p className="font-bold text-sm">{program.title}</p>
            <p className="text-xs opacity-75">{program.duration_weeks ?? '?'} weeks · {catMeta.label}</p>
          </div>
        </div>

        {available.length === 0 ? (
          <div className="text-center py-6">
            <Users size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">All athletes already assigned to this program</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Select Athlete</label>
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Choose athlete —</option>
                {available.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} · {a.sport}</option>)}
              </select>
            </div>
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Notes for this athlete (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any specific instructions…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <Button onClick={handleAssign} loading={saving} disabled={!selectedId} className="w-full">
              <Users size={14} /> Assign to Athlete
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Program Detail View ───────────────────────────────────────────────────────

function ProgramDetail({ program, onBack }: { program: Program; onBack: () => void }) {
  const { user } = useAuth()
  const { data: athletes = [] } = useAthletes()
  const { data: tasks = [], isLoading: loadingTasks } = useProgramTasks(program.id)
  const { data: assignments = [] } = useAssignments(program.id)
  const qc = useQueryClient()

  const [editingTask, setEditingTask] = useState<Task | null | undefined>(undefined) // undefined = closed
  const [showAssign, setShowAssign] = useState(false)
  const [activeSection, setActiveSection] = useState<'tasks' | 'athletes'>('tasks')

  const catMeta = getCategoryMeta(program.category)

  async function handleSaveTask(payload: Partial<Task>) {
    if (editingTask?.id) {
      await supabase.from('intervention_tasks').update(payload).eq('id', editingTask.id)
    } else {
      await supabase.from('intervention_tasks').insert({ ...payload, program_id: program.id })
    }
    qc.invalidateQueries({ queryKey: ['intervention_tasks', program.id] })
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('intervention_tasks').delete().eq('id', taskId)
    qc.invalidateQueries({ queryKey: ['intervention_tasks', program.id] })
  }

  async function handleAssign(athleteId: string, startDate: string, notes: string) {
    const endDate = program.duration_weeks
      ? new Date(new Date(startDate).getTime() + program.duration_weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null
    await supabase.from('athlete_programs').insert({
      program_id: program.id, athlete_id: athleteId, practitioner_id: user!.id,
      start_date: startDate, end_date: endDate, notes: notes || null,
    })
    // Send notification to athlete
    await supabase.from('athlete_notifications').insert({
      athlete_id: athleteId, type: 'new_intervention', title: 'New Program Assigned!',
      body: `Your practitioner has assigned "${program.title}" — check your Tasks tab.`,
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['athlete_programs'] })
  }

  async function handlePauseResume(assignmentId: string, newStatus: string) {
    await supabase.from('athlete_programs').update({ status: newStatus }).eq('id', assignmentId)
    qc.invalidateQueries({ queryKey: ['athlete_programs'] })
  }

  // Group tasks by week
  const tasksByWeek: Record<number, Task[]> = {}
  tasks.forEach(t => {
    const w = t.week_number ?? 1
    if (!tasksByWeek[w]) tasksByWeek[w] = []
    tasksByWeek[w].push(t)
  })
  const weekNumbers = Object.keys(tasksByWeek).map(Number).sort((a, b) => a - b)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <button onClick={onBack} className="mt-1 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${catMeta.color}`}>{catMeta.emoji} {catMeta.label}</span>
              {program.is_template && <Badge label="Template" className="bg-blue-100 text-blue-700" />}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{program.title}</h1>
            {program.description && <p className="text-sm text-gray-500 mt-1">{program.description}</p>}
            <p className="text-xs text-gray-400 mt-1">{program.duration_weeks ?? '?'} weeks · {tasks.length} tasks · {assignments.filter(a => a.status === 'active').length} active athletes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowAssign(true)}><Users size={14} /> Assign</Button>
          <Button onClick={() => setEditingTask(null)}><Plus size={14} /> Add Task</Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'tasks' as const, label: `Tasks (${tasks.length})`, icon: Layers },
          { id: 'athletes' as const, label: `Athletes (${assignments.length})`, icon: Users },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSection === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tasks section */}
      {activeSection === 'tasks' && (
        loadingTasks ? <div className="flex justify-center py-12"><Spinner size="md" /></div> :
        tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <Layers size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No tasks yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Add tasks to define what athletes do each week</p>
            <Button onClick={() => setEditingTask(null)}><Plus size={14} /> Add First Task</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {weekNumbers.map(week => (
              <div key={week}>
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Calendar size={14} className="text-blue-500" /> Week {week}
                  <span className="text-xs text-gray-400 font-normal">· {tasksByWeek[week].length} tasks</span>
                </h3>
                <div className="space-y-2">
                  {tasksByWeek[week].map(task => {
                    const ttMeta = getTaskTypeMeta(task.task_type)
                    const Icon = ttMeta.icon
                    return (
                      <div key={task.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow group">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ttMeta.color}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                            {!task.is_mandatory && <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">optional</span>}
                          </div>
                          <p className="text-xs text-gray-400">
                            {ttMeta.label} · {task.duration_minutes ?? '?'} min
                            {task.day_of_week != null ? ` · ${DAY_LABELS[task.day_of_week]}` : ' · Any day'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingTask(task)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-blue-50"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Athletes section */}
      {activeSection === 'athletes' && (
        assignments.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <Users size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No athletes assigned yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Assign this program to athletes to get started</p>
            <Button onClick={() => setShowAssign(true)}><Users size={14} /> Assign to Athlete</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map(a => {
              const statusColors: Record<string, string> = {
                active: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700',
                paused: 'bg-gray-100 text-gray-600', completed: 'bg-blue-100 text-blue-700',
                cancelled: 'bg-red-100 text-red-600',
              }
              const weeksIn = Math.max(0, Math.floor((Date.now() - new Date(a.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000))) + 1
              const totalWeeks = program.duration_weeks ?? 1
              const pct = Math.min(Math.round((weeksIn / totalWeeks) * 100), 100)

              return (
                <div key={a.id} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {a.athlete?.first_name?.[0]}{a.athlete?.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{a.athlete?.first_name} {a.athlete?.last_name}</p>
                        <p className="text-xs text-gray-400">{a.athlete?.sport} · Started {fmtDate(a.start_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge label={a.status} className={statusColors[a.status] ?? 'bg-gray-100'} />
                      {a.status === 'active' && (
                        <button onClick={() => handlePauseResume(a.id, 'paused')} className="p-1.5 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-amber-50" title="Pause">
                          <Pause size={14} />
                        </button>
                      )}
                      {a.status === 'paused' && (
                        <button onClick={() => handlePauseResume(a.id, 'active')} className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg hover:bg-green-50" title="Resume">
                          <Play size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">Week {Math.min(weeksIn, totalWeeks)}/{totalWeeks}</span>
                  </div>
                  {a.notes && <p className="text-xs text-gray-400 mt-2 italic">{a.notes}</p>}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Task editor modal */}
      {editingTask !== undefined && (
        <TaskEditorModal
          task={editingTask}
          programWeeks={program.duration_weeks ?? 6}
          onSave={handleSaveTask}
          onClose={() => setEditingTask(undefined)}
        />
      )}

      {/* Assign modal */}
      {showAssign && (
        <AssignModal
          program={program}
          athletes={athletes}
          existingAssignments={assignments}
          onAssign={handleAssign}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProgramBuilderPage() {
  const { user } = useAuth()
  const { data: programs = [], isLoading } = usePrograms()
  const { data: allAssignments = [] } = useAssignments()
  const qc = useQueryClient()

  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '', description: '', category: 'custom', duration_weeks: 6, is_template: false,
  })

  function openCreate() {
    setEditingProgram(null)
    setForm({ title: '', description: '', category: 'custom', duration_weeks: 6, is_template: false })
    setCreateOpen(true)
  }

  function openEdit(p: Program) {
    setEditingProgram(p)
    setForm({ title: p.title, description: p.description ?? '', category: p.category ?? 'custom', duration_weeks: p.duration_weeks ?? 6, is_template: p.is_template })
    setCreateOpen(true)
  }

  async function handleSaveProgram() {
    if (!form.title.trim() || !user) return
    setSaving(true)
    try {
      if (editingProgram) {
        await supabase.from('intervention_programs').update(form).eq('id', editingProgram.id)
      } else {
        const { data } = await supabase.from('intervention_programs').insert({ ...form, practitioner_id: user.id }).select().single()
        if (data) setSelectedProgram(data as Program)
      }
      qc.invalidateQueries({ queryKey: ['intervention_programs'] })
      setCreateOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProgram(id: string) {
    if (!confirm('Delete this program and all its tasks? Active assignments will also be removed.')) return
    await supabase.from('intervention_programs').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['intervention_programs'] })
    if (selectedProgram?.id === id) setSelectedProgram(null)
  }

  async function handleDuplicate(p: Program) {
    if (!user) return
    const { data: newProg } = await supabase.from('intervention_programs').insert({
      practitioner_id: user.id, title: `${p.title} (Copy)`, description: p.description,
      category: p.category, duration_weeks: p.duration_weeks, is_template: p.is_template,
    }).select().single()
    if (!newProg) return
    // Copy tasks
    const { data: tasks } = await supabase.from('intervention_tasks').select('*').eq('program_id', p.id)
    if (tasks?.length) {
      await supabase.from('intervention_tasks').insert(
        tasks.map(t => ({ ...t, id: undefined, program_id: newProg.id, created_at: undefined }))
      )
    }
    qc.invalidateQueries({ queryKey: ['intervention_programs'] })
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedProgram) {
    return (
      <AppShell>
        <ProgramDetail program={selectedProgram} onBack={() => setSelectedProgram(null)} />
      </AppShell>
    )
  }

  // ── Programs list ────────────────────────────────────────────────────────
  return (
    <AppShell>
      <PageHeader
        title="Intervention Programs"
        subtitle={`${programs.length} programs · ${allAssignments.filter(a => a.status === 'active').length} active assignments`}
        action={<Button onClick={openCreate}><Plus size={14} /> New Program</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : programs.length === 0 ? (
        <EmptyState
          icon={<Layers size={48} />}
          title="No programs yet"
          description="Create your first intervention program to assign tasks to athletes"
          action={<Button onClick={openCreate}><Plus size={14} /> Create Program</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map(p => {
            const catMeta = getCategoryMeta(p.category)
            const activeAthletes = allAssignments.filter(a => a.program_id === p.id && a.status === 'active').length
            return (
              <div key={p.id} onClick={() => setSelectedProgram(p)}
                className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${catMeta.color}`}>
                    {catMeta.emoji} {catMeta.label}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} className="p-1 text-gray-400 hover:text-blue-500 rounded"><Edit2 size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDuplicate(p) }} className="p-1 text-gray-400 hover:text-purple-500 rounded"><Copy size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProgram(p.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={13} /></button>
                  </div>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">{p.title}</h3>
                {p.description && <p className="text-xs text-gray-400 line-clamp-2 mb-3">{p.description}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-auto">
                  <span className="flex items-center gap-1"><Clock size={12} /> {p.duration_weeks ?? '?'} weeks</span>
                  <span className="flex items-center gap-1"><Users size={12} /> {activeAthletes} active</span>
                  {p.is_template && <span className="flex items-center gap-1 text-blue-500"><Layers size={12} /> Template</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Program Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={editingProgram ? 'Edit Program' : 'Create Program'} maxWidth="max-w-md">
        <div className="space-y-4">
          <Input label="Program Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 6-Week Anxiety Management Protocol" />

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setForm(f => ({ ...f, category: c.value }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.category === c.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600 hover:border-gray-200'
                  }`}>
                  <span>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Duration (weeks)</label>
              <input type="number" min={1} max={52} value={form.duration_weeks} onChange={e => setForm(f => ({ ...f, duration_weeks: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.is_template} onChange={e => setForm(f => ({ ...f, is_template: e.target.checked }))} className="w-4 h-4 rounded" />
                Save as reusable template
              </label>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Brief description of the program goals and approach…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProgram} loading={saving} disabled={!form.title.trim()}>
              {editingProgram ? 'Update Program' : 'Create Program'}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
