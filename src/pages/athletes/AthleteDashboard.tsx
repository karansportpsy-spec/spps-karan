// src/pages/athletes/AthleteDashboard.tsx
//
// v2 athlete dashboard.
//
// States:
//   • loading            — fetching portal summary
//   • unverified         — signed up but no practitioner has linked yet
//   • linked, no msgs    — has practitioners, no recent messages
//   • linked + messages  — has practitioners + new messages to show
//   • discontinued       — previously linked, all now archived
//
// Data source: usePortal() (v2) via the athlete_portal_summary RPC.

import { Link } from 'react-router-dom'
import {
  Target, Users, MessageCircle, BookOpen, ClipboardList,
  AlertCircle, Sparkles, Clock, ChevronRight, RefreshCw,
  CheckCircle2, UserX, Info,
} from 'lucide-react'
import AthletePortalShell from '@/components/athlete/AthletePortalShell'
import { usePortal, type ActiveLink } from '@/contexts/PortalContext'
import { useAuth } from '@/contexts/AuthContext'

export default function AthleteDashboard() {
  const { athlete } = useAuth()
  const { summary, isLoading, isError, error, refresh, activeLinks, archivedLinks } = usePortal()

  return (
    <AthletePortalShell>
      {/* ── Welcome header ─────────────────────────────────────────── */}
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Welcome{athlete?.first_name ? `, ${athlete.first_name}` : ''} 👋
        </h1>
        <p className="text-sm text-gray-600">
          {athlete?.uid_code && (
            <span className="inline-flex items-center gap-1 mr-2">
              <span className="font-mono text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                {athlete.uid_code}
              </span>
            </span>
          )}
          {athlete?.sport && <span>• {athlete.sport}</span>}
        </p>
      </section>

      {/* ── Error state ────────────────────────────────────────────── */}
      {isError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Couldn't load your portal</p>
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

      {/* ── Loading skeleton ───────────────────────────────────────── */}
      {isLoading && !summary && (
        <div className="space-y-4">
          <div className="h-32 bg-white/60 rounded-2xl animate-pulse" />
          <div className="h-48 bg-white/60 rounded-2xl animate-pulse" />
        </div>
      )}

      {/* ── Loaded states ──────────────────────────────────────────── */}
      {summary && (
        <>
          {/* Status card — varies by athlete.status */}
          {summary.athlete.status === 'unverified' && (
            <UnverifiedCard email={summary.athlete.email} />
          )}

          {summary.athlete.status === 'discontinued' && activeLinks.length === 0 && (
            <DiscontinuedCard />
          )}

          {/* Active practitioners (shown for linked OR previously-linked w/ no current actives) */}
          {activeLinks.length > 0 && (
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  Your Practitioners ({activeLinks.length})
                </h2>
                <Link
                  to="/athlete/practitioners"
                  className="text-xs font-medium text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
                >
                  Manage <ChevronRight size={12} />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeLinks.map(link => (
                  <PractitionerCard key={link.link_id} link={link} />
                ))}
              </div>
            </section>
          )}

          {/* Archived links badge (only if there are any) */}
          {archivedLinks.length > 0 && (
            <section className="mb-6">
              <Link
                to="/athlete/practitioners"
                className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <UserX size={16} className="text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {archivedLinks.length} past practitioner
                      {archivedLinks.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-500">View your history</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </Link>
            </section>
          )}

          {/* Quick actions grid */}
          {activeLinks.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Quick actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <QuickAction
                  href="/athlete/daily-log"
                  Icon={BookOpen}
                  label="Daily log"
                  colorClass="bg-blue-50 text-blue-700 border-blue-100 hover:border-blue-200"
                />
                <QuickAction
                  href="/athlete/journal"
                  Icon={Sparkles}
                  label="Journal"
                  colorClass="bg-purple-50 text-purple-700 border-purple-100 hover:border-purple-200"
                />
                <QuickAction
                  href="/athlete/messages"
                  Icon={MessageCircle}
                  label="Messages"
                  colorClass="bg-teal-50 text-teal-700 border-teal-100 hover:border-teal-200"
                />
                <QuickAction
                  href="/athlete/programs"
                  Icon={ClipboardList}
                  label="Programs"
                  colorClass="bg-amber-50 text-amber-700 border-amber-100 hover:border-amber-200"
                />
              </div>
            </section>
          )}

          {/* Phase 3 notice: further features coming */}
          <section className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
            <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-gray-600">
              <p className="font-semibold text-gray-700 mb-1">What's next</p>
              <p>
                Daily logs, journals, messaging, and programs are being added in
                the next releases. For now, you can see your practitioners and
                manage your connections here.
              </p>
            </div>
          </section>
        </>
      )}
    </AthletePortalShell>
  )
}

// ── Status cards ───────────────────────────────────────────────────────────

function UnverifiedCard({ email }: { email: string }) {
  return (
    <section className="mb-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Clock size={18} className="text-amber-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-amber-900 mb-1">
            Waiting for your practitioner to link you
          </h2>
          <p className="text-sm text-amber-800 mb-3">
            Your account is active, but you're not yet connected to a sport
            psychologist or practitioner. Once they link to you using your
            email, you'll see them here and be able to message them, log daily
            entries, and access programs.
          </p>
          <div className="bg-white/60 border border-amber-200 rounded-xl p-3 text-xs">
            <p className="text-amber-900 font-semibold mb-1">Share this email with your practitioner:</p>
            <p className="font-mono text-amber-800 break-all">{email}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function DiscontinuedCard() {
  return (
    <section className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <UserX size={18} className="text-gray-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-900 mb-1">
            You have no active practitioners
          </h2>
          <p className="text-sm text-gray-600">
            Your previous connection has been archived. You can still view your
            historical data under "Past practitioners". To work with someone
            new, share your account email with them and ask them to link to you.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Practitioner card ──────────────────────────────────────────────────────

function PractitionerCard({ link }: { link: ActiveLink }) {
  const fullName = `${link.practitioner_first_name} ${link.practitioner_last_name}`.trim()
  const initials = `${link.practitioner_first_name?.[0] ?? ''}${link.practitioner_last_name?.[0] ?? ''}`.toUpperCase() || 'P'
  const unread = link.athlete_unread ?? 0

  return (
    <Link
      to="/athlete/messages"
      className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-teal-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        {link.practitioner_avatar ? (
          <img
            src={link.practitioner_avatar}
            alt={fullName}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">
              Dr {fullName}
            </p>
            {unread > 0 && (
              <span className="min-w-[18px] h-4 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {link.practitioner_email}
          </p>
          {link.last_message_preview ? (
            <p className="text-xs text-gray-600 mt-2 line-clamp-2">
              {link.last_message_preview}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic mt-2">
              No messages yet
            </p>
          )}
          <div className="flex items-center gap-1 mt-2 text-[11px] text-gray-400">
            <CheckCircle2 size={11} className="text-teal-500" />
            Linked {formatRelativeDate(link.linked_at)}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Quick action tile ──────────────────────────────────────────────────────

function QuickAction({
  href, Icon, label, colorClass,
}: {
  href: string
  Icon: React.ElementType
  label: string
  colorClass: string
}) {
  return (
    <Link
      to={href}
      className={`flex flex-col items-center justify-center gap-2 p-4 border rounded-2xl transition-colors ${colorClass}`}
    >
      <Icon size={22} />
      <span className="text-xs font-semibold">{label}</span>
    </Link>
  )
}

// ── Small date helper ──────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const now  = Date.now()
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)   return `${days} days ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
