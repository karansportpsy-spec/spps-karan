import {
  apiJson,
  clearClinicalAccessSession,
  getClinicalAccessSession,
  setClinicalAccessSession,
} from '@/lib/apiClient'
import { getErrorMessage, shouldFallbackToDirectDb } from '@/lib/apiFallback'
import { supabase } from '@/lib/supabase'

const LOCAL_CLINICAL_HASH_KEY = 'spps-clinical-local-password-hash'
const LOCAL_CLINICAL_UPDATED_AT_KEY = 'spps-clinical-local-password-updated-at'
const LOCAL_CLINICAL_SESSION_MINUTES = 30

export interface ClinicalRecord {
  id: string
  athleteId: string
  practitionerId: string
  diagnosisLabel: string
  dsmReference: string | null
  icdCode: string
  notes: string
  severityLevel: 'mild' | 'moderate' | 'severe' | 'critical'
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  athlete: {
    id: string
    firstName: string
    lastName: string
    sport: string | null
    team: string | null
  }
}

export interface ClinicalIcdOption {
  code: string
  title: string
  category: string | null
}

export interface ClinicalOwnerAnalytics {
  totals: {
    total_diagnoses: number
    active_records: number
    archived_records: number
  }
  usage: Array<{
    usage_day: string
    action_type: string
    action_count: number
    unique_practitioners: number
  }>
  trends: Array<{
    icd_code: string
    severity_level: string
    status: string
    record_count: number
  }>
}

export interface ClinicalRecordPayload {
  athleteId: string
  diagnosisLabel: string
  dsmReference?: string
  icdCode: string
  notes: string
  severityLevel: 'mild' | 'moderate' | 'severe' | 'critical'
  status?: 'active' | 'archived'
}

export interface ClinicalAccessStatus {
  configured: boolean
  source: 'database' | 'environment' | 'local' | null
  selfManaged: boolean
  storageReady: boolean
  updatedAt: string | null
}

type ClinicalRow = {
  id: string
  athlete_id: string
  practitioner_id: string
  diagnosis_label: string
  dsm_reference: string | null
  icd_code: string
  notes: string
  severity_level: 'mild' | 'moderate' | 'severe' | 'critical'
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
  athlete?:
    | {
        id: string
        first_name: string
        last_name: string
        sport: string | null
        team: string | null
      }
    | Array<{
        id: string
        first_name: string
        last_name: string
        sport: string | null
        team: string | null
      }>
}

function getLocalClinicalHash() {
  return localStorage.getItem(LOCAL_CLINICAL_HASH_KEY)
}

function setLocalClinicalHash(hash: string) {
  localStorage.setItem(LOCAL_CLINICAL_HASH_KEY, hash)
  localStorage.setItem(LOCAL_CLINICAL_UPDATED_AT_KEY, new Date().toISOString())
}

function getLocalClinicalUpdatedAt() {
  return localStorage.getItem(LOCAL_CLINICAL_UPDATED_AT_KEY)
}

