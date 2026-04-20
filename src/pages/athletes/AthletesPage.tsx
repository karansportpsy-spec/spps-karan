// src/pages/athletes/AthletesPage.tsx
//
// v2 REWRITE. In v1, this page let the practitioner CREATE athlete rows.
// That no longer exists in v2:
//
//   • Athletes own their accounts (Supabase Auth users).
//   • Practitioners only LINK to existing athletes, via LinkAthleteModal.
//   • Discontinuing a relationship = archiving a link (ArchiveLinkModal),
//     never deleting.
//
// Data source is PractitionerContext.activeLinks (backed by the
// practitioner_dashboard_summary RPC). No v1 hooks referenced.

import { useMemo, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Search, UserPlus, Archive, Users, MessageCircle,
  Filter, AlertCircle, RefreshCw, ChevronRight,
  MoreVertical, FileText, Calendar,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import {
  usePractitionerData,
  type PractitionerActiveLink,
} from '@/contexts/PractitionerContext'
import LinkAthleteModal   from '@/components/practitioner/LinkAthleteModal'
import ArchiveLinkModal   from '@/components/practitioner/ArchiveLinkModal'

export default function AthletesPage() {
  const navigate = useNavigate()
  const {
    activeLinks, archivedLinks, isLoading, isError, error, refresh,
  } = usePractitionerData()

  const [search, setSearch]         = useState('')
  const [sportFilter, setSportFilter] = useState<string>('')
  const [linkOpen, setLinkOpen]     = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<PractitionerActiveLink | null>(null)
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)

  // Derive sport options from active links
  const sportOptions = useMemo(() => {
    const set = new Set<string>()
    activeLinks.forEach(l => { if (l.athlete_sport) set.add(l.athlete_sport) })
    return Array.from(set).sort()
  }, [activeLinks])

  // Filter active links by search + sport
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activeLinks.filter(l => {
      if (sportFilter && l.athlete_sport !== sportFilter) return false
      if (!q) return true
      const name = `${l.athlete_first_name} ${l.athlete_last_name}`.toLowerCase()
      return (
        name.includes(q) ||
        l.athlete_email.toLowerCase().includes(q) ||
        (l.athlete_uid?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [activeLinks, search, sportFilter])

  return (
    <AppShell>
      {/* ── Header row ────────────────────────────────────────────── */}
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Athletes</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
              {activeLinks.length}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            People you're actively linked to. Archived athletes are kept
            separately under{' '}
            <RouterLink to="/athletes/archived" className="text-blue-600 hover:underline font-medium">
              Archived
            </RouterLink>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {archivedLinks.length > 0 && (
            <RouterLink
              to="/athletes/archived"
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
            >
              <Archive size={14} />
              Archived · {archivedLinks.length}
            </RouterLink>
          )}
          <button
            onClick={() => setLinkOpen(true)}
            className="inline-flex items-center gap-2 bg-gradient-spps text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <UserPlus size={15} />
            Link athlete
          </button>
        </div>
      </header>

      {/* ── Error banner ──────────────────────────────────────────── */}
      {isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-800">Couldn't load your athletes</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
            <button
              onClick={refresh}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800"
            >
              <RefreshCw size={11} /> Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Search + filter bar ───────────────────────────────────── */}
      {activeLinks.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or UID"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {sportOptions.length > 0 && (
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={sportFilter}
                onChange={e => setSportFilter(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="">All sports</option>
                {sportOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── Loading state ────────────────────────────────────────── */}
      {isLoading && activeLinks.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!isLoading && activeLinks.length === 0 && !isError && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            No active athletes
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto mb-6">
            In v2, athletes sign up themselves at{' '}
            <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">/athlete/signup</span>.
            Once they create an account, link to them by email to start messaging,
            schedule sessions, and review their daily logs.
          </p>
          <button
            onClick={() => setLinkOpen(true)}
            className="inline-flex items-center gap-2 bg-gradient-spps text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <UserPlus size={15} />
            Link your first athlete
          </button>
          {archivedLinks.length > 0 && (
            <p className="mt-6 text-xs text-gray-500">
              You have {archivedLinks.length} archived athlete
              {archivedLinks.length > 1 ? 's' : ''} —{' '}
              <RouterLink to="/athletes/archived" className="text-blue-600 hover:underline font-medium">
                view archived
              </RouterLink>
            </p>
          )}
        </div>
      )}

      {/* ── No-results after filter ──────────────────────────────── */}
      {activeLinks.length > 0 && filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <Search size={22} className="text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 mb-1">No matches</p>
          <p className="text-xs text-gray-500">
            Try a different search term or clear the sport filter.
          </p>
        </div>
      )}

      {/* ── Athlete grid ─────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(link => (
            <AthleteLinkCard
              key={link.link_id}
              link={link}
              menuOpen={menuOpenFor === link.link_id}
              onToggleMenu={() => setMenuOpenFor(prev => prev === link.link_id ? null : link.link_id)}
              onOpenCase={() => navigate(`/athletes/${link.athlete_id}/case`)}
              onMessage={() => navigate('/chat')}
              onArchive={() => {
                setMenuOpenFor(null)
                setArchiveTarget(link)
              }}
            />
          ))}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      <LinkAthleteModal open={linkOpen} onClose={() => setLinkOpen(false)} />
      <ArchiveLinkModal
        open={archiveTarget !== null}
        linkId={archiveTarget?.link_id ?? null}
        athleteName={archiveTarget
          ? `${archiveTarget.athlete_first_name} ${archiveTarget.athlete_last_name}`.trim() || 'the athlete'
          : ''}
        onClose={() => setArchiveTarget(null)}
      />
    </AppShell>
  )
}

// ── Athlete card ──────────────────────────────────────────────────────────

function AthleteLinkCard({
  link, menuOpen, onToggleMenu, onOpenCase, onMessage, onArchive,
}: {
  link:         PractitionerActiveLink
  menuOpen:     boolean
  onToggleMenu: () => void
  onOpenCase:   () => void
  onMessage:    () => void
  onArchive:    () => void
}) {
  const fullName = `${link.athlete_first_name} ${link.athlete_last_name}`.trim() || 'Athlete'
  const initials = `${link.athlete_first_name?.[0] ?? ''}${link.athlete_last_name?.[0] ?? ''}`.toUpperCase() || 'A'
  const unread   = link.practitioner_unread ?? 0
  const linkedDate = new Date(link.linked_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-sm transition-all relative">
      {/* Overflow menu */}
      <div className="absolute top-3 right-3">
        <button
          onClick={onToggleMenu}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="More actions"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <>
            {/* Backdrop to close on outside click */}
            <div className="fixed inset-0 z-10" onClick={onToggleMenu} />
            <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              <button
                onClick={onArchive}
                className="w-full px-3 py-2 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-2"
              >
                <Archive size={12} />
                Archive link
              </button>
            </div>
          </>
        )}
      </div>

      {/* Body — clickable to case page */}
      <button
        onClick={onOpenCase}
        className="w-full text-left pr-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
              {unread > 0 && (
                <span className="min-w-[18px] h-4 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">
              {link.athlete_sport || 'Sport not set'}
              {link.athlete_uid && (
                <span className="ml-2 font-mono text-[10px] text-gray-400">
                  {link.athlete_uid}
                </span>
              )}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Linked {linkedDate}
            </p>
          </div>
        </div>
      </button>

      {/* Footer action bar */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1">
        <button
          onClick={onOpenCase}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <FileText size={12} />
          Case
        </button>
        <button
          onClick={onMessage}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <MessageCircle size={12} />
          Message
        </button>
        <button
          onClick={onOpenCase}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <Calendar size={12} />
          Sessions
          <ChevronRight size={10} className="text-gray-400" />
        </button>
      </div>
    </div>
  )
}
