// src/contexts/PractitionerContext.tsx
//
// v2 practitioner-side state container. Mirror of PortalContext.
//
// Wraps the `practitioner_dashboard_summary()` RPC so every practitioner page
// reads consistent dashboard data (active links + archived links + unread
// counters) from a single source. React Query handles caching + invalidation.
//
// Used by: Dashboard.tsx, AthletesPage.tsx, ArchivedAthletesPage.tsx,
// LinkAthleteModal.tsx (post-link refresh), and any per-link feature pages
// added in later phases.

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types (mirror the RPC's JSON return shape) ──────────────────────────────

export interface PractitionerActiveLink {
  link_id:                 string
  linked_at:               string
  athlete_id:              string
  athlete_first_name:      string
  athlete_last_name:       string
  athlete_email:           string
  athlete_sport:           string | null
  athlete_uid:             string | null
  conversation_id:         string | null
  practitioner_unread:     number | null
  last_message_at:         string | null
  last_message_preview:    string | null
}

export interface PractitionerArchivedLink {
  link_id:                 string
  status:                  'archived_by_practitioner' | 'archived_by_athlete'
  linked_at:               string
  archived_at:             string
  archived_reason:         string | null
  athlete_id:              string
  athlete_first_name:      string
  athlete_last_name:       string
  athlete_email:           string
}

export interface PractitionerSummary {
  ok:                    true
  active_links:          PractitionerActiveLink[]
  archived_links:        PractitionerArchivedLink[]
  unread_messages:       number
  unread_notifications:  number
}

interface PractitionerContextValue {
  summary:        PractitionerSummary | null
  isLoading:      boolean
  isError:        boolean
  error:          string | null
  refresh:        () => Promise<void>

  // Convenience accessors
  activeLinks:    PractitionerActiveLink[]
  archivedLinks:  PractitionerArchivedLink[]
  totalUnread:    number     // messages + notifications
  unreadMessages: number
  unreadNotifications: number
  athleteCount:   number     // active links count
}

const PractitionerContext = createContext<PractitionerContextValue | null>(null)

async function fetchPractitionerSummary(): Promise<PractitionerSummary | null> {
  const { data, error } = await supabase.rpc('practitioner_dashboard_summary')
  if (error) {
    console.error('[PractitionerContext] practitioner_dashboard_summary failed:', error.message)
    throw error
  }
  if (!data || (data as any).ok !== true) {
    return null
  }
  return data as PractitionerSummary
}

export function PractitionerProvider({ children }: { children: ReactNode }) {
  const { user, role, loading: authLoading } = useAuth()
  const qc = useQueryClient()

  const enabled = !!user && role === 'practitioner' && !authLoading

  const {
    data: summary = null,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['practitioner_dashboard_summary', user?.id],
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: fetchPractitionerSummary,
  })

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['practitioner_dashboard_summary'] })
    await refetch()
  }

  const value = useMemo<PractitionerContextValue>(() => {
    const activeLinks   = summary?.active_links   ?? []
    const archivedLinks = summary?.archived_links ?? []
    const unreadMessages      = summary?.unread_messages      ?? 0
    const unreadNotifications = summary?.unread_notifications ?? 0
    return {
      summary,
      isLoading: enabled && isLoading,
      isError,
      error: isError ? (error as Error)?.message ?? 'Failed to load dashboard' : null,
      refresh,
      activeLinks,
      archivedLinks,
      totalUnread: unreadMessages + unreadNotifications,
      unreadMessages,
      unreadNotifications,
      athleteCount: activeLinks.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, isLoading, isError, error, enabled])

  return (
    <PractitionerContext.Provider value={value}>
      {children}
    </PractitionerContext.Provider>
  )
}

export function usePractitionerData() {
  const ctx = useContext(PractitionerContext)
  if (!ctx) throw new Error('usePractitionerData must be used within <PractitionerProvider>')
  return ctx
}
