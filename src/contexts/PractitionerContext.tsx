import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { shouldFallbackToDirectDb } from '@/lib/apiFallback'
import { useAuth } from '@/contexts/AuthContext'

export interface PractitionerActiveLink {
  link_id: string
  linked_at: string
  athlete_id: string
  athlete_first_name: string
  athlete_last_name: string
  athlete_email: string
  athlete_sport: string | null
  athlete_uid: string | null
  conversation_id: string | null
  practitioner_unread: number | null
  last_message_at: string | null
  last_message_preview: string | null
}

export interface PractitionerArchivedLink {
  link_id: string
  status: 'archived_by_practitioner' | 'archived_by_athlete'
  linked_at: string
  archived_at: string
  archived_reason: string | null
  athlete_id: string
  athlete_first_name: string
  athlete_last_name: string
  athlete_email: string
}

export interface PractitionerSummary {
  ok: true
  active_links: PractitionerActiveLink[]
  archived_links: PractitionerArchivedLink[]
  unread_messages: number
  unread_notifications: number
}

interface PractitionerContextValue {
  summary: PractitionerSummary | null
  isLoading: boolean
  isError: boolean
  error: string | null
  refresh: () => Promise<void>
  activeLinks: PractitionerActiveLink[]
  archivedLinks: PractitionerArchivedLink[]
  totalUnread: number
  unreadMessages: number
  unreadNotifications: number
  athleteCount: number
}

interface LinkRow {
  id: string
  athlete_id: string
  linked_at: string
  status: string
  archived_at: string | null
  archived_reason: string | null
}

interface AthleteRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  sport: string | null
  uid_code: string | null
  created_at: string | null
  updated_at: string | null
}

const PractitionerContext = createContext<PractitionerContextValue | null>(null)

function mapLegacyAthleteToActiveLink(row: AthleteRow): PractitionerActiveLink {
  return {
    link_id: `legacy-${row.id}`,
    linked_at: row.created_at ?? new Date().toISOString(),
    athlete_id: row.id,
    athlete_first_name: row.first_name ?? '',
    athlete_last_name: row.last_name ?? '',
    athlete_email: row.email ?? '',
    athlete_sport: row.sport ?? null,
    athlete_uid: row.uid_code ?? null,
    conversation_id: null,
    practitioner_unread: 0,
    last_message_at: null,
    last_message_preview: null,
  }
}

function mapLinkToActiveLink(row: LinkRow, athlete: AthleteRow | undefined): PractitionerActiveLink | null {
  if (!athlete) return null

  return {
    link_id: row.id,
    linked_at: row.linked_at,
    athlete_id: row.athlete_id,
    athlete_first_name: athlete.first_name ?? '',
    athlete_last_name: athlete.last_name ?? '',
    athlete_email: athlete.email ?? '',
    athlete_sport: athlete.sport ?? null,
    athlete_uid: athlete.uid_code ?? null,
    conversation_id: null,
    practitioner_unread: 0,
    last_message_at: null,
    last_message_preview: null,
  }
}

function mapLinkToArchivedLink(row: LinkRow, athlete: AthleteRow | undefined): PractitionerArchivedLink | null {
  if (!athlete || !row.archived_at) return null

  return {
    link_id: row.id,
    status:
      row.status === 'archived_by_athlete'
        ? 'archived_by_athlete'
        : 'archived_by_practitioner',
    linked_at: row.linked_at,
    archived_at: row.archived_at,
    archived_reason: row.archived_reason,
    athlete_id: row.athlete_id,
    athlete_first_name: athlete.first_name ?? '',
    athlete_last_name: athlete.last_name ?? '',
    athlete_email: athlete.email ?? '',
  }
}

async function fetchUnreadMessages(practitionerId: string) {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', practitionerId)
    .eq('receiver_role', 'practitioner')
    .eq('is_read', false)

  if (error) {
    return 0
  }

  return count ?? 0
}

async function fetchPractitionerSummaryDirect(practitionerId: string): Promise<PractitionerSummary> {
  const { data: linkData, error: linkError } = await supabase
    .from('practitioner_athlete_links')
    .select('id, athlete_id, linked_at, status, archived_at, archived_reason')
    .eq('practitioner_id', practitionerId)
    .order('linked_at', { ascending: false })

  if (linkError) {
    const { data: legacyData, error: legacyError } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, email, sport, uid_code, created_at, updated_at')
      .eq('practitioner_id', practitionerId)
      .order('first_name')

    if (legacyError) throw legacyError

    const unreadMessages = await fetchUnreadMessages(practitionerId)
    return {
      ok: true,
      active_links: ((legacyData ?? []) as AthleteRow[]).map(mapLegacyAthleteToActiveLink),
      archived_links: [],
      unread_messages: unreadMessages,
      unread_notifications: 0,
    }
  }

  const links = (linkData ?? []) as LinkRow[]
  const athleteIds = Array.from(new Set(links.map(link => link.athlete_id).filter(Boolean)))

  let athleteById = new Map<string, AthleteRow>()
  if (athleteIds.length > 0) {
    const { data: athleteData, error: athleteError } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, email, sport, uid_code, created_at, updated_at')
      .in('id', athleteIds)

    if (athleteError) throw athleteError

    athleteById = new Map(((athleteData ?? []) as AthleteRow[]).map(athlete => [athlete.id, athlete]))
  }

  const unreadMessages = await fetchUnreadMessages(practitionerId)

  return {
    ok: true,
    active_links: links
      .filter(link => link.status === 'active')
      .map(link => mapLinkToActiveLink(link, athleteById.get(link.athlete_id)))
      .filter((link): link is PractitionerActiveLink => link !== null),
    archived_links: links
      .filter(link => link.status !== 'active')
      .map(link => mapLinkToArchivedLink(link, athleteById.get(link.athlete_id)))
      .filter((link): link is PractitionerArchivedLink => link !== null),
    unread_messages: unreadMessages,
    unread_notifications: 0,
  }
}

async function fetchPractitionerSummary(practitionerId: string): Promise<PractitionerSummary | null> {
  const { data, error } = await supabase.rpc('practitioner_dashboard_summary')

  if (!error) {
    if (!data || (data as any).ok !== true) {
      return null
    }
    return data as PractitionerSummary
  }

  if (!shouldFallbackToDirectDb(error)) {
    console.error('[PractitionerContext] practitioner_dashboard_summary failed:', error.message)
    throw error
  }

  console.warn('[PractitionerContext] Falling back to direct practitioner summary:', error.message)
  return fetchPractitionerSummaryDirect(practitionerId)
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
    refetchOnWindowFocus: false,
    queryFn: () => fetchPractitionerSummary(user!.id),
  })

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['practitioner_dashboard_summary'] })
    await refetch()
  }

  useEffect(() => {
    if (!enabled || !user?.id) return

    const invalidateSummary = () => {
      void qc.invalidateQueries({ queryKey: ['practitioner_dashboard_summary', user.id] })
    }

    const channel = supabase
      .channel(`practitioner-sync:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practitioner_athlete_links',
          filter: `practitioner_id=eq.${user.id}`,
        },
        invalidateSummary
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'athlete_intake_submissions',
          filter: `practitioner_id=eq.${user.id}`,
        },
        invalidateSummary
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, qc, user?.id])

  const value = useMemo<PractitionerContextValue>(() => {
    const activeLinks = summary?.active_links ?? []
    const archivedLinks = summary?.archived_links ?? []
    const unreadMessages = summary?.unread_messages ?? 0
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
