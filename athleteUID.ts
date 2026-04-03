// src/lib/athleteUID.ts
// UID generation, anonymisation, and backfill utilities for SPPS athletes.
// Format: WMP-YYYY-XXXXXX  (e.g. WMP-2025-A3F7C2)

import { supabase } from '@/lib/supabase'

// ── Generation ────────────────────────────────────────────────────────────────

export function generateAthleteUID(): string {
  const year = new Date().getFullYear()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `WMP-${year}-${suffix}`
}

export function needsUID(athlete: { uid_code?: string | null }): boolean {
  return !athlete.uid_code || athlete.uid_code.trim() === ''
}

// ── Backfill ──────────────────────────────────────────────────────────────────

export async function ensureAthleteUID(
  athlete: { id: string; uid_code?: string | null }
): Promise<string> {
  if (!needsUID(athlete)) return athlete.uid_code!

  for (let attempt = 0; attempt < 5; attempt++) {
    const uid = generateAthleteUID()
    const { error } = await supabase
      .from('athletes')
      .update({ uid_code: uid })
      .eq('id', athlete.id)
      .is('uid_code', null)

    if (!error) return uid
    if (error.code !== '23505') throw error
  }

  const uid = generateAthleteUID() + Math.random().toString(36).slice(2, 4).toUpperCase()
  await supabase.from('athletes').update({ uid_code: uid }).eq('id', athlete.id)
  return uid
}

// ── Anonymisation ─────────────────────────────────────────────────────────────

export interface AnonAthlete {
  uid_code: string
  sport: string
  team?: string
  position?: string
  age_group?: string     // FIX: added — used in PDF/txt export headers
  risk_level: string
  status: string
  date_of_birth?: string
}

/**
 * Returns an anonymised view of the athlete — no name, email, phone, or
 * contact details. Used for all PDF and .txt exports.
 */
export function anonymise(athlete: any): AnonAthlete {
  // Derive age_group from date_of_birth if not stored directly
  let age_group = athlete.age_group
  if (!age_group && athlete.date_of_birth) {
    const age = new Date().getFullYear() - new Date(athlete.date_of_birth).getFullYear()
    if (age < 15)      age_group = 'U15'
    else if (age < 18) age_group = 'U18'
    else if (age < 23) age_group = 'U23'
    else if (age < 40) age_group = 'Senior'
    else               age_group = 'Masters'
  }

  return {
    uid_code:      athlete.uid_code ?? 'NO-UID',
    sport:         athlete.sport ?? '—',
    team:          athlete.team,
    position:      athlete.position,
    age_group:     age_group ?? '—',
    risk_level:    athlete.risk_level ?? 'unknown',
    status:        athlete.status ?? 'unknown',
    date_of_birth: athlete.date_of_birth,
  }
}

/**
 * Redacts athlete name fragments from a note string.
 */
export function redactNote(note: string, athlete: { first_name?: string; last_name?: string } | string): string {
  if (!note) return note
  // FIX: handle case where athlete is passed as a string (legacy call)
  if (typeof athlete === 'string') return note
  let out = note
  if (athlete.first_name) {
    out = out.replace(new RegExp(athlete.first_name, 'gi'), '[REDACTED]')
  }
  if (athlete.last_name) {
    out = out.replace(new RegExp(athlete.last_name, 'gi'), '[REDACTED]')
  }
  return out
}

export const ANONYMISATION_DISCLAIMER =
  'This document contains no personally identifiable information. ' +
  'Athlete identity is resolvable only by the authorised practitioner via the UID code. ' +
  'DPDP Act 2023 compliant. Unauthorised distribution is prohibited.'
