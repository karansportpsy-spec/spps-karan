// src/pages/athlete/AthleteProgressPage.tsx
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, TrendingUp, Activity, Target, CheckCircle, Calendar, Smile, Frown, Meh } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

function useAthleteCheckins(athleteId?: string) {
  return useQuery({
    queryKey: ['athlete_progress_checkins', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase.from('check_ins').select('mood_score,stress_score,sleep_score,readiness_score,checked_in_at')
        .eq('athlete_id', athleteId!).order('checked_in_at', { ascending: false }).limit(30)
      return data ?? []
    },
  })
}

function useTaskCompletions(athleteId?: string) {
  return useQuery({
    queryKey: ['athlete_progress_completions', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase.from('task_completions').select('status,completed_at,rating,mood_after,difficulty')
        .eq('athlete_id', athleteId!).order('created_at', { ascending: false }).limit(50)
      return data ?? []
    },
  })
}

function useSessionCount(athleteId?: string) {
  return useQuery({
    queryKey: ['athlete_progress_sessions', athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data } = await supabase.from('sessions').select('id,status,scheduled_at')
        .eq('athlete_id', athleteId!).eq('status', 'completed')
      return data ?? []
    },
  })
}

function MoodIcon({ score }: { score: number }) {
  if (score >= 7) return <Smile size={16} className="text-green-500" />
  if (score >= 5) return <Meh size={16} className="text-amber-500" />
  return <Frown size={16} className="text-red-500" />
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-300">{sub}</p>}
    </div>
  )
}

function BarChart({ data, label, color, max = 10 }: { data: { date: string; value: number }[]; label: string; color: string; max?: number }) {
  if (data.length === 0) return null
  const last14 = data.slice(0, 14).reverse()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className="text-sm font-bold text-gray-900 mb-3">{label}</p>
      <div className="flex items-end gap-1 h-20">
        {last14.map((d, i) => {
          const pct = Math.max((d.value / max) * 100, 5)
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-sm" style={{ height: `${pct}%`, backgroundColor: color, minHeight: '3px' }} />
              {i % 3 === 0 && <span className="text-[8px] text-gray-300">{new Date(d.date).getDate()}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AthleteProgressPage() {
  const { athleteProfile, programs } = useAthlete()
  const { data: checkins = [] } = useAthleteCheckins(athleteProfile?.athlete_id)
  const { data: completions = [] } = useTaskCompletions(athleteProfile?.athlete_id)
  const { data: sessions = [] } = useSessionCount(athleteProfile?.athlete_id)

  const avg = (arr: any[], key: string) => {
    const valid = arr.filter(x => x[key] != null)
    return valid.length ? (valid.reduce((s, x) => s + x[key], 0) / valid.length).toFixed(1) : '—'
  }

  const avgMood = avg(checkins, 'mood_score')
  const avgStress = avg(checkins, 'stress_score')
  const avgSleep = avg(checkins, 'sleep_score')
  const avgReadiness = avg(checkins, 'readiness_score')

  const completedTasks = completions.filter(c => c.status === 'completed').length
  const totalTasks = completions.length
  const avgTaskRating = avg(completions.filter(c => c.rating), 'rating')
  const avgMoodAfter = avg(completions.filter(c => c.mood_after), 'mood_after')

  const moodData = checkins.map(c => ({ date: c.checked_in_at, value: c.mood_score }))
  const stressData = checkins.map(c => ({ date: c.checked_in_at, value: c.stress_score }))
  const sleepData = checkins.map(c => ({ date: c.checked_in_at, value: c.sleep_score }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="font-bold text-gray-900">My Progress</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Overview stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Avg Mood" value={avgMood} sub="out of 10" color="#3b82f6" />
          <StatCard label="Avg Stress" value={avgStress} sub="out of 10" color="#f59e0b" />
          <StatCard label="Avg Sleep" value={avgSleep} sub="out of 10" color="#8b5cf6" />
          <StatCard label="Readiness" value={avgReadiness} sub="out of 10" color="#10b981" />
        </div>

        {/* Task completion stats */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle size={15} className="text-green-500" /> Task Completion
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-black text-green-600">{completedTasks}</p>
              <p className="text-xs text-gray-400">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-gray-700">{programs.length}</p>
              <p className="text-xs text-gray-400">Programs</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-blue-600">{sessions.length}</p>
              <p className="text-xs text-gray-400">Sessions</p>
            </div>
          </div>
          {avgTaskRating !== '—' && (
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>Avg task rating: <strong className="text-amber-600">{avgTaskRating}/5 ⭐</strong></span>
              <span>Avg mood after: <strong className="text-green-600">{avgMoodAfter}/10</strong></span>
            </div>
          )}
        </div>

        {/* Charts */}
        <BarChart data={moodData} label="Mood Trend (last 14 check-ins)" color="#3b82f6" />
        <BarChart data={stressData} label="Stress Trend" color="#f59e0b" />
        <BarChart data={sleepData} label="Sleep Trend" color="#8b5cf6" />

        {/* Recent check-ins */}
        {checkins.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Activity size={15} className="text-blue-500" /> Recent Check-ins
            </h2>
            <div className="space-y-2">
              {checkins.slice(0, 7).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <MoodIcon score={c.mood_score} />
                    <span className="text-xs text-gray-500">{new Date(c.checked_in_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-blue-600">Mood {c.mood_score}</span>
                    <span className="text-amber-600">Stress {c.stress_score}</span>
                    <span className="text-purple-600">Sleep {c.sleep_score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {checkins.length === 0 && completions.length === 0 && (
          <div className="text-center py-12">
            <TrendingUp size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No progress data yet</p>
            <p className="text-sm text-gray-400 mt-1">Complete tasks and check-ins to see your progress</p>
          </div>
        )}

        <div className="h-20" />
      </div>
    </div>
  )
}
