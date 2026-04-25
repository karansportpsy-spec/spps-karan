import { apiJson } from '@/lib/apiClient'
import { getErrorMessage, shouldFallbackToDirectDb } from '@/lib/apiFallback'
import { supabase } from '@/lib/supabase'

export interface LinkAthleteResult {
  ok: boolean
  code?: 'ATHLETE_NOT_FOUND' | 'ALREADY_LINKED'
  message?: string
  link_id?: string
  athlete_id?: string
  athlete_first_name?: string
  athlete_last_name?: string
}

export interface PortalCandidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  sport: string | null
  team: string | null
  status: string | null
  is_portal_activated: boolean | null
  portal_user_id: string | null
  active_link_id: string | null
  linked_at: string | null
  created_at: string
  updated_at: string
}

export interface AthleteIntakePayload {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
  sport: string
  team?: string
  position?: string
  experience?: string
  streetAddress?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  referral?: {
    source?: string
    mayThankReferrer?: boolean
    name?: string
    phone?: string
  }
  familyRelationships?: string
  sportPsychologyHistory?: {
    priorPreparation?: boolean
    priorWorkWithPsychologist?: boolean
    details?: string
  }
  sportBackground?: string
  presentingConcerns?: string
  concernRatings?: Record<string, number>
  severityRatings?: Record<string, number>
  additionalConcerns?: string
  injuryHistory?: string
  medicationsAndTreatment?: string
  mentalHealthHospitalization?: string
  intakeSignedBy?: string
  sendPortalInvite?: boolean
}

export interface AthleteOnboardingStatus {
  athleteId: string
  isMinor: boolean
  requiresOnboarding: boolean
  practitioners: Array<{
    practitionerId: string
    practitionerName: string
    practitionerEmail: string
    missing: string[]
    complete: boolean
  }>
}

export interface AthleteOnboardingSubmitPayload {
  practitionerId?: string
  signedBy: string
  guardianName?: string
  guardianRelationship?: string
  guardianEmail?: string
  guardianPhone?: string
  mediaReleaseAccepted: boolean
  confidentialityAccepted: boolean
  consultationAccepted: boolean
  intake: Record<string, unknown>
}

export interface PortalInviteResponse {
  ok?: boolean
  athlete: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
  portalInviteUrl: string | null
  activationEmailStatus?: string | null
  activationEmailMethod?: string | null
  activationEmailDetail?: string | null
}

