// src/pages/athlete/AthleteDashboard.tsx
// The athlete's home screen — tasks, messages, next session, progress, programs

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle, MessageSquare, Calendar, TrendingUp, Bell,
  ChevronRight, Clock, Zap, Award, Target, Play, BookOpen,
  Mic, Video, AlignLeft, Star, BarChart2, LogOut, X, LayoutDashboard,
} from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// ── Task type icons ────────────────────────────────────────────────────────────
const TASK_ICONS: Record<string, React.ElementType> = {
  exercise: Zap,
  journal: BookOpen,
  video_watch: Video,
  audio_listen: Mic,
  breathing: Award,
  reading: AlignLeft,
  self_rating: Star,
  check_in: BarChart2,
}

const TASK_COLORS: Record<string, { bg: string; icon: string; border: string }> = {
  exercise:    { bg: 'bg-orange-50', icon: 'text-orange-500', border: 'border-orange-200' },
  journal:     { bg: 'bg-blue-50',   icon: 'text-blue-500',   border: 'border-blue-200' },
  video_watch: { bg: 'bg-purple-50', icon: 'text-purple-500', border: 'border-purple-200' },
  audio_listen:{ bg: 'bg-pink-50',   icon: 'text-pink-500',   border: 'border-pink-200' },
  breathing:   { bg: 'bg-teal-50',   icon: 'text-teal-500',   border: 'border-teal-200' },
  reading:     { bg: 'bg-indigo-50', icon: 'text-indigo-500', border: 'border-indigo-200' },
  self_rating: { bg: 'bg-amber-50',  icon: 'text-amber-500',  border: 'border-amber-200' },
  check_in:    { bg: 'bg-green-50',  icon: 'text-green-500',  border: 'border-green-200' },
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useUpcomingSession(athleteId?: string) {
  return useQuery({
    queryKey: ['athlete_sessions_upcoming', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('athlete_id', athleteId!)
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return data
    },
  })
}

function useRecentCheckins(athleteId?: string) {
  return useQuery({
    queryKey: ['athlete_checkins_recent', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('check_ins')
        .select('*')
        .eq('athlete_id', athleteId!)
        .order('checked_in_at', { ascending: false })
        .limit(7)
      return data ?? []
    },
  })
}

function useTodaysTasks(programs: any[]) {
  const programIds = programs.map(p => p.id)
  return useQuery({
    queryKey: ['todays_tasks', programIds],
    enabled: programIds.length > 0,
    queryFn: async () => {
      if (!programIds.length) return []
      const today = new Date()
      const dayOfWeek = (today.getDay() + 6) % 7 // 0=Mon

      // Get all tasks for active programs
      const { data: tasks } = await supabase
        .from('intervention_tasks')
        .select('*, completions:task_completions(status, completed_at)')
        .in('program_id', programs.map(p => p.program_id))
        .or(`day_of_week.is.null,day_of_week.eq.${dayOfWeek}`)
        .order('sort_order')

      return (tasks ?? []).map((t: any) => ({
        ...t,
        programTitle: programs.find(p => p.program_id === t.program_id)?.program?.title ?? '',
        athleteProgramId: programs.find(p => p.program_id === t.program_id)?.id,
        isCompleted: t.completions?.some((c: any) => {
          if (c.status !== 'completed') return false
          const completedDate = new Date(c.completed_at).toDateString()
          return completedDate === today.toDateString()
        }),
      }))
    },
  })
}

// ── Task Completion Modal ─────────────────────────────────────────────────────

function TaskCompletionModal({ task, onClose, onComplete }: {
  task: any
  onClose: () => void
  onComplete: (params: any) => Promise<void>
}) {
  const [rating, setRating] = useState(0)
  const [difficulty, setDifficulty] = useState(3)
  const [moodAfter, setMoodAfter] = useState(7)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    setSaving(true)
    await onComplete({
      taskId: task.id,
      programId: task.athleteProgramId,
      rating,
      feedback,
      difficulty,
      moodAfter,
    })
    setDone(true)
    setSaving(false)
    setTimeout(onClose, 1200)
  }

  const colors = TASK_COLORS[task.task_type] ?? TASK_COLORS.exercise
  const TaskIcon = TASK_ICONS[task.task_type] ?? Zap

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {done ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <p className="text-lg font-bold text-gray-900">Great work!</p>
            <p className="text-sm text-gray-500">Task marked complete</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className={`p-5 ${colors.bg} border-b ${colors.border}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm`}>
                    <TaskIcon size={20} className={colors.icon} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-500">{task.programTitle} · {task.duration_minutes ?? '?'} min</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Instructions */}
              {task.content_text && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
                  {task.content_text}
                </div>
              )}

              {/* Rating */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">How did this feel?</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setRating(n)}
                      className={`flex-1 py-2 rounded-xl border-2 text-lg transition-all ${
                        rating >= n ? 'border-amber-400 bg-amber-50' : 'border-gray-100'
                      }`}>
                      ⭐
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Difficulty</p>
                  <span className="text-sm font-bold text-gray-900">{difficulty}/5</span>
                </div>
                <input type="range" min={1} max={5} value={difficulty} onChange={e => setDifficulty(+e.target.value)}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Easy</span><span>Hard</span>
                </div>
              </div>

              {/* Mood after */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Mood after</p>
                  <span className="text-sm font-bold" style={{ color: moodAfter >= 7 ? '#16a34a' : moodAfter >= 5 ? '#d97706' : '#dc2626' }}>
                    {moodAfter}/10
                  </span>
                </div>
                <input type="range" min={1} max={10} value={moodAfter} onChange={e => setMoodAfter(+e.target.value)}
                  className="w-full accent-green-500" />
              </div>

              {/* Notes */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Notes (optional)</p>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
                  placeholder="Any thoughts or observations…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AthleteDashboard() {
  const { athleteProfile, athleteRecord, programs, notifications, unreadCount, conversation, markAllNotificationsRead } = useAthlete()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const { completeTask } = useAthlete()

  const { data: upcomingSession } = useUpcomingSession(athleteProfile?.athlete_id)
  const { data: checkins = [] } = useRecentCheckins(athleteProfile?.athlete_id)
  const { data: todaysTasks = [], refetch: refetchTasks } = useTodaysTasks(programs)

  const pendingTasks = todaysTasks.filter((t: any) => !t.isCompleted)
  const completedToday = todaysTasks.filter((t: any) => t.isCompleted).length

  const displayName = athleteProfile?.display_name
    || (athleteRecord ? `${athleteRecord.first_name}` : 'Athlete')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Avg mood from last 7 check-ins
  const avgMood = checkins.length
    ? (checkins.reduce((a: number, c: any) => a + c.mood_score, 0) / checkins.length).toFixed(1)
    : null

  // Session countdown
  const sessionDate = upcomingSession ? new Date(upcomingSession.scheduled_at) : null
  const sessionDaysAway = sessionDate
    ? Math.ceil((sessionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  async function handleSignOut() {
    await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top Bar ── */}
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#1e3a5f] text-white px-4 pt-safe pb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4 pt-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-black text-sm">S</div>
              <span className="text-xs text-white/60 font-medium">SPPS Athlete Portal</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Notifications bell */}
              <button onClick={() => { setShowNotifications(v => !v); if (!showNotifications) markAllNotificationsRead() }}
                className="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button onClick={handleSignOut} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Greeting */}
          <div>
            <p className="text-sm text-white/60">{greeting},</p>
            <h1 className="text-2xl font-black">{displayName}</h1>
            {pendingTasks.length > 0 && (
              <p className="text-sm text-amber-300 mt-1 flex items-center gap-1">
                <Zap size={14} /> {pendingTasks.length} task{pendingTasks.length > 1 ? 's' : ''} due today
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Notifications panel */}
      {showNotifications && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="font-semibold text-sm text-gray-900">Notifications</p>
              <button onClick={() => setShowNotifications(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No notifications yet</p>
            ) : (
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={`px-4 py-3 ${!n.is_read ? 'bg-blue-50' : ''}`}>
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                    <p className="text-xs text-gray-300 mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ── Progress stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Mood avg', value: avgMood ?? '—', suffix: avgMood ? '/10' : '', color: '#3b82f6' },
            { label: 'Done today', value: `${completedToday}/${todaysTasks.length}`, suffix: '', color: '#10b981' },
            { label: 'Programs', value: programs.length, suffix: '', color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-xl font-black" style={{ color: s.color }}>{s.value}<span className="text-xs font-normal text-gray-400">{s.suffix}</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Today's Tasks ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <Zap size={15} className="text-amber-500" /> Today's Tasks
            </h2>
            <Link to="/athlete/programs" className="text-xs text-blue-500 hover:text-blue-700">View all</Link>
          </div>
          {todaysTasks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle size={32} className="text-green-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No tasks assigned yet</p>
              <p className="text-xs text-gray-300 mt-1">Your practitioner will assign tasks soon</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaysTasks.slice(0, 6).map((task: any) => {
                const colors = TASK_COLORS[task.task_type] ?? TASK_COLORS.exercise
                const Icon = TASK_ICONS[task.task_type] ?? Zap
                return (
                  <button key={task.id} onClick={() => !task.isCompleted && setSelectedTask(task)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${task.isCompleted ? 'opacity-60' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.bg}`}>
                      <Icon size={16} className={colors.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-400">{task.programTitle} · {task.duration_minutes ?? '?'} min</p>
                    </div>
                    {task.isCompleted
                      ? <CheckCircle size={18} className="text-green-500 shrink-0" />
                      : <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    }
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Messages ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <MessageSquare size={15} className="text-blue-500" /> Messages
            </h2>
            <Link to="/athlete/messages" className="text-xs text-blue-500">Open chat →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            <Link to="/athlete/messages"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {athleteRecord ? `${athleteRecord.practitioner_first_name?.[0] ?? 'Dr'}` : 'Dr'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Your Practitioner</p>
                <p className="text-xs text-gray-400 truncate">
                  {conversation?.last_message_preview ?? 'Start a conversation…'}
                </p>
              </div>
              {(conversation?.athlete_unread ?? 0) > 0 && (
                <span className="w-5 h-5 bg-blue-500 rounded-full text-xs font-bold text-white flex items-center justify-center shrink-0">
                  {conversation!.athlete_unread}
                </span>
              )}
            </Link>
            <Link to="/athlete/ai-chat"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <span className="text-lg">🤖</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                <p className="text-xs text-gray-400">Mental performance support, 24/7</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          </div>
        </div>

        {/* ── Next Session ── */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${upcomingSession ? 'bg-blue-600 border-blue-500' : 'bg-white border-gray-100'}`}>
          <div className="px-4 py-4">
            {upcomingSession ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-200 font-medium flex items-center gap-1">
                    <Calendar size={12} /> NEXT SESSION
                  </p>
                  <p className="text-white font-bold mt-1">
                    {sessionDate?.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-blue-200 text-sm">
                    {sessionDate?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {upcomingSession.session_type && ` · ${upcomingSession.session_type.replace(/_/g, ' ')}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-white">{sessionDaysAway}</p>
                  <p className="text-xs text-blue-200">{sessionDaysAway === 1 ? 'day' : 'days'} away</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-gray-300" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">No upcoming sessions</p>
                  <button onClick={() => navigate('/athlete/requests')} className="text-xs text-blue-500 hover:text-blue-700">
                    Request a session →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Active Programs ── */}
        {programs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Target size={15} className="text-emerald-500" /> Active Programs
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {programs.slice(0, 3).map(prog => {
                const totalWeeks = prog.program?.duration_weeks ?? 1
                const startDate = new Date(prog.start_date)
                const weeksIn = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))) + 1
                const pct = Math.min(Math.round((weeksIn / totalWeeks) * 100), 100)
                return (
                  <Link key={prog.id} to={`/athlete/programs/${prog.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                      <Target size={16} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{prog.program?.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          Week {Math.min(weeksIn, totalWeeks)}/{totalWeeks} · {pct}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Bottom nav spacer ── */}
        <div className="h-20" />
      </div>

      {/* ── Bottom Navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pb-safe z-40">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2">
          {[
            { icon: LayoutDashboard, label: 'Home', path: '/athlete/dashboard', active: true },
            { icon: Zap, label: 'Tasks', path: '/athlete/programs' },
            { icon: MessageSquare, label: 'Messages', path: '/athlete/messages' },
            { icon: TrendingUp, label: 'Progress', path: '/athlete/progress' },
          ].map(item => {
            const Icon = item.icon
            return (
              <Link key={item.path} to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors ${
                  item.active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}>
                <Icon size={20} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Task modal ── */}
      {selectedTask && (
        <TaskCompletionModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={async (params) => {
            await completeTask(params)
            await refetchTasks()
          }}
        />
      )}
    </div>
  )
}

