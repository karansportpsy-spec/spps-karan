import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Session, CheckIn, Assessment, Intervention } from '@/types'

const SESSION_SELECT_PRIMARY = '*, athlete:athletes(id,first_name,last_name,sport,risk_level)'
const SESSION_SELECT_FALLBACK = '*, athlete:athletes(id,first_name,last_name,sport)'
const SESSION_MISSING_COLUMN_REGEX =
  /Could not find the ['"]([^'"]+)['"] column|column ["']([^"']+)["'] of relation ["']sessions["'] does not exist/i

function normalizeSessionPayload(
  payload: Partial<Session> & {
    duration_minutes?: number | string
    follow_up_required?: boolean
    homework?: string
  }
) {
  const durationValue = payload.duration_minutes as number | string | undefined | null
  const row: Record<string, unknown> = {
    ...payload,
    duration_minutes:
      durationValue === undefined || durationValue === null || durationValue === ''
        ? 50
        : Number(durationValue),
    follow_up_required: Boolean(payload.follow_up_required),
  }

  return row
}

async function selectSessionsForPractitioner(practitionerId: string, athleteId?: string) {
  const buildQuery = (selectExpr: string) => {
    let query = supabase
      .from('sessions')
      .select(selectExpr)
      .eq('practitioner_id', practitionerId)
      .order('scheduled_at', { ascending: false })

    if (athleteId) {
      query = query.eq('athlete_id', athleteId)
    }

    return query
  }

  let { data, error } = await buildQuery(SESSION_SELECT_PRIMARY)
  if (error && /risk_level/i.test(error.message ?? '')) {
    ;({ data, error } = await buildQuery(SESSION_SELECT_FALLBACK))
  }

  if (error) throw error
  return (data ?? []) as unknown as Session[]
}

async function insertSessionRow(row: Record<string, unknown>) {
  const nextRow = { ...row }
  const removedColumns = new Set<string>()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from('sessions').insert(nextRow).select().single()
    if (!error) return data as Session

    const message = error.message ?? ''
    const match = message.match(SESSION_MISSING_COLUMN_REGEX)
    const missingColumn = match?.[1] ?? match?.[2]

    if (missingColumn === 'homework' && typeof nextRow.homework === 'string' && nextRow.homework.trim()) {
      const existingNotes = typeof nextRow.notes === 'string' ? nextRow.notes.trim() : ''
      nextRow.notes = existingNotes
        ? `${existingNotes}\n\nHomework / Between-session tasks:\n${String(nextRow.homework).trim()}`
        : `Homework / Between-session tasks:\n${String(nextRow.homework).trim()}`
    }

    if (missingColumn && missingColumn in nextRow && !removedColumns.has(missingColumn)) {
      delete nextRow[missingColumn]
      removedColumns.add(missingColumn)
      continue
    }

    throw error
  }

  throw new Error('Failed to save session after compatibility retries.')
}

async function updateSessionRow(id: string, row: Record<string, unknown>) {
  const nextRow = { ...row }
  const removedColumns = new Set<string>()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from('sessions').update(nextRow).eq('id', id).select().single()
    if (!error) return data as Session

    const message = error.message ?? ''
    const match = message.match(SESSION_MISSING_COLUMN_REGEX)
    const missingColumn = match?.[1] ?? match?.[2]

    if (missingColumn === 'homework' && typeof nextRow.homework === 'string' && nextRow.homework.trim()) {
      const existingNotes = typeof nextRow.notes === 'string' ? nextRow.notes.trim() : ''
      nextRow.notes = existingNotes
        ? `${existingNotes}\n\nHomework / Between-session tasks:\n${String(nextRow.homework).trim()}`
        : `Homework / Between-session tasks:\n${String(nextRow.homework).trim()}`
    }

    if (missingColumn && missingColumn in nextRow && !removedColumns.has(missingColumn)) {
      delete nextRow[missingColumn]
      removedColumns.add(missingColumn)
      continue
    }

    throw error
  }

  throw new Error('Failed to update session after compatibility retries.')
}

// ── Sessions ──────────────────────────────────────────────────
export function useSessions(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Session[]>({
    queryKey: ['sessions', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => selectSessionsForPractitioner(user!.id, athleteId),
  })
}

export function useCreateSession() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Session, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      const row = normalizeSessionPayload({ ...payload, practitioner_id: user!.id })
      return insertSessionRow(row)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useUpdateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Session> & { id: string }) => {
      const row = normalizeSessionPayload(payload)
      return updateSessionRow(id, row)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ── Check-Ins ─────────────────────────────────────────────────
export function useCheckIns(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<CheckIn[]>({
    queryKey: ['checkins', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('check_ins').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('checked_in_at', { ascending: false }).limit(100)
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as CheckIn[]
    },
  })
}

export function useCreateCheckIn() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<CheckIn, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase.from('check_ins').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as CheckIn
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checkins'] }),
  })
}

// ── Assessments ───────────────────────────────────────────────
export function useAssessments(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Assessment[]>({
    queryKey: ['assessments', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('assessments').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('administered_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as Assessment[]
    },
  })
}

export function useCreateAssessment() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Assessment, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase.from('assessments').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as Assessment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  })
}

// ── Interventions ─────────────────────────────────────────────
export function useInterventions(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Intervention[]>({
    queryKey: ['interventions', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('interventions').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as Intervention[]
    },
  })
}

export function useCreateIntervention() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Intervention, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      const normalizedPayload = {
        ...payload,
        rating: typeof payload.rating === 'number' && payload.rating > 0 ? payload.rating : null,
      }
      const { data, error } = await supabase.from('interventions').insert({ ...normalizedPayload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as Intervention
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  })
}

export function useUpdateIntervention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Intervention> & { id: string }) => {
      const normalizedPayload = {
        ...payload,
        rating:
          typeof payload.rating === 'number'
            ? payload.rating > 0
              ? payload.rating
              : null
            : payload.rating,
      }
      const { data, error } = await supabase.from('interventions').update(normalizedPayload).eq('id', id).select().single()
      if (error) throw error
      return data as Intervention
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  })
}
