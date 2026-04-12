// src/pages/athlete/AthleteProgramPage.tsx
// Shows all tasks in an assigned program, grouped by week, with completion

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, CheckCircle, Clock, Zap, BookOpen, Video, Mic,
  Award, AlignLeft, Star, BarChart2, Calendar, X, Target,
} from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

const TASK_ICONS: Record<string, React.ElementType> = {
  exercise: Zap, journal: BookOpen, video_watch: Video, audio_listen: Mic,
  breathing: Award, reading: AlignLeft, self_rating: Star, check_in: BarChart2,
}
const TASK_COLORS: Record<string, { bg: string; icon: string }> = {
  exercise:     { bg: 'bg-orange-50', icon: 'text-orange-500' },
  journal:      { bg: 'bg-blue-50',   icon: 'text-blue-500' },
  video_watch:  { bg: 'bg-purple-50', icon: 'text-purple-500' },
  audio_listen: { bg: 'bg-pink-50',   icon: 'text-pink-500' },
  breathing:    { bg: 'bg-teal-50',   icon: 'text-teal-500' },
  reading:      { bg: 'bg-indigo-50', icon: 'text-indigo-500' },
  self_rating:  { bg: 'bg-amber-50',  icon: 'text-amber-500' },
  check_in:     { bg: 'bg-green-50',  icon: 'text-green-500' },
}
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function useProgramDetail(athleteProgramId?: string) {
  const { athleteProfile } = useAthlete()
  return useQuery({
    queryKey: ['athlete_program_detail', athleteProgramId],
    enabled: !!athleteProgramId && !!athleteProfile,
    queryFn: async () => {
      // Get the assignment
      const { data: assignment } = await supabase
        .from('athlete_programs')
        .select('*, program:intervention_programs(id,title,description,category,duration_weeks)')
        .eq('id', athleteProgramId!)
        .single()
      if (!assignment) return null

      // Get tasks
      const { data: tasks } = await supabase
        .from('intervention_tasks')
        .select('*')
        .eq('program_id', assignment.program_id)
        .order('week_number')
        .order('day_of_week')
        .order('sort_order')

      // Get completions
      const { data: completions } = await supabase
        .from('task_completions')
        .select('*')
        .eq('athlete_program_id', athleteProgramId!)
        .eq('athlete_id', athleteProfile!.athlete_id)

      return { assignment, tasks: tasks ?? [], completions: completions ?? [] }
    },
  })
}

// ── Task Completion Modal ────────────────────────────────────────────────────

