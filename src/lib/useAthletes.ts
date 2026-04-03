// src/hooks/useAthletes.ts
// Fetches athletes and guarantees every record has a uid_code.
// Primary source of truth is the DB trigger (uid_autoassign_migration.sql).
// This hook is the client-side safety net that catches any records that slipped
// through (e.g. athletes created before the trigger was applied).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ensureAthleteUID, needsUID, generateAthleteUID } from '@/lib/athleteUID'
import type { Athlete } from '@/types'

// ── Query key ─────────────────────────────────────────────────────────────────

const ATHLETES_KEY = 'athletes'

// ── Fetch + backfill ──────────────────────────────────────────────────────────

export function useAthletes() {
  const { user } = useAuth()

  return useQuery<Athlete[]>({
    queryKey: [ATHLETES_KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      const athletes = (data ?? []) as Athlete[]

      // ── UID backfill ────────────────────────────────────────────────────────
      // Find any athletes that somehow don't have a uid_code yet.
      // This should be 0 rows once the DB trigger is active, but handles
      // legacy records and any edge cases gracefully.
      const missing = athletes.filter(a => needsUID(a))

      if (missing.length > 0) {
        // Fire backfills in parallel; don't block the return
        await Promise.allSettled(missing.map(a => ensureAthleteUID(a)))

        // Re-fetch the updated records so the UI sees fresh UIDs immediately
        const { data: refreshed } = await supabase
          .from('athletes')
          .select('*')
          .eq('practitioner_id', user!.id)
          .order('created_at', { ascending: false })

        return (refreshed ?? athletes) as Athlete[]
      }

      return athletes
    },
    // Stale after 2 min — UIDs don't change so no need to re-fetch constantly
    staleTime: 2 * 60 * 1000,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateAthlete() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Omit<Athlete, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      // Always inject a UID before the INSERT so it's guaranteed to be present
      // even if the DB trigger fires a millisecond late or is somehow absent.
      const uid_code = payload.uid_code && payload.uid_code.trim() !== ''
        ? payload.uid_code
        : generateAthleteUID()

      const { data, error } = await supabase
        .from('athletes')
        .insert({ ...payload, uid_code, practitioner_id: user!.id })
        .select()
        .single()

      if (error) {
        // Handle the rare case where client-generated UID collides with DB
        if (error.code === '23505' && error.message.includes('uid_code')) {
          // Retry with a new UID
          const retryUid = generateAthleteUID()
          const { data: retryData, error: retryError } = await supabase
            .from('athletes')
            .insert({ ...payload, uid_code: retryUid, practitioner_id: user!.id })
            .select()
            .single()
          if (retryError) throw retryError
          return retryData as Athlete
        }
        throw error
      }

      return data as Athlete
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ATHLETES_KEY] }),
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateAthlete() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Athlete> & { id: string }) => {
      // Never allow uid_code to be blanked out via an update
      if ('uid_code' in payload && (!payload.uid_code || payload.uid_code.trim() === '')) {
        delete payload.uid_code
      }

      const { data, error } = await supabase
        .from('athletes')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Athlete
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ATHLETES_KEY] }),
  })
}
