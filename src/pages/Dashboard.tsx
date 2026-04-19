// src/pages/Dashboard.tsx
//
// v2 practitioner dashboard.
//
// Driven entirely by PractitionerContext (one RPC call → links + counters).
// Charts and trend analytics from the v1 dashboard come back in later phases
// once enough v2-shaped data flows (sessions, daily logs, etc.).
//
// States:
//   • loading
//   • error
//   • empty (no linked athletes yet)
//   • populated (active links + quick actions)

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UserPlus, Users, Archive, MessageCircle, Bell, Sparkles,
  AlertCircle, RefreshCw, ChevronRight, Calendar,
  ClipboardList, FlaskConical,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Card } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  usePractitionerData,
  type PractitionerActiveLink,
} from '@/contexts/PractitionerContext'
import LinkAthleteModal from '@/components/practitioner/LinkAthleteModal'

export default function DashboardPage() {
  const { practitioner } = useAuth()
  const {
    summary, isLoading, isError, error, refresh,
    activeLinks, archivedLinks,
    unreadMessages, unreadNotifications, athleteCount,
  } = usePractitionerData()

  const [linkOpen, setLinkOpen] = useState(false)

  const greeting = practitioner?.first_name
    ? `Welcome back, Dr ${practitioner.first_name}`
    : 'Welcome back'

  return (
    <AppShell>
      {/* ── Header row ───────────────────────────────────────────────── */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{greeting}</h1>
          <p className="text-sm text-gray-500">
            Manage your linked athletes and recent activity.
          </p>
        </div>
        <button
          onClick={() => setLinkOpen(true)}
          className="inline-flex items-center gap-2 bg-gradient-spps text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <UserPlus size={16} />
          Link athlete
        </button>
      </header>

      {/* ── Error state ──────────────────────────────────────────────── */}
      {isError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Couldn't load your dashboard</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800"
            >
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────── */}
      {isLoading && !summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      )}

      {/* ── Loaded states ────────────────────────────────────────────── */}
      {summary && (
        <>
          {/* Stat row */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <StatTile
              label="Active athletes"
              value={athleteCount}
              icon={Users}
              accent="blue"
              href="/athletes"
            />
            <StatTile
              label="Unread messages"
              value={unreadMessages}
              icon={MessageCircle}
              accent="violet"
              href="/chat"
              dim={unreadMessages === 0}
            />
            <StatTile
              label="Notifications"
              value={unreadNotifications}
              icon={Bell}
              accent="amber"
              dim={unreadNotifications === 0}
            />
          </section>

          {/* Empty state */}
          {athleteCount === 0 && archivedLinks.length === 0 && (
            <EmptyDashboard onLinkClick={() => setLinkOpen(true)} />
          )}

          {/* Active athletes section */}
          {athleteCount > 0 && (
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  Your athletes ({athleteCount})
                </h2>
                <Link
                  to="/athletes"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                >
                  View all <ChevronRight size={12} />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeLinks.slice(0, 6).map(link => (
                  <AthleteLinkCard key={link.link_id} link={link} />
                ))}
              </div>
              {activeLinks.length > 6 && (
                <div className="mt-3 text-center">
                  <Link
                    to="/athletes"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    See {activeLinks.length - 6} more
                    <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* Archived link card if any */}
          {archivedLinks.length > 0 && (
            <section className="mb-6">
              <Link
                to="/athletes/archived"
                className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Archive size={16} className="text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {archivedLinks.length} archived athlete
                      {archivedLinks.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-500">View historical records</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </Link>
            </section>
          )}

          {/* Quick actions */}
          {athleteCount > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Quick actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ActionTile href="/sessions"     Icon={Calendar}      label="Sessions"     />
                <ActionTile href="/assessments"  Icon={ClipboardList} label="Assessments"  />
                <ActionTile href="/programs"     Icon={Sparkles}      label="Programs"     />
                <ActionTile href="/lab"          Icon={FlaskConical}  label="Lab"          />
              </div>
            </section>
          )}

          {/* Phase 4 transition note */}
          <section className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-blue-700" />
            </div>
            <div className="flex-1 text-xs text-blue-900">
              <p className="font-semibold mb-1">v2 in progress</p>
              <p>
                Trend charts, risk breakdowns, and per-link analytics are being
                rebuilt to match the new silo data model. Linking, messaging,
                and session management are functional now.
              </p>
            </div>
          </section>
        </>
      )}

      {/* Modal */}
      <LinkAthleteModal open={linkOpen} onClose={() => setLinkOpen(false)} />
    </AppShell>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatTile({
  label, value, icon: Icon, accent, href, dim,
}: {
  label: string
  value: number
  icon: React.ElementType
  accent: 'blue' | 'violet' | 'amber'
  href?: string
  dim?: boolean
}) {
  const accentBg   = { blue: 'bg-blue-50', violet: 'bg-violet-50', amber: 'bg-amber-50' }[accent]
  const accentText = { blue: 'text-blue-600', violet: 'text-violet-600', amber: 'text-amber-600' }[accent]

  const content = (
    <div className={`bg-white border border-gray-200 rounded-2xl p-4 ${dim ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${accentBg} flex items-center justify-center`}>
          <Icon size={13} className={accentText} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )

  return href ? <Link to={href} className="block hover:no-underline">{content}</Link> : content
}

function AthleteLinkCard({ link }: { link: PractitionerActiveLink }) {
  const fullName = `${link.athlete_first_name} ${link.athlete_last_name}`.trim() || 'Athlete'
  const initials = `${link.athlete_first_name?.[0] ?? ''}${link.athlete_last_name?.[0] ?? ''}`.toUpperCase() || 'A'
  const unread = link.practitioner_unread ?? 0

  return (
    <Link
      to={`/athletes/${link.athlete_id}/case`}
      className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
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
              <span className="ml-2 font-mono text-[10px] text-gray-400">{link.athlete_uid}</span>
            )}
          </p>
          {link.last_message_preview ? (
            <p className="text-xs text-gray-600 mt-2 line-clamp-2">
              {link.last_message_preview}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic mt-2">No messages yet</p>
          )}
        </div>
      </div>
    </Link>
  )
}

function ActionTile({
  href, Icon, label,
}: {
  href: string
  Icon: React.ElementType
  label: string
}) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <Icon size={22} className="text-gray-600" />
      <span className="text-xs font-semibold text-gray-700">{label}</span>
    </Link>
  )
}

function EmptyDashboard({ onLinkClick }: { onLinkClick: () => void }) {
  return (
    <Card className="p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
        <UserPlus size={24} className="text-blue-600" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">
        No athletes linked yet
      </h2>
      <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">
        Athletes sign up themselves at <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">/athlete/signup</span>.
        Once they have an account, link to them by email and you'll be able
        to message them, schedule sessions, and review their daily logs.
      </p>
      <button
        onClick={onLinkClick}
        className="inline-flex items-center gap-2 bg-gradient-spps text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <UserPlus size={15} />
        Link your first athlete
      </button>
    </Card>
  )
}