export async function linkAthleteByEmail(email: string) {
  try {
    return await apiJson<LinkAthleteResult>('/api/athletes/link-by-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return linkAthleteByEmailDirect(email)
  }
}

export async function createAthleteFromIntake(payload: AthleteIntakePayload) {
  try {
    return await apiJson<{
      athlete: { id: string; first_name: string; last_name: string; email: string | null }
      portalInviteUrl: string | null
      portalInviteStatus?: string | null
      portalInviteMethod?: string | null
      portalInviteDetail?: string | null
    }>(
      '/api/athletes/intake-create',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
    if (!message.includes('network request failed')) {
      throw error
    }

    return createAthleteFromIntakeDirect(payload)
  }
}

async function createAthleteFromIntakeDirect(payload: AthleteIntakePayload) {
  const { data: sessionData } = await supabase.auth.getSession()
  const practitionerId = sessionData.session?.user?.id
  if (!practitionerId) {
    throw new Error('You must be signed in as a practitioner to add an athlete.')
  }

  const normalizedEmail = payload.email?.trim().toLowerCase() || null

  if (normalizedEmail) {
    const { data: existingAthlete, error: existingError } = await supabase
      .from('athletes')
      .select('id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle()

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(existingError.message)
    }

    if (existingAthlete?.id) {
      throw new Error('An athlete with this email already exists. Use Link athlete instead.')
    }
  }

  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .insert({
      practitioner_id: practitionerId,
      first_name: payload.firstName.trim(),
      last_name: payload.lastName.trim(),
      email: normalizedEmail,
      phone: payload.phone?.trim() || null,
      date_of_birth: normalizeOptionalDate(payload.dateOfBirth),
      sport: payload.sport.trim(),
      team: payload.team?.trim() || null,
      position: payload.position?.trim() || null,
      status: normalizedEmail ? 'unverified' : 'active',
      notes: payload.presentingConcerns?.trim() || null,
      is_portal_activated: false,
    })
    .select('id, first_name, last_name, email')
    .single()

  if (athleteError) {
    throw new Error(athleteError.message)
  }

  const athleteId = athlete.id

  fireAndForget(
    Promise.resolve(
      supabase
        .from('practitioner_athlete_links')
        .insert({
          practitioner_id: practitionerId,
          athlete_id: athleteId,
          status: 'active',
        })
    ),
    'link athlete after direct intake create'
  )

  fireAndForget(
    Promise.resolve(
      supabase
        .from('athlete_profiles')
        .upsert({
          athlete_id: athleteId,
          practitioner_id: practitionerId,
          email: normalizedEmail,
          first_name: payload.firstName.trim(),
          last_name: payload.lastName.trim(),
          sport: payload.sport.trim(),
          team: payload.team?.trim() || null,
          date_of_birth: normalizeOptionalDate(payload.dateOfBirth),
          phone: payload.phone?.trim() || null,
        }, { onConflict: 'athlete_id' })
    ),
    'sync athlete profile after direct intake create'
  )

  fireAndForget(
    Promise.resolve(
      supabase
        .from('athlete_intake_submissions')
        .upsert({
          practitioner_id: practitionerId,
          athlete_id: athleteId,
          submitted_by: practitionerId,
          submitted_by_role: 'practitioner',
          source: 'practitioner_intake',
          intake_status: 'submitted',
          signed_by: payload.intakeSignedBy?.trim() || `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim(),
          signed_at: new Date().toISOString(),
          intake_data: {
            personal_information: {
              experience: payload.experience || null,
              street_address: payload.streetAddress || null,
              city: payload.city || null,
              state_province: payload.stateProvince || null,
              postal_code: payload.postalCode || null,
            },
            referral_information: payload.referral || {},
            family_relationships: payload.familyRelationships || '',
            sport_psychology_history: payload.sportPsychologyHistory || {},
            sport_background: payload.sportBackground || '',
            presenting_concerns: payload.presentingConcerns || '',
            concern_ratings: payload.concernRatings || {},
            severity_ratings: payload.severityRatings || {},
            additional_concerns: payload.additionalConcerns || '',
            health_and_medical: {
              injury_history: payload.injuryHistory || '',
              medications_and_treatment: payload.medicationsAndTreatment || '',
              mental_health_hospitalization: payload.mentalHealthHospitalization || '',
            },
          },
        }, { onConflict: 'practitioner_id,athlete_id,source' })
    ),
    'save athlete intake submission after direct intake create'
  )

  let portalInviteUrl: string | null = null
  let portalInviteStatus: string | null = payload.sendPortalInvite && normalizedEmail ? 'queued_local' : 'not_requested'
  let portalInviteMethod: string | null = null
  let portalInviteDetail: string | null = null

  if (payload.sendPortalInvite && normalizedEmail) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : ''
    const token = await createLocalInviteToken(practitionerId, athleteId, normalizedEmail)
    portalInviteUrl = token
      ? `${baseUrl}/athlete/accept-invite?token=${token}&email=${encodeURIComponent(normalizedEmail)}`
      : `${baseUrl}/athlete/login?email=${encodeURIComponent(normalizedEmail)}`
    portalInviteMethod = 'local_storage'
    portalInviteDetail = 'Invite queued locally. It can be sent once the backend email service is available.'

    queuePortalInviteLocally({
      athleteId,
      athleteName: `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim(),
      email: normalizedEmail,
      practitionerId,
      createdAt: new Date().toISOString(),
      portalInviteUrl,
    })
  }

  return {
    athlete,
    portalInviteUrl,
    portalInviteStatus,
    portalInviteMethod,
    portalInviteDetail,
  }
}

function normalizeOptionalDate(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function fireAndForget(promise: Promise<unknown>, label: string) {
  promise.catch(error => {
    console.warn(`[athleteOnboardingApi] ${label} failed:`, error)
  })
}

export async function getAthletePortalCandidates() {
  try {
    return await apiJson<PortalCandidate[]>('/api/athletes/portal-candidates')
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return getAthletePortalCandidatesDirect()
  }
}

export async function sendAthletePortalInvite(athleteId: string, email: string) {
  try {
    return await apiJson<PortalInviteResponse>('/api/athletes/send-portal-invite', {
      method: 'POST',
      body: JSON.stringify({ athleteId, email }),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return sendAthletePortalInviteDirect(athleteId, email)
  }
}

export async function getAthleteOnboardingStatus() {
  try {
    return await apiJson<AthleteOnboardingStatus>('/api/athlete/onboarding-status', {
      preferAthleteToken: true,
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return getAthleteOnboardingStatusDirect()
  }
}

export async function submitAthleteOnboarding(payload: AthleteOnboardingSubmitPayload) {
  try {
    return await apiJson<{ ok: boolean; message: string }>('/api/athlete/onboarding-submit', {
      method: 'POST',
      preferAthleteToken: true,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return submitAthleteOnboardingDirect(payload)
  }
}

type AthleteLookupRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  sport: string | null
  team: string | null
  status: string | null
  is_portal_activated?: boolean | null
  portal_user_id?: string | null
  practitioner_id?: string | null
  date_of_birth?: string | null
  created_at?: string
  updated_at?: string
}

type PractitionerLinkRow = {
  practitioner_id: string
  athlete_id: string
  id?: string
  linked_at?: string | null
}

type InviteQueueItem = {
  athleteId: string
  athleteName: string
  email: string
  practitionerId: string
  createdAt: string
  portalInviteUrl: string | null
}

const LOCAL_INVITE_QUEUE_KEY = 'spps-local-portal-invite-queue'
const ATHLETE_SELECT_PRIMARY =
  'id,first_name,last_name,email,sport,team,status,is_portal_activated,portal_user_id,practitioner_id,date_of_birth,created_at,updated_at'
const ATHLETE_SELECT_FALLBACK =
  'id,first_name,last_name,email,sport,team,status,is_portal_activated,practitioner_id,date_of_birth,created_at,updated_at'

async function getCurrentUserOrThrow() {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    throw new Error(error.message)
  }
  if (!data.user) {
    throw new Error('You must be signed in to continue.')
  }
  return data.user
}

async function getCurrentPractitionerIdOrThrow() {
  const user = await getCurrentUserOrThrow()
  return user.id
}

async function selectAthletesDirect(options: { practitionerId?: string; athleteIds?: string[] } = {}) {
  const buildQuery = (selectClause: string) => {
    let query = supabase
      .from('athletes')
      .select(selectClause)
      .order('created_at', { ascending: false })

    if (options.practitionerId) {
      query = query.eq('practitioner_id', options.practitionerId)
    }

    if (options.athleteIds && options.athleteIds.length > 0) {
      query = query.in('id', options.athleteIds)
    }

    return query
  }

  let { data, error } = await buildQuery(ATHLETE_SELECT_PRIMARY)
  if (error && getErrorMessage(error).toLowerCase().includes('portal_user_id')) {
    ;({ data, error } = await buildQuery(ATHLETE_SELECT_FALLBACK))
  }

  if (error) {
    throw error
  }

  return ((data ?? []) as unknown as AthleteLookupRow[]).map(row => ({
    ...row,
    portal_user_id: row.portal_user_id ?? null,
  }))
}

async function findAthleteByEmailDirect(email: string): Promise<AthleteLookupRow | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const runAthleteEmailLookup = async (selectClause: string) => {
    return supabase
      .from('athletes')
      .select(selectClause)
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle()
  }

  let { data, error } = await runAthleteEmailLookup(ATHLETE_SELECT_PRIMARY)
  if (error && getErrorMessage(error).toLowerCase().includes('portal_user_id')) {
    ;({ data, error } = await runAthleteEmailLookup(ATHLETE_SELECT_FALLBACK))
  }

  if (error && error.code !== 'PGRST116') {
    throw error
  }
  if (data) {
    const athlete = data as unknown as AthleteLookupRow
    return { ...athlete, portal_user_id: athlete.portal_user_id ?? null }
  }

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('athlete_profiles')
      .select('athlete_id,email,first_name,last_name,sport,team')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle()

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError
    }

    if (!profileData?.athlete_id) {
      return null
    }

    const athleteRows = await selectAthletesDirect({ athleteIds: [profileData.athlete_id] })
    const athlete = athleteRows[0]
    if (!athlete) return null

    return {
      ...athlete,
      email: athlete.email ?? profileData.email ?? null,
      first_name: athlete.first_name || profileData.first_name || '',
      last_name: athlete.last_name || profileData.last_name || '',
      sport: athlete.sport ?? profileData.sport ?? null,
      team: athlete.team ?? profileData.team ?? null,
    }
  } catch (profileError) {
    const message = getErrorMessage(profileError).toLowerCase()
    if (!message.includes('relation') || !message.includes('does not exist')) {
      throw profileError
    }
  }

  return null
}

async function listPractitionerLinks(practitionerId: string) {
  try {
    const { data, error } = await supabase
      .from('practitioner_athlete_links')
      .select('id,practitioner_id,athlete_id,linked_at,status')
      .eq('practitioner_id', practitionerId)
      .eq('status', 'active')

    if (error) throw error
    return (data ?? []) as PractitionerLinkRow[]
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return []
    }
    throw error
  }
}

function toPortalCandidate(row: AthleteLookupRow, link?: PractitionerLinkRow | null): PortalCandidate {
  return {
    id: row.id,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    email: row.email ?? null,
    sport: row.sport ?? null,
    team: row.team ?? null,
    status: row.status ?? null,
    is_portal_activated: row.is_portal_activated ?? null,
    portal_user_id: row.portal_user_id ?? null,
    active_link_id: link?.id ?? null,
    linked_at: link?.linked_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

async function getAthletePortalCandidatesDirect() {
  const practitionerId = await getCurrentPractitionerIdOrThrow()
  const directAthletes = await selectAthletesDirect({ practitionerId })
  const links = await listPractitionerLinks(practitionerId)
  const athleteIdsFromLinks = Array.from(new Set(links.map(link => link.athlete_id).filter(Boolean)))
  const missingAthleteIds = athleteIdsFromLinks.filter(id => !directAthletes.some(athlete => athlete.id === id))
  const linkedOnlyAthletes = missingAthleteIds.length > 0
    ? await selectAthletesDirect({ athleteIds: missingAthleteIds })
    : []

  const linkMap = new Map(links.map(link => [link.athlete_id, link]))
  const combined = [...directAthletes, ...linkedOnlyAthletes]
  const deduped = new Map<string, PortalCandidate>()

  for (const athlete of combined) {
    deduped.set(athlete.id, toPortalCandidate(athlete, linkMap.get(athlete.id) ?? null))
  }

  return Array.from(deduped.values())
}

async function ensurePractitionerAthleteLinkDirect(practitionerId: string, athleteId: string) {
  const links = await listPractitionerLinks(practitionerId)
  const existing = links.find(link => link.athlete_id === athleteId)
  if (existing) {
    return existing.id ?? athleteId
  }

  try {
    const { data, error } = await supabase
      .from('practitioner_athlete_links')
      .insert({
        practitioner_id: practitionerId,
        athlete_id: athleteId,
        status: 'active',
      })
      .select('id')
      .single()

    if (error) throw error
    return data?.id ?? athleteId
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (!(message.includes('relation') && message.includes('does not exist'))) {
      throw error
    }
  }

  return athleteId
}

async function syncAthletePortalProfileDirect(args: {
  practitionerId: string
  athleteId: string
  email: string | null
  firstName: string
  lastName: string
  sport: string | null
  team: string | null
}) {
  try {
    const { error } = await supabase
      .from('athlete_profiles')
      .upsert({
        practitioner_id: args.practitionerId,
        athlete_id: args.athleteId,
        email: args.email,
        first_name: args.firstName,
        last_name: args.lastName,
        sport: args.sport,
        team: args.team,
      }, { onConflict: 'athlete_id' })

    if (error) throw error
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (!(message.includes('relation') && message.includes('does not exist'))) {
      throw error
    }
  }
}

function queuePortalInviteLocally(item: InviteQueueItem) {
  if (typeof window === 'undefined') return

  const existing = readQueuedInvites()
  const deduped = existing.filter(invite => !(invite.athleteId === item.athleteId && invite.email === item.email))
  deduped.unshift(item)
  window.localStorage.setItem(LOCAL_INVITE_QUEUE_KEY, JSON.stringify(deduped.slice(0, 25)))
}

function readQueuedInvites(): InviteQueueItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(LOCAL_INVITE_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as InviteQueueItem[] : []
  } catch {
    return []
  }
}

async function createLocalInviteToken(practitionerId: string, athleteId: string, email: string) {
  try {
    const { data, error } = await supabase
      .from('athlete_invites')
      .insert({
        practitioner_id: practitionerId,
        athlete_id: athleteId,
        email,
      })
      .select('token')
      .single()

    if (error) throw error
    return data?.token ?? null
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return null
    }
    throw error
  }
}

async function linkAthleteByEmailDirect(email: string): Promise<LinkAthleteResult> {
  const practitionerId = await getCurrentPractitionerIdOrThrow()
  const athlete = await findAthleteByEmailDirect(email)

  if (!athlete) {
    return {
      ok: false,
      code: 'ATHLETE_NOT_FOUND',
      message: 'No athlete account found for this email.',
    }
  }

  const existingLinks = await listPractitionerLinks(practitionerId)
  const existing = existingLinks.find(link => link.athlete_id === athlete.id)
  if (existing || athlete.practitioner_id === practitionerId) {
    return {
      ok: false,
      code: 'ALREADY_LINKED',
      message: 'You already have an active link with this athlete.',
      link_id: existing?.id ?? athlete.id,
      athlete_id: athlete.id,
      athlete_first_name: athlete.first_name,
      athlete_last_name: athlete.last_name,
    }
  }

  const linkId = await ensurePractitionerAthleteLinkDirect(practitionerId, athlete.id)
  const { error: updateError } = await supabase
    .from('athletes')
    .update({
      practitioner_id: practitionerId,
      status: 'linked',
      is_portal_activated: true,
    })
    .eq('id', athlete.id)

  if (updateError) {
    throw updateError
  }

  await syncAthletePortalProfileDirect({
    practitionerId,
    athleteId: athlete.id,
    email: athlete.email ?? null,
    firstName: athlete.first_name,
    lastName: athlete.last_name,
    sport: athlete.sport ?? null,
    team: athlete.team ?? null,
  })

  return {
    ok: true,
    link_id: linkId,
    athlete_id: athlete.id,
    athlete_first_name: athlete.first_name,
    athlete_last_name: athlete.last_name,
  }
}

async function sendAthletePortalInviteDirect(athleteId: string, email: string): Promise<PortalInviteResponse> {
  const practitionerId = await getCurrentPractitionerIdOrThrow()
  const candidates = await getAthletePortalCandidatesDirect()
  const athlete = candidates.find(candidate => candidate.id === athleteId)

  if (!athlete) {
    throw new Error('Athlete not found for this practitioner.')
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existingEmailOwner = await findAthleteByEmailDirect(normalizedEmail)
  if (existingEmailOwner && existingEmailOwner.id !== athleteId) {
    throw new Error('This email is already attached to another athlete record. Use that athlete record instead.')
  }

  await ensurePractitionerAthleteLinkDirect(practitionerId, athleteId)

  const { error: athleteUpdateError } = await supabase
    .from('athletes')
    .update({
      email: normalizedEmail,
      practitioner_id: practitionerId,
      status: athlete.status === 'active' || !athlete.status ? 'linked' : athlete.status,
      is_portal_activated: true,
    })
    .eq('id', athleteId)

  if (athleteUpdateError) {
    throw athleteUpdateError
  }

  await syncAthletePortalProfileDirect({
    practitionerId,
    athleteId,
    email: normalizedEmail,
    firstName: athlete.first_name,
    lastName: athlete.last_name,
    sport: athlete.sport ?? null,
    team: athlete.team ?? null,
  })

  const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : ''
  const token = await createLocalInviteToken(practitionerId, athleteId, normalizedEmail)
  const portalInviteUrl = token
    ? `${baseUrl}/athlete/accept-invite?token=${token}&email=${encodeURIComponent(normalizedEmail)}`
    : `${baseUrl}/athlete/login?email=${encodeURIComponent(normalizedEmail)}`

  queuePortalInviteLocally({
    athleteId,
    athleteName: `${athlete.first_name} ${athlete.last_name}`.trim(),
    email: normalizedEmail,
    practitionerId,
    createdAt: new Date().toISOString(),
    portalInviteUrl,
  })

  return {
    ok: true,
    athlete: {
      id: athleteId,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      email: normalizedEmail,
    },
    portalInviteUrl,
    activationEmailStatus: 'queued_local',
    activationEmailMethod: 'local_storage',
    activationEmailDetail: 'Backend email delivery is unavailable locally. The invite was queued locally so you can send it when the server is available.',
  }
}

async function resolveCurrentAthleteDirect() {
  const user = await getCurrentUserOrThrow()
  const athleteIdFromMeta = typeof user.user_metadata?.athlete_id === 'string'
    ? user.user_metadata.athlete_id.trim()
    : ''
  const athleteIdCandidates = [athleteIdFromMeta, user.id].filter(Boolean)

  for (const athleteId of athleteIdCandidates) {
    const athleteRows = await selectAthletesDirect({ athleteIds: [athleteId] })
    if (athleteRows[0]) {
      return athleteRows[0]
    }
  }

  if (user.email) {
    const athleteByEmail = await findAthleteByEmailDirect(user.email)
    if (athleteByEmail) {
      return athleteByEmail
    }
  }

  throw new Error('Athlete profile not found.')
}

async function getActivePractitionersForAthleteDirect(athleteId: string) {
  try {
    const { data, error } = await supabase
      .from('practitioner_athlete_links')
      .select('practitioner_id,athlete_id,status,linked_at,practitioners(id,first_name,last_name,email)')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')

    if (error) throw error

    return (data ?? []).map((row: any) => ({
      practitionerId: row.practitioner_id as string,
      practitionerName: [row.practitioners?.first_name, row.practitioners?.last_name].filter(Boolean).join(' ').trim() || 'Your practitioner',
      practitionerEmail: row.practitioners?.email ?? '',
    }))
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (!(message.includes('relation') && message.includes('does not exist'))) {
      throw error
    }
  }

  const athleteRows = await selectAthletesDirect({ athleteIds: [athleteId] })
  const athlete = athleteRows[0]
  if (!athlete?.practitioner_id) {
    return []
  }

  const { data: practitioner, error: practitionerError } = await supabase
    .from('practitioners')
    .select('id,first_name,last_name,email')
    .eq('id', athlete.practitioner_id)
    .maybeSingle()

  if (practitionerError && practitionerError.code !== 'PGRST116') {
    throw practitionerError
  }

  if (!practitioner) {
    return []
  }

  return [{
    practitionerId: practitioner.id,
    practitionerName: [practitioner.first_name, practitioner.last_name].filter(Boolean).join(' ').trim() || 'Your practitioner',
    practitionerEmail: practitioner.email ?? '',
  }]
}

async function getAthleteOnboardingStatusDirect(): Promise<AthleteOnboardingStatus> {
  const athlete = await resolveCurrentAthleteDirect()
  const activePractitioners = await getActivePractitionersForAthleteDirect(athlete.id)
  const consentForms = await loadConsentFormsDirect(athlete.id)
  const intakeRows = await loadAthleteIntakesDirect(athlete.id)
  const isMinor = isUnder18(athlete.date_of_birth ?? null)

  const practitioners = activePractitioners.map(practitioner => {
    const practitionerForms = consentForms.filter(form => form.practitioner_id === practitioner.practitionerId)
    const formTypes = new Set(practitionerForms.map(form => String(form.form_type || '').toLowerCase()))
    const intakeComplete = intakeRows.some(intake =>
      intake.practitioner_id === practitioner.practitionerId &&
      ['submitted', 'reviewed'].includes(String(intake.intake_status || '').toLowerCase())
    )

    const consentComplete =
      formTypes.has('consent_confidentiality') ||
      formTypes.has('consent') ||
      formTypes.has('informed_consent') ||
      formTypes.has('confidentiality')

    const mediaComplete =
      formTypes.has('photo_media') ||
      formTypes.has('media_release') ||
      formTypes.has('photo_release') ||
      formTypes.has('image_release')

    const parentalComplete =
      !isMinor ||
      formTypes.has('parental_release') ||
      formTypes.has('parental_consent') ||
      formTypes.has('guardian_consent') ||
      formTypes.has('guardian_release')

    const missing: string[] = []
    if (!intakeComplete) missing.push('intake')
    if (!consentComplete) missing.push('consent_confidentiality')
    if (!mediaComplete) missing.push('photo_media')
    if (!parentalComplete) missing.push('parental_release')

    return {
      practitionerId: practitioner.practitionerId,
      practitionerName: practitioner.practitionerName,
      practitionerEmail: practitioner.practitionerEmail,
      missing,
      complete: missing.length === 0,
    }
  })

  return {
    athleteId: athlete.id,
    isMinor,
    requiresOnboarding: practitioners.some(practitioner => !practitioner.complete),
    practitioners,
  }
}

async function loadConsentFormsDirect(athleteId: string) {
  try {
    const { data, error } = await supabase
      .from('consent_forms')
      .select('practitioner_id,form_type,status')
      .eq('athlete_id', athleteId)
      .in('status', ['signed', 'uploaded'])

    if (error) throw error
    return data ?? []
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return []
    }
    throw error
  }
}

async function loadAthleteIntakesDirect(athleteId: string) {
  try {
    const { data, error } = await supabase
      .from('athlete_intake_submissions')
      .select('practitioner_id,intake_status,source,updated_at,created_at')
      .eq('athlete_id', athleteId)

    if (error) throw error
    return data ?? []
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return []
    }
    throw error
  }
}

function isUnder18(dateOfBirth: string | null) {
  if (!dateOfBirth) return false
  const birthTime = new Date(dateOfBirth).getTime()
  if (Number.isNaN(birthTime)) return false
  return ((Date.now() - birthTime) / (1000 * 60 * 60 * 24 * 365.25)) < 18
}

async function submitAthleteOnboardingDirect(payload: AthleteOnboardingSubmitPayload) {
  const athlete = await resolveCurrentAthleteDirect()
  const practitioners = await getActivePractitionersForAthleteDirect(athlete.id)
  const practitionerId = payload.practitionerId || practitioners[0]?.practitionerId

  if (!practitionerId) {
    throw new Error('No active practitioner link found for onboarding.')
  }

  await upsertAthleteIntakeDirect({
    practitionerId,
    athleteId: athlete.id,
    submittedBy: athlete.portal_user_id ?? athlete.id,
    signedBy: payload.signedBy,
    guardianName: payload.guardianName,
    guardianRelationship: payload.guardianRelationship,
    guardianEmail: payload.guardianEmail,
    guardianPhone: payload.guardianPhone,
    intakeData: payload.intake,
  })

  await insertConsentDirect({
    practitionerId,
    athleteId: athlete.id,
    formType: 'consent_confidentiality',
    signedBy: payload.signedBy,
    guardianName: payload.guardianName,
    guardianRelationship: payload.guardianRelationship,
    guardianEmail: payload.guardianEmail,
    guardianPhone: payload.guardianPhone,
    formData: {
      source: 'athlete_portal',
      confidentiality_accepted: payload.confidentialityAccepted,
      consultation_accepted: payload.consultationAccepted,
    },
  })

  await insertConsentDirect({
    practitionerId,
    athleteId: athlete.id,
    formType: 'photo_media',
    signedBy: payload.signedBy,
    guardianName: payload.guardianName,
    guardianRelationship: payload.guardianRelationship,
    guardianEmail: payload.guardianEmail,
    guardianPhone: payload.guardianPhone,
    formData: {
      source: 'athlete_portal',
      media_release_accepted: payload.mediaReleaseAccepted,
    },
  })

  if (isUnder18(athlete.date_of_birth ?? null)) {
    await insertConsentDirect({
      practitionerId,
      athleteId: athlete.id,
      formType: 'parental_release',
      signedBy: payload.signedBy,
      guardianName: payload.guardianName,
      guardianRelationship: payload.guardianRelationship,
      guardianEmail: payload.guardianEmail,
      guardianPhone: payload.guardianPhone,
      formData: {
        source: 'athlete_portal',
        parental_release_accepted: true,
      },
    })
  }

  const { error: athleteUpdateError } = await supabase
    .from('athletes')
    .update({
      status: 'linked',
      is_portal_activated: true,
      practitioner_id: practitionerId,
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', athlete.id)

  if (athleteUpdateError) {
    const message = getErrorMessage(athleteUpdateError).toLowerCase()
    if (!message.includes('onboarding_completed')) {
      throw athleteUpdateError
    }

    const { error: retryError } = await supabase
      .from('athletes')
      .update({
        status: 'linked',
        is_portal_activated: true,
        practitioner_id: practitionerId,
      })
      .eq('id', athlete.id)

    if (retryError) {
      throw retryError
    }
  }

  return { ok: true, message: 'Onboarding submitted successfully.' }
}

async function upsertAthleteIntakeDirect(args: {
  practitionerId: string
  athleteId: string
  submittedBy: string
  signedBy: string
  guardianName?: string
  guardianRelationship?: string
  guardianEmail?: string
  guardianPhone?: string
  intakeData: Record<string, unknown>
}) {
  try {
    const { error } = await supabase
      .from('athlete_intake_submissions')
      .upsert({
        practitioner_id: args.practitionerId,
        athlete_id: args.athleteId,
        submitted_by: args.submittedBy,
        submitted_by_role: 'athlete',
        source: 'athlete_portal',
        intake_status: 'submitted',
        signed_by: args.signedBy,
        signed_at: new Date().toISOString(),
        guardian_name: args.guardianName ?? null,
        guardian_relationship: args.guardianRelationship ?? null,
        guardian_email: args.guardianEmail ?? null,
        guardian_phone: args.guardianPhone ?? null,
        intake_data: args.intakeData,
      }, { onConflict: 'practitioner_id,athlete_id,source' })

    if (error) throw error
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return
    }
    throw error
  }
}

async function insertConsentDirect(args: {
  practitionerId: string
  athleteId: string
  formType: string
  signedBy: string
  guardianName?: string
  guardianRelationship?: string
  guardianEmail?: string
  guardianPhone?: string
  formData: Record<string, unknown>
}) {
  const row: Record<string, unknown> = {
    practitioner_id: args.practitionerId,
    athlete_id: args.athleteId,
    form_type: args.formType,
    status: 'signed',
    signed_by: args.signedBy,
    signed_at: new Date().toISOString(),
    signed_timestamp: new Date().toISOString(),
    guardian_name: args.guardianName ?? null,
    guardian_relationship: args.guardianRelationship ?? null,
    guardian_email: args.guardianEmail ?? null,
    guardian_phone: args.guardianPhone ?? null,
    form_data: args.formData,
    digital_signature: args.signedBy,
  }

  const missingColumnRegex =
    /Could not find the ['"]([^'"]+)['"] column|column ["']([^"']+)["'] of relation ["']consent_forms["'] does not exist/i
  const removedColumns = new Set<string>()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await supabase.from('consent_forms').insert(row)
    if (!error) {
      return
    }

    const message = getErrorMessage(error)
    const match = message.match(missingColumnRegex)
    const missingColumn = match?.[1] ?? match?.[2]

    if (!missingColumn || !(missingColumn in row) || removedColumns.has(missingColumn)) {
      throw error
    }

    delete row[missingColumn]
    removedColumns.add(missingColumn)
  }

  throw new Error('Failed to save consent form after compatibility retries.')
}
