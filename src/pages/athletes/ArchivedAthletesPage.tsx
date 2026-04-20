// src/pages/athletes/ArchivedAthletesPage.tsx
//
// Read-only view of the practitioner's archived athlete relationships.
// Data source: PractitionerContext.archivedLinks (backed by the
// practitioner_dashboard_summary RPC).
//
// No writes happen on this page — archived links are kept for compliance
// retention. To reconnect with an archived athlete, the practitioner uses
// LinkAthleteModal (which creates a new active link; the old archived
// row stays as historical record).

import { useMemo, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  ArrowLeft, Archive, Search, AlertCircle, RefreshCw,
  Calendar, User, UserX, FileText,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import {
  usePractitionerData,
  type PractitionerArchivedLink,
} from '@/contexts/PractitionerContext'

export default function ArchivedAthletesPage() {
  const navigate = useNavigate()
  const {
    archivedLinks, isLoading, isError, error, refresh,
  } = usePractitionerData()

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return archivedLinks
    return archivedLinks.filter(l => {
      const name = `${l.athlete_first_name} ${l.athlete_last_name}`.toLowerCase()
      return name.includes(q) || l.athlete_email.toLowerCase().includes(q)
    })
  }, [archivedLinks, search])

  return (
    <AppShell>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="mb-5">
        <RouterLink
          to="/athletes"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft size={13} />
          Back to active athletes
        </RouterLink>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Archived Athletes</h1>
          <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-full">
            {archivedLinks.length}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Historical relationships that have been discontinued by either party.
          All data is read-only and retained per DPDP / PsyCouncil guidance.
        </p>
      </header>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-800">Couldn't load archived athletes</p>
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

      {/* ── Search bar ──────────────────────────────────────────── */}
      {archivedLinks.length > 3 && (
        <div className="mb-4 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search archived athletes"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* ── Loading state ────────────────────────────────────────── */}
      {isLoading && archivedLinks.length === 0 && (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!isLoading && archivedLinks.length === 0 && !isError && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Archive size={24} className="text-gray-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            No archived athletes
          </h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            When a practitioner-athlete relationship ends, it moves here
            automatically. Nothing to show yet.
          </p>
        </div>
      )}

      {/* ── No-results after filter ──────────────────────────────── */}
      {archivedLinks.length > 0 && filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <Search size={22} className="text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 mb-1">No matches</p>
          <p className="text-xs text-gray-500">Try a different search term.</p>
        </div>
      )}

      {/* ── Archived list ────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(link => (
            <ArchivedRow
              key={link.link_id}
              link={link}
              onOpen={() => navigate(`/athletes/${link.athlete_id}/case`)}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}

// ── Archived row ──────────────────────────────────────────────────────────

function ArchivedRow({
  link, onOpen,
}: {
  link:    PractitionerArchivedLink
  onOpen:  () => void
}) {
  const fullName = `${link.athlete_first_name} ${link.athlete_last_name}`.trim() || 'Athlete'
  const initials = `${link.athlete_first_name?.[0] ?? ''}${link.athlete_last_name?.[0] ?? ''}`.toUpperCase() || 'A'
  const archivedBy =
    link.status === 'archived_by_practitioner' ? 'You archived' :
    link.status === 'archived_by_athlete'      ? 'Athlete discontinued' :
                                                 'Archived'
  const linkedDate   = new Date(link.linked_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const archivedDate = new Date(link.archived_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-300 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {fullName}
            </p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded-full shrink-0">
              {link.status === 'archived_by_practitioner' ? <User size={9} /> : <UserX size={9} />}
              {archivedBy}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{link.athlete_email}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Calendar size={10} />
              Linked {linkedDate}
            </span>
            <span className="inline-flex items-center gap-1">
              <Archive size={10} />
              Archived {archivedDate}
            </span>
          </div>
          {link.archived_reason && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
              <FileText size={11} className="mt-0.5 shrink-0 text-gray-400" />
              <span className="italic line-clamp-2">{link.archived_reason}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
