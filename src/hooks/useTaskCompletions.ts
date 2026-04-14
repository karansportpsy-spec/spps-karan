// src/hooks/useTaskCompletions.ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Practitioner: watch completions for a specific athlete (realtime) ─────────
export function usePractitionerTaskCompletions(athleteId?: string) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['practitioner_task_completions', athleteId],
    enabled: !!athleteId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_completions')
        .select(`
          *,
          task:intervention_tasks(title, task_type, week_number),
          program:athlete_programs!athlete_program_id(
            program:intervention_programs(title)
          )
        `)
        .eq('athlete_id', athleteId!)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  // Realtime: athlete completes a task → practitioner sees it immediately
  useEffect(() => {
    if (!athleteId || !user?.id) return
    const channel = supabase
      .channel(`task_completions:athlete:${athleteId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_completions',
        filter: `athlete_id=eq.${athleteId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['practitioner_task_completions', athleteId] })
        qc.invalidateQueries({ queryKey: ['program_progress'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athleteId, user?.id, qc])

  return query
}

// ── Program progress percentage ───────────────────────────────────────────────
export function useProgramProgress(athleteProgramId?: string, totalTasks?: number) {
  const query = useQuery({
    queryKey: ['program_progress', athleteProgramId],
    enabled: !!athleteProgramId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('task_completions')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_program_id', athleteProgramId!)
        .eq('status', 'completed')
      if (error) throw error
      return count ?? 0
    },
  })

  const percentage = totalTasks && query.data != null
    ? Math.round((query.data / totalTasks) * 100)
    : null

  return { ...query, completedCount: query.data, percentage }
}
