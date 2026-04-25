import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  Mail,
  Search,
  UserPlus,
  X,
} from 'lucide-react'

import { usePractitionerData } from '@/contexts/PractitionerContext'
import {
  getAthletePortalCandidates,
  linkAthleteByEmail,
  sendAthletePortalInvite,
  type LinkAthleteResult,
  type PortalCandidate,
} from '@/services/athleteOnboardingApi'

interface Props {
  open: boolean
  onClose: () => void
}

type SortMode = 'newest' | 'oldest' | 'name' | 'email'

export default function LinkAthleteModal({ open, onClose }: Props) {
  const { refresh } = usePractitionerData()
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [search, setSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('')
  const [portalEmail, setPortalEmail] = useState('')
  const [directEmail, setDirectEmail] = useState('')

  const candidatesQuery = useQuery({
    queryKey: ['athlete-portal-candidates'],
    enabled: open,
    queryFn: getAthletePortalCandidates,
    staleTime: 30000,
  })

  const inviteMutation = useMutation({
    mutationFn: async ({ athleteId, email }: { athleteId: string; email: string }) =>
      sendAthletePortalInvite(athleteId, email),
    onSuccess: async () => {
      await refresh()
    },
  })

  const directLinkMutation = useMutation({
    mutationFn: async (email: string): Promise<LinkAthleteResult> => linkAthleteByEmail(email.trim()),
    onSuccess: async (result) => {
      if (result.ok) {
        await refresh()
      }
    },
  })

  const candidates = useMemo(() => {
    const rows = candidatesQuery.data ?? []
    const query = search.trim().toLowerCase()
    const filtered = rows.filter(candidate => {
      if (!query) return true
      const fullName = `${candidate.first_name} ${candidate.last_name}`.toLowerCase()
      return (
        fullName.includes(query) ||
        (candidate.email || '').toLowerCase().includes(query) ||
        (candidate.sport || '').toLowerCase().includes(query)
      )
    })

    return filtered.sort((a, b) => {
      if (sortMode === 'name') {
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      }
      if (sortMode === 'email') {
        return (a.email || '').localeCompare(b.email || '')
      }
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return sortMode === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [candidatesQuery.data, search, sortMode])

  const selectedCandidate = useMemo(
    () => candidatesQuery.data?.find(candidate => candidate.id === selectedAthleteId) ?? null,
    [candidatesQuery.data, selectedAthleteId]
  )

  function handleClose() {
    setSortMode('newest')
    setSearch('')
    setSelectedAthleteId('')
    setPortalEmail('')
    setDirectEmail('')
    inviteMutation.reset()
    directLinkMutation.reset()
    onClose()
  }

  function handleSelectCandidate(candidate: PortalCandidate) {
    setSelectedAthleteId(candidate.id)
    setPortalEmail(candidate.email || '')
    directLinkMutation.reset()
    inviteMutation.reset()
  }

  async function handleInviteSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedAthleteId || !portalEmail.trim()) return
    inviteMutation.mutate({ athleteId: selectedAthleteId, email: portalEmail.trim() })
  }

  async function handleDirectLinkSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!directEmail.trim()) return
    directLinkMutation.mutate(directEmail.trim())
  }

  if (!open) return null

  const inviteError = inviteMutation.isError
    ? (inviteMutation.error as Error)?.message ?? 'Failed to send portal invite.'
    : null

  const directLinkError = directLinkMutation.isError
    ? (directLinkMutation.error as Error)?.message ?? 'Failed to link athlete.'
    : null

  const directResult = directLinkMutation.data
  const inviteResult = inviteMutation.data

  return (
    <ModalShell onClose={handleClose}>
      <div className="py-2">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <UserPlus size={18} className="text-blue-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-900">Link athlete</h3>
            <p className="text-sm text-gray-600">
              Pick an athlete from your list, confirm the email they will use in the athlete portal,
              and send the join link. If the athlete already signed up independently, you can still
              link that existing account by email below.
            </p>
          </div>
        </div>

        {inviteResult?.ok && (
          <div className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            inviteResult.activationEmailStatus === 'queued_local'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}>
            <CheckCircle2
              size={15}
              className={`mt-0.5 shrink-0 ${
                inviteResult.activationEmailStatus === 'queued_local' ? 'text-amber-600' : 'text-green-600'
              }`}
            />
            <span>
              {inviteResult.activationEmailStatus === 'queued_local'
                ? `Invite queued locally for ${inviteResult.athlete.email}. Send it once the backend email service is available.`
                : `Portal invite sent to ${inviteResult.athlete.email}.`}
            </span>
          </div>
        )}

        {directResult?.ok && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-600" />
            <span>
              {`${directResult.athlete_first_name ?? ''} ${directResult.athlete_last_name ?? ''}`.trim() || 'Athlete'} is now linked to your account.
            </span>
          </div>
        )}

        {directResult?.ok === false && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <span>{directResult.message ?? 'No athlete account found for that email yet.'}</span>
          </div>
        )}

        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr,140px]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search athletes by name, email, or sport"
              className="w-full rounded-xl border border-gray-200 px-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={sortMode}
              onChange={event => setSortMode(event.target.value as SortMode)}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A-Z</option>
              <option value="email">Email A-Z</option>
            </select>
          </div>
        </div>

        <div className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-2">
          {candidatesQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-500">
              No athletes found for this practitioner yet.
            </div>
          ) : (
            candidates.map(candidate => {
              const selected = candidate.id === selectedAthleteId
              const fullName = `${candidate.first_name} ${candidate.last_name}`.trim() || 'Unnamed athlete'
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleSelectCandidate(candidate)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{fullName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {candidate.sport || 'Sport not set'}
                        {candidate.team ? ` · ${candidate.team}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {candidate.email || 'No portal email saved yet'}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-gray-500">
                      <p>{candidate.portal_user_id ? 'Portal account exists' : 'Invite needed'}</p>
                      <p className="mt-1">Created {new Date(candidate.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <form onSubmit={handleInviteSubmit} className="mb-4 space-y-3 rounded-2xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Send join link to selected athlete</p>
            <p className="mt-1 text-xs text-gray-500">
              The athlete will use this same email to sign in and communicate with the practitioner.
            </p>
          </div>

          {inviteError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{inviteError}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Selected athlete</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              {selectedCandidate
                ? `${selectedCandidate.first_name} ${selectedCandidate.last_name}`.trim()
                : 'Choose an athlete from the list above'}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Portal email</label>
            <input
              type="email"
              value={portalEmail}
              onChange={event => setPortalEmail(event.target.value)}
              placeholder="athlete@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={inviteMutation.isPending || !selectedAthleteId || !portalEmail.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {inviteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {inviteMutation.isPending ? 'Sending invite…' : 'Send portal invite'}
          </button>
        </form>

        <form onSubmit={handleDirectLinkSubmit} className="space-y-3 rounded-2xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Link an already-signed-up athlete</p>
            <p className="mt-1 text-xs text-gray-500">
              If the athlete already created their SPPS account independently, enter that exact email here.
            </p>
          </div>

          {directLinkError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{directLinkError}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Existing athlete account email</label>
            <input
              type="email"
              value={directEmail}
              onChange={event => setDirectEmail(event.target.value)}
              placeholder="athlete@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={directLinkMutation.isPending || !directEmail.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              {directLinkMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {directLinkMutation.isPending ? 'Linking…' : 'Link existing account'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}
