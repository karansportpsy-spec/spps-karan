// src/pages/athlete/AthleteProgramsListPage.tsx
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Target, Calendar, CheckCircle, Clock } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'

export default function AthleteProgramsListPage() {
  const { programs, isLoading } = useAthlete()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="font-bold text-gray-900">My Programs</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16">
            <Target size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No programs assigned yet</p>
            <p className="text-sm text-gray-400 mt-1">Your practitioner will assign programs soon</p>
          </div>
        ) : (
          programs.map(prog => {
            const totalWeeks = prog.program?.duration_weeks ?? 1
            const startDate = new Date(prog.start_date)
            const weeksIn = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))) + 1
            const pct = Math.min(Math.round((weeksIn / totalWeeks) * 100), 100)
            const statusColors: Record<string, string> = {
              active: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700',
              paused: 'bg-gray-100 text-gray-600', completed: 'bg-blue-100 text-blue-700',
            }

            return (
              <Link key={prog.id} to={`/athlete/programs/${prog.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                      <Target size={20} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{prog.program?.title ?? 'Program'}</p>
                      <p className="text-xs text-gray-400">{prog.program?.category?.replace(/_/g, ' ') ?? ''}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[prog.status] ?? 'bg-gray-100'}`}>
                    {prog.status}
                  </span>
                </div>

                {prog.program?.description && (
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">{prog.program.description}</p>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600">{pct}%</span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Calendar size={11} /> Week {Math.min(weeksIn, totalWeeks)}/{totalWeeks}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> Started {new Date(prog.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </Link>
            )
          })
        )}

        <div className="h-20" />
      </div>
    </div>
  )
}