async function hashClinicalPassword(password: string) {
  const trimmed = password.trim()
  if (!trimmed) {
    throw new Error('Clinical access password is required.')
  }

  const bytes = new TextEncoder().encode(trimmed)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function getLocalClinicalStatus(): ClinicalAccessStatus {
  return {
    configured: Boolean(getLocalClinicalHash()),
    source: 'local',
    selfManaged: true,
    storageReady: true,
    updatedAt: getLocalClinicalUpdatedAt(),
  }
}

async function getPractitionerUserId() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function requireClinicalSessionForLocalMode() {
  const session = getClinicalAccessSession()
  if (!session?.token || session.expiresAt <= Date.now()) {
    throw new Error('Clinical access is locked. Enter the clinical access password again.')
  }
}

function mapClinicalRecordRow(row: ClinicalRow): ClinicalRecord {
  const athlete = Array.isArray(row.athlete) ? row.athlete[0] : row.athlete

  return {
    id: row.id,
    athleteId: row.athlete_id,
    practitionerId: row.practitioner_id,
    diagnosisLabel: row.diagnosis_label,
    dsmReference: row.dsm_reference ?? null,
    icdCode: row.icd_code,
    notes: row.notes ?? '',
    severityLevel: row.severity_level,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    athlete: {
      id: athlete?.id ?? row.athlete_id,
      firstName: athlete?.first_name ?? '',
      lastName: athlete?.last_name ?? '',
      sport: athlete?.sport ?? null,
      team: athlete?.team ?? null,
    },
  }
}

async function listClinicalRecordsDirect(filters: {
  athleteId?: string
  status?: 'active' | 'archived' | ''
  search?: string
}) {
  requireClinicalSessionForLocalMode()
  const practitionerId = await getPractitionerUserId()
  if (!practitionerId) {
    throw new Error('You must be signed in as a practitioner to view clinical records.')
  }

  let query = supabase
    .from('clinical_records')
    .select(
      'id, athlete_id, practitioner_id, diagnosis_label, dsm_reference, icd_code, notes, severity_level, status, created_at, updated_at, athlete:athletes(id,first_name,last_name,sport,team)'
    )
    .eq('practitioner_id', practitionerId)
    .order('created_at', { ascending: false })

  if (filters.athleteId) {
    query = query.eq('athlete_id', filters.athleteId)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim().replace(/[%_,]/g, ' ')}%`
    query = query.or(`diagnosis_label.ilike.${pattern},icd_code.ilike.${pattern},notes.ilike.${pattern}`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapClinicalRecordRow(row as ClinicalRow))
}

async function createClinicalRecordDirect(payload: ClinicalRecordPayload) {
  requireClinicalSessionForLocalMode()
  const practitionerId = await getPractitionerUserId()
  if (!practitionerId) {
    throw new Error('You must be signed in as a practitioner to create a clinical record.')
  }

  const { data, error } = await supabase
    .from('clinical_records')
    .insert({
      athlete_id: payload.athleteId,
      practitioner_id: practitionerId,
      diagnosis_label: payload.diagnosisLabel.trim(),
      dsm_reference: payload.dsmReference?.trim() || null,
      icd_code: payload.icdCode.trim(),
      notes: payload.notes ?? '',
      severity_level: payload.severityLevel,
      status: payload.status ?? 'active',
    })
    .select(
      'id, athlete_id, practitioner_id, diagnosis_label, dsm_reference, icd_code, notes, severity_level, status, created_at, updated_at, athlete:athletes(id,first_name,last_name,sport,team)'
    )
    .single()

  if (error) throw error
  return mapClinicalRecordRow(data as ClinicalRow)
}

async function updateClinicalRecordDirect(recordId: string, payload: Partial<ClinicalRecordPayload>) {
  requireClinicalSessionForLocalMode()
  const row: Record<string, unknown> = {}

  if (payload.athleteId) row.athlete_id = payload.athleteId
  if (typeof payload.diagnosisLabel === 'string') row.diagnosis_label = payload.diagnosisLabel.trim()
  if (typeof payload.dsmReference === 'string') row.dsm_reference = payload.dsmReference.trim() || null
  if (typeof payload.icdCode === 'string') row.icd_code = payload.icdCode.trim()
  if (typeof payload.notes === 'string') row.notes = payload.notes
  if (payload.severityLevel) row.severity_level = payload.severityLevel
  if (payload.status) row.status = payload.status

  const { data, error } = await supabase
    .from('clinical_records')
    .update(row)
    .eq('id', recordId)
    .select(
      'id, athlete_id, practitioner_id, diagnosis_label, dsm_reference, icd_code, notes, severity_level, status, created_at, updated_at, athlete:athletes(id,first_name,last_name,sport,team)'
    )
    .single()

  if (error) throw error
  return mapClinicalRecordRow(data as ClinicalRow)
}

async function archiveClinicalRecordDirect(recordId: string) {
  return updateClinicalRecordDirect(recordId, { status: 'archived' })
}

async function searchClinicalIcdDirect(query: string) {
  requireClinicalSessionForLocalMode()
  let builder = supabase
    .from('clinical_icd_reference')
    .select('code, title, category')
    .order('code', { ascending: true })
    .limit(20)

  if (query.trim()) {
    const pattern = `%${query.trim().replace(/[%_,]/g, ' ')}%`
    builder = builder.or(`code.ilike.${pattern},title.ilike.${pattern},category.ilike.${pattern}`)
  }

  const { data, error } = await builder
  if (error) throw error
  return (data ?? []) as ClinicalIcdOption[]
}

export async function unlockClinicalAccess(password: string) {
  try {
    const response = await apiJson<{ token: string; expiresAt: number; sessionMinutes: number }>(
      '/api/clinical/access/verify',
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      }
    )

    setClinicalAccessSession({
      token: response.token,
      expiresAt: response.expiresAt,
    })

    return response
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    const storedHash = getLocalClinicalHash()
    if (!storedHash) {
      throw new Error('Create a clinical access password on this device before unlocking the module.')
    }

    const providedHash = await hashClinicalPassword(password)
    if (providedHash !== storedHash) {
      throw new Error('Incorrect clinical access password.')
    }

    const expiresAt = Date.now() + LOCAL_CLINICAL_SESSION_MINUTES * 60 * 1000
    const token = `local-clinical-${expiresAt}`
    setClinicalAccessSession({ token, expiresAt })
    return { token, expiresAt, sessionMinutes: LOCAL_CLINICAL_SESSION_MINUTES }
  }
}

export async function getClinicalAccessStatus() {
  try {
    return await apiJson<ClinicalAccessStatus>('/api/clinical/access/status')
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return getLocalClinicalStatus()
  }
}

export async function setupClinicalAccessPassword(password: string, currentPassword?: string) {
  try {
    return await apiJson<ClinicalAccessStatus>('/api/clinical/access/setup', {
      method: 'POST',
      body: JSON.stringify({
        password,
        currentPassword,
      }),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    const existingHash = getLocalClinicalHash()
    if (existingHash) {
      if (!currentPassword?.trim()) {
        throw new Error('Enter your current clinical access password to replace it.')
      }

      const currentHash = await hashClinicalPassword(currentPassword)
      if (currentHash !== existingHash) {
        throw new Error('Current clinical access password is incorrect.')
      }
    }

    const nextHash = await hashClinicalPassword(password)
    setLocalClinicalHash(nextHash)
    return getLocalClinicalStatus()
  }
}

export function getClinicalSession() {
  return getClinicalAccessSession()
}

export function lockClinicalAccess() {
  clearClinicalAccessSession()
}

export async function listClinicalRecords(filters: {
  athleteId?: string
  status?: 'active' | 'archived' | ''
  search?: string
} = {}) {
  const qs = new URLSearchParams()
  if (filters.athleteId) qs.set('athleteId', filters.athleteId)
  if (filters.status) qs.set('status', filters.status)
  if (filters.search) qs.set('search', filters.search)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  try {
    return await apiJson<ClinicalRecord[]>(`/api/clinical/records${suffix}`, {
      clinicalAuth: true,
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return listClinicalRecordsDirect(filters)
  }
}

export async function createClinicalRecord(payload: ClinicalRecordPayload) {
  try {
    return await apiJson<ClinicalRecord>('/api/clinical/records', {
      method: 'POST',
      clinicalAuth: true,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return createClinicalRecordDirect(payload)
  }
}

export async function updateClinicalRecord(recordId: string, payload: Partial<ClinicalRecordPayload>) {
  try {
    return await apiJson<ClinicalRecord>(`/api/clinical/records/${recordId}`, {
      method: 'PATCH',
      clinicalAuth: true,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return updateClinicalRecordDirect(recordId, payload)
  }
}

export async function archiveClinicalRecord(recordId: string) {
  try {
    return await apiJson<ClinicalRecord>(`/api/clinical/records/${recordId}/archive`, {
      method: 'POST',
      clinicalAuth: true,
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return archiveClinicalRecordDirect(recordId)
  }
}

export async function searchClinicalIcd(query: string) {
  const qs = new URLSearchParams()
  if (query.trim()) qs.set('q', query.trim())

  try {
    return await apiJson<ClinicalIcdOption[]>(`/api/clinical/icd-search?${qs.toString()}`, {
      clinicalAuth: true,
    })
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    return searchClinicalIcdDirect(query)
  }
}

export async function getClinicalOwnerAnalytics() {
  try {
    return await apiJson<ClinicalOwnerAnalytics>('/api/clinical/owner-analytics')
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error
    }

    const { data: totalsRows, error: totalsError } = await supabase
      .from('clinical_records')
      .select('status', { count: 'exact' })
    if (totalsError) throw totalsError

    const { data: trendRows, error: trendError } = await supabase
      .from('clinical_owner_diagnosis_trends')
      .select('*')
      .order('record_count', { ascending: false })
    if (trendError) throw trendError

    const { data: usageRows, error: usageError } = await supabase
      .from('clinical_owner_usage_summary')
      .select('*')
      .order('usage_day', { ascending: false })
      .limit(30)
    if (usageError) throw usageError

    const totalDiagnoses = totalsRows?.length ?? 0
    const activeRecords = totalsRows?.filter((row) => row.status === 'active').length ?? 0
    const archivedRecords = totalsRows?.filter((row) => row.status === 'archived').length ?? 0

    return {
      totals: {
        total_diagnoses: totalDiagnoses,
        active_records: activeRecords,
        archived_records: archivedRecords,
      },
      usage: (usageRows ?? []) as ClinicalOwnerAnalytics['usage'],
      trends: (trendRows ?? []) as ClinicalOwnerAnalytics['trends'],
    }
  }
}