function CompletionModal({ task, programId, onClose }: { task: any; programId: string; onClose: () => void }) {
  const { completeTask } = useAthlete()
  const [rating, setRating] = useState(0)
  const [difficulty, setDifficulty] = useState(3)
  const [moodAfter, setMoodAfter] = useState(7)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const colors = TASK_COLORS[task.task_type] ?? TASK_COLORS.exercise
  const Icon = TASK_ICONS[task.task_type] ?? Zap

  async function handleSubmit() {
    setSaving(true)
    await completeTask({ taskId: task.id, programId, rating: rating || undefined, feedback: feedback || undefined, difficulty, moodAfter })
    setDone(true)
    setSaving(false)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {done ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <p className="text-lg font-bold text-gray-900">Great work!</p>
          </div>
        ) : (
          <>
            <div className={`p-5 ${colors.bg} border-b`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <Icon size={20} className={colors.icon} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-500">{task.duration_minutes ?? '?'} min</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
              </div>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {task.content_text && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">{task.content_text}</div>
              )}
              {task.content_url && (
                <a href={task.content_url} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-blue-600 underline">Open content link →</a>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">How did this feel?</p>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRating(n)}
                      className={`flex-1 py-2 rounded-xl border-2 text-lg transition-all ${rating >= n ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}>⭐</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Difficulty</p>
                  <span className="text-sm font-bold text-gray-900">{difficulty}/5</span>
                </div>
                <input type="range" min={1} max={5} value={difficulty} onChange={e => setDifficulty(+e.target.value)} className="w-full accent-blue-500" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Mood after</p>
                  <span className="text-sm font-bold" style={{ color: moodAfter >= 7 ? '#16a34a' : moodAfter >= 5 ? '#d97706' : '#dc2626' }}>{moodAfter}/10</span>
                </div>
                <input type="range" min={1} max={10} value={moodAfter} onChange={e => setMoodAfter(+e.target.value)} className="w-full accent-green-500" />
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Notes (optional)</p>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="Any thoughts…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <button onClick={handleSubmit} disabled={saving}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={18} />}
                {saving ? 'Saving…' : 'Mark Complete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AthleteProgramPage() {
  const { programId } = useParams<{ programId: string }>()
  const { data, isLoading } = useProgramDetail(programId)
  const [selectedTask, setSelectedTask] = useState<any>(null)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data?.assignment) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-4">
        <Target size={40} className="text-gray-300" />
        <p className="text-gray-500 font-medium">Program not found</p>
        <Link to="/athlete/dashboard" className="text-blue-500 text-sm">← Back to dashboard</Link>
      </div>
    )
  }

  const { assignment, tasks, completions } = data
  const program = assignment.program
  const completedIds = new Set(completions.filter((c: any) => c.status === 'completed').map((c: any) => c.task_id))
  const totalTasks = tasks.length
  const completedCount = tasks.filter((t: any) => completedIds.has(t.id)).length
  const pct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0

  // Group by week
  const byWeek: Record<number, any[]> = {}
  tasks.forEach((t: any) => {
    const w = t.week_number ?? 1
    if (!byWeek[w]) byWeek[w] = []
    byWeek[w].push({ ...t, isCompleted: completedIds.has(t.id) })
  })
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b)

  // Current week
  const startDate = new Date(assignment.start_date)
  const currentWeek = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#1e3a5f] text-white px-4 pt-safe pb-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 pt-3 mb-4">
            <Link to="/athlete/dashboard" className="p-2 -ml-2 rounded-xl bg-white/10 hover:bg-white/20">
              <ChevronLeft size={18} />
            </Link>
            <span className="text-xs text-white/60">Program</span>
          </div>
          <h1 className="text-xl font-black">{program?.title ?? 'Program'}</h1>
          {program?.description && <p className="text-sm text-white/60 mt-1">{program.description}</p>}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-bold">{pct}%</span>
          </div>
          <p className="text-xs text-white/50 mt-1">{completedCount}/{totalTasks} tasks · Week {Math.min(currentWeek, program?.duration_weeks ?? 99)} of {program?.duration_weeks ?? '?'}</p>
        </div>
      </div>

      {/* Tasks by week */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {weeks.map(week => {
          const weekTasks = byWeek[week]
          const weekCompleted = weekTasks.filter((t: any) => t.isCompleted).length
          const isCurrent = week === Math.min(currentWeek, program?.duration_weeks ?? 99)

          return (
            <div key={week}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Calendar size={14} className={isCurrent ? 'text-blue-500' : 'text-gray-400'} />
                  Week {week}
                  {isCurrent && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Current</span>}
                </h2>
                <span className="text-xs text-gray-400">{weekCompleted}/{weekTasks.length} done</span>
              </div>

              <div className="space-y-2">
                {weekTasks.map((task: any) => {
                  const colors = TASK_COLORS[task.task_type] ?? TASK_COLORS.exercise
                  const Icon = TASK_ICONS[task.task_type] ?? Zap
                  return (
                    <button key={task.id}
                      onClick={() => !task.isCompleted && setSelectedTask(task)}
                      disabled={task.isCompleted}
                      className={`w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border transition-all text-left ${
                        task.isCompleted ? 'border-green-200 opacity-70' : 'border-gray-100 hover:shadow-sm hover:border-blue-200 active:scale-[0.99]'
                      }`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.bg}`}>
                        <Icon size={16} className={colors.icon} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                        <p className="text-xs text-gray-400">
                          {task.duration_minutes ?? '?'} min
                          {task.day_of_week != null ? ` · ${DAY_LABELS[task.day_of_week]}` : ''}
                          {!task.is_mandatory ? ' · optional' : ''}
                        </p>
                      </div>
                      {task.isCompleted
                        ? <CheckCircle size={20} className="text-green-500 shrink-0" />
                        : <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="h-20" />
      </div>

      {/* Completion modal */}
      {selectedTask && (
        <CompletionModal
          task={selectedTask}
          programId={programId!}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}
