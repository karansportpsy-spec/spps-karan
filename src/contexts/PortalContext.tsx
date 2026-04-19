// src/contexts/PortalContext.tsx
//
// v2 replacement for the old AthleteContext.
//
// Exposes athlete portal state: profile summary + active/archived practitioner
// links + unread notification count. Backed by the athlete_portal_summary()
// RPC which does the JOINs server-side (much faster than 3 separate queries).
//
// Used by: AthleteDashboard, MyPractitionersPage, and later phases for
// writing daily logs (needs the list of active links for the share selector).

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types (mirror the RPC's JSON return shape) ──────────────────────────────

export interface AthleteSelf {
  id:         string
  email:      string
  first_name: string
  last_name:  string
  status:     'unverified' | 'linked' | 'discontinued'
  uid_code:   string | null
  sport:      string | null
  timezone:   string
  language:   string
}

export interface ActiveLink {
  link_id:                   string
  status:                    'active'
  linked_at:                 string
  archived_at:               string | null
  practitioner_id:           string
  practitioner_first_name:   string
  practitioner_last_name:    string
  practitioner_email:        string
  practitioner_avatar:       string | null
  conversation_id:           string | null
  athlete_unread:            number | null
  last_message_at:           string | null
  last_message_preview:      string | null
}

export interface ArchivedLink {
  link_id:                 string
  status:                  'archived_by_practitioner' | 'archived_by_athlete'
  linked_at:               string
  archived_at:             string
  practitioner_id:         string
  practitioner_first_name: string
  practitioner_last_name:  string
  practitioner_email:      string
}

export interface PortalSummary {
  ok:                    true
  athlete:               AthleteSelf
  active_links:          ActiveLink[]
  archived_links:        ArchivedLink[]
  unread_notifications:  number
}

interface PortalContextValue {
  summary:        PortalSummary | null
  isLoading:      boolean
  isError:        boolean
  error:          string | null
  refresh:        () => Promise<void>

  // Convenience accessors
  activeLinks:    ActiveLink[]
  archivedLinks:  ArchivedLink[]
  totalUnread:    number     // messages + notifications
  unreadMessages: number
  unreadNotifications: number
  hasAnyActiveLink: boolean
}

const PortalContext = createContext<PortalContextValue | null>(null)

async function fetchPortalSummary(): Promise<PortalSummary | null> {
  const { data, error } = await supabase.rpc('athlete_portal_summary')
  if (error) {
    console.error('[PortalContext] athlete_portal_summary failed:', error.message)
    throw error
  }
  if (!data || (data as any).ok !== true) {
    return null
  }
  return data as PortalSummary
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user, role, loading: authLoading } = useAuth()
  const qc = useQueryClient()

  // Only fetch when we have a confirmed athlete user
  const enabled = !!user && role === 'athlete' && !authLoading

  const {
    data: summary = null,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['athlete_portal_summary', user?.id],
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: fetchPortalSummary,
  })

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['athlete_portal_summary'] })
    await refetch()
  }

  const value = useMemo<PortalContextValue>(() => {
    const activeLinks   = summary?.active_links   ?? []
    const archivedLinks = summary?.archived_links ?? []
    const unreadMessages = activeLinks.reduce(
      (sum, l) => sum + (l.athlete_unread ?? 0), 0
    )
    const unreadNotifications = summary?.unread_notifications ?? 0
    return {
      summary,
      isLoading: enabled && isLoading,
      isError,
      error: isError ? (error as Error)?.message ?? 'Failed to load portal' : null,
      refresh,
      activeLinks,
      archivedLinks,
      totalUnread: unreadMessages + unreadNotifications,
      unreadMessages,
      unreadNotifications,
      hasAnyActiveLink: activeLinks.length > 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, isLoading, isError, error, enabled])

  return (
    <PortalContext.Provider value={value}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used within <PortalProvider>')
  return ctx
}
