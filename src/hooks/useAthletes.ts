// src/hooks/useAthletes.ts
//
// v2 TRANSITION SHIM for the v1 useAthletes hook surface.
//
// In v1, "athletes" were rows owned by the practitioner. The hook returned
// `Athlete[]` filtered by `athletes.practitioner_id = my_id`.
//
// In v2:
//   * The `athletes` table is auth-backed (PK = auth.users.id, no
//     practitioner_id column).
//   * Practitioner-athlete relationship is via `practitioner_athlete_links`.
//   * Practitioners can no longer CREATE athletes; they only LINK to existing
//     athletes.
//
// To keep all v1 pages compiling without touching them yet, this shim:
//   * Reads active links + joined athlete rows
//   * Maps each result into the v1 Athlete shape with safe defaults
//   * Keeps create/update/delete as no-op stubs
//
// Additionally, for legacy environments not yet migrated to link-table schema,
// this hook falls back to reading `athletes.practitioner_id`.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Athlete } from '@/types'

const warned = new Set<string>()
function warnOnce(method: string) {
  if (warned.has(method)) return
  warned.add(method)
  console.warn(
    `[v2 transition] ${method}() is a no-op. ` +
      `Practitioners cannot create/edit athlete records directly in v2 and should use linking flows.`
  )
}

interface LinkRow {
  id: string
  linked_at: string
  athlete: {
    id: string
    first_name: string
    last_name: string
    email: string
    sport: string | null
    team: string | null
    uid_code: string | null
    avatar_url: string | null
    created_at: string
    updated_at: string
  } | null
}

function shapeV1(row: LinkRow, practitionerId: string): Athlete | null {
  if (!row.athlete) return null
  const a = row.athlete
  return {
    id: a.id,
    practitioner_id: practitionerId,
    first_name: a.first_name ?? '',
    last_name: a.last_name ?? '',
    email: a.email,
    phone: undefined,
    date_of_birth: undefined,
    sport: a.sport ?? '',
    team: a.team ?? undefined,
    position: undefined,
    status: 'active',
    risk_level: 'low',
    avatar_url: a.avatar_url ?? undefined,
    notes: undefined,
    emergency_contact_name: undefined,
    emergency_contact_phone: undefined,
    is_portal_activated: true,
    portal_activated_at: a.created_at,
    portal_user_id: a.id,
    uid_code: a.uid_code ?? undefined,
    age_group: undefined,
    created_at: row.linked_at,
    updated_at: a.updated_at,
  }
}

export function useAthletes() {
  const { user } = useAuth()
  return useQuery<Athlete[]>({
    queryKey: ['athletes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioner_athlete_links')
        .select(`
          id,
          linked_at,
          athlete:athletes (
            id, first_name, last_name, email, sport, team,
            uid_code, avatar_url, created_at, updated_at
          )
        `)
        .eq('practitioner_id', user!.id)
        .eq('status', 'active')
        .order('linked_at', { ascending: false })

      if (!error) {
        const rows = (data as unknown as LinkRow[]) ?? []
        return rows
          .map(r => shapeV1(r, user!.id))
          .filter((a): a is Athlete => a !== null)
      }

      if (error.code === '42P01' || error.code === '42703') {
        const { data: legacy, error: legacyErr } = await supabase
          .from('athletes')
          .select('*')
          .eq('practitioner_id', user!.id)
          .order('first_name')
        if (legacyErr) throw legacyErr
        return (legacy || []) as Athlete[]
      }

      throw error
    },
  })
}

export function useCreateAthlete() {
  const _qc = useQueryClient()
  void _qc
  return {
    mutate: (_payload: any, _opts?: any) => {
      warnOnce('useCreateAthlete.mutate')
    },
    mutateAsync: async (_payload: any): Promise<Athlete | null> => {
      warnOnce('useCreateAthlete.mutateAsync')
      return null
    },
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as Error | null,
    reset: () => {},
    data: null as Athlete | null,
  }
}

export function useUpdateAthlete() {
  return {
    mutate: (_payload: any, _opts?: any) => {
      warnOnce('useUpdateAthlete.mutate')
    },
    mutateAsync: async (_payload: any): Promise<Athlete | null> => {
      warnOnce('useUpdateAthlete.mutateAsync')
      return null
    },
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as Error | null,
    reset: () => {},
    data: null as Athlete | null,
  }
}

export function useDeleteAthlete() {
  return {
    mutate: (_id: string, _opts?: any) => {
      warnOnce('useDeleteAthlete.mutate')
    },
    mutateAsync: async (_id: string): Promise<void> => {
      warnOnce('useDeleteAthlete.mutateAsync')
    },
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as Error | null,
    reset: () => {},
    data: undefined as void | undefined,
  }
}
