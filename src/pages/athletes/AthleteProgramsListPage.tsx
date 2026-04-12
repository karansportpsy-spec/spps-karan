// src/pages/athletes/AthleteProgramsListPage.tsx
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Target, Calendar, CheckCircle, Clock } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  paused:    'bg-gray-100 text-gray-500',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  active:    CheckCircle,
  pending:   Clock,
  paused:    Clock,
  completed: CheckCircle,
  cancelled: Target,
}

export default function AthleteProgramsListPage() {
  const { programs, isLoading } = useAthlete()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-bold text-gray-900">My Programs</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Target size={32} className="text-gray-300" />
            </div>
            <p className="font-semibold text-gray-500">No programs yet</p>
            <p className="text-sm text-gray-400 mt-1">Your practitioner will assign programs here</p>
          </div>
        ) : (
          programs.map(p => {
            const StatusIcon = STATUS_ICONS[p.status] ?? Target
            return (
              <Link
                key={p.id}
                to={`/athlete/programs/${p.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{p.program?.title ?? 'Untitled Program'}</p>
                    {p.program?.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.program.description}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-300 shrink-0 mt-0.5" />
                </div>

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    <StatusIcon size={11} />
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>

                  {/* Duration */}
                  {p.program?.duration_weeks && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar size={11} />
                      {p.program.duration_weeks} week{p.program.duration_weeks !== 1 ? 's' : ''}
                    </span>
                  )}

                  {/* Category */}
                  {p.program?.category && (
                    <span className="text-xs text-gray-400">{p.program.category}</span>
                  )}
                </div>

                {/* Start date */}
                {p.start_date && (
                  <p className="text-xs text-gray-400 mt-2">
                    Started {new Date(p.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </Link>
            )
          })
        )}

        <div className="h-20" />
      </div>
    </div>
  )
}
