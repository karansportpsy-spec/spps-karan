// src/components/practitioner/AthleteDailyLogsPanel.tsx
import { usePractitionerAthleteLogs } from '@/hooks/useAthleteDailyLogs'
import type { AthleteDailyLog } from '@/types/sync'

const SCORE_COLOR = (v: number | undefined, invert = false): string => {
  if (v == null) return 'text-gray-300'
  const good = invert ? v <= 3 : v >= 7
  const bad  = invert ? v >= 7 : v <= 3
  if (good) return 'text-emerald-600'
  if (bad)  return 'text-red-500'
  return 'text-amber-500'
}

const FLAG_LABELS: Record<string, string> = {
  low_sleep: 'Low Sleep',
  high_stress: 'High Stress',
  low_mood: 'Low Mood',
  very_high_rpe: 'High RPE',
  low_confidence: 'Low Confidence',
  low_control: 'Low Control',
}

function Bar({ value, max = 10, color }: { value?: number; max?: number; color: string }) {
  if (value == null) return <span className="text-xs text-gray-300">—</span>
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-4 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

export default function AthleteDailyLogsPanel({ athleteId }: { athleteId: string }) {
  const { data: logs = [], isLoading } = usePractitionerAthleteLogs(athleteId, 14)

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">No daily logs yet</p>
        <p className="text-xs mt-1 text-gray-300">Athlete submits logs via their portal</p>
      </div>
    )
  }

  const latest = logs[0]
  const flaggedLogs = logs.filter(l => l.flags.length > 0)
  const allFlags = [...new Set(flaggedLogs.flatMap(l => l.flags))]

  return (
    <div className="space-y-4">
      {/* Flags alert */}
      {flaggedLogs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-bold text-amber-700 mb-1.5 flex items-center gap-1.5">
            ⚠ {flaggedLogs.length} flagged log{flaggedLogs.length > 1 ? 's' : ''} in last 14 days
          </p>
          <div className="flex flex-wrap gap-1">
            {allFlags.map(f => (
              <span key={f} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {FLAG_LABELS[f] ?? f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Latest log summary card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">Latest Log</h3>
          <span className="text-xs text-gray-400">
            {new Date(latest.log_date).toLocaleDateString('en-IN', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sleep</p>
            {latest.sleep_hours != null && (
              <p className="text-xs text-gray-600 mb-1">{latest.sleep_hours}h sleep</p>
            )}
            <Bar value={latest.sleep_quality} color="#6366f1" />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Training RPE
            </p>
            {latest.training_done ? (
              <>
                <Bar value={latest.rpe} color="#f97316" />
                {latest.training_type && (
                  <p className="text-xs text-gray-400 mt-1">{latest.training_type}</p>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400">No training</span>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Wellness</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Mood</span>
                <Bar value={latest.mood_score} color="#3b82f6" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Stress</span>
                <Bar value={latest.stress_score} color="#ef4444" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Energy</span>
                <Bar value={latest.energy_score} color="#f59e0b" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Five Cs</p>
            <div className="space-y-0.5">
              {(
                [
                  ['Commitment', latest.commitment],
                  ['Confidence', latest.confidence],
                  ['Control', latest.control],
                  ['Concentration', latest.concentration],
                  ['Communication', latest.communication],
                ] as [string, number | undefined][]
              ).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{label.slice(0, 6)}</span>
                  <span className={`text-xs font-bold ${SCORE_COLOR(val)}`}>{val ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {latest.general_notes && (
          <p className="text-xs text-gray-500 italic mt-3 pt-3 border-t border-gray-50">
            "{latest.general_notes}"
          </p>
        )}

        {latest.flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {latest.flags.map(f => (
              <span key={f} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                ⚠ {FLAG_LABELS[f] ?? f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 14-day history table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-50">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">14-Day History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Sleep', 'RPE', 'Mood', 'Stress', 'Conf', 'Ctrl', 'Flags'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr
                  key={l.id}
                  className={`border-t border-gray-50 ${l.flags.length > 0 ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
                    {new Date(l.log_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.sleep_quality ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{l.rpe ?? '—'}</td>
                  <td className={`px-3 py-2 font-bold ${SCORE_COLOR(l.mood_score)}`}>
                    {l.mood_score ?? '—'}
                  </td>
                  <td className={`px-3 py-2 font-bold ${SCORE_COLOR(l.stress_score, true)}`}>
                    {l.stress_score ?? '—'}
                  </td>
                  <td className={`px-3 py-2 font-bold ${SCORE_COLOR(l.confidence)}`}>
                    {l.confidence ?? '—'}
                  </td>
                  <td className={`px-3 py-2 font-bold ${SCORE_COLOR(l.control)}`}>
                    {l.control ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    {l.flags.length > 0 ? (
                      <span className="text-amber-600 font-semibold">⚠ {l.flags.length}</span>
                    ) : (
                      <span className="text-emerald-500">✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
