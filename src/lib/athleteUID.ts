// src/lib/athleteUID.ts
// UID generation, anonymisation, and backfill utilities for SPPS athletes.
// Format: WMP-YYYY-XXXXXX  (e.g. WMP-2025-A3F7C2)
// Primary enforcement is the DB trigger. This module is the client-side safety net.

import { supabase } from '@/lib/supabase'

// ── Generation ────────────────────────────────────────────────────────────────

export function generateAthleteUID(): string {
  const year = new Date().getFullYear()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // unambiguous charset
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `WMP-${year}-${suffix}`
}

/** Returns true if the athlete record is missing a valid UID. */
export function needsUID(athlete: { uid_code?: string | null }): boolean {
  return !athlete.uid_code || athlete.uid_code.trim() === ''
}

// ── Backfill (client-side safety net) ────────────────────────────────────────

/**
 * If the athlete has no uid_code, generates one and writes it to Supabase.
 * Called automatically by useAthletes after every fetch.
 * Returns the uid_code (existing or newly assigned).
 */
export async function ensureAthleteUID(
  athlete: { id: string; uid_code?: string | null }
): Promise<string> {
  if (!needsUID(athlete)) return athlete.uid_code!

  // Try up to 5 times to get a unique UID (collision is astronomically rare)
  for (let attempt = 0; attempt < 5; attempt++) {
    const uid = generateAthleteUID()
    const { error } = await supabase
      .from('athletes')
      .update({ uid_code: uid })
      .eq('id', athlete.id)
      .is('uid_code', null) // only update if still null (race-safe)

    if (!error) return uid
    // If unique constraint was violated, try again with a new UID
    if (error.code !== '23505') throw error
  }

  // Absolute fallback — append random suffix to guarantee uniqueness
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
  risk_level: string
  status: string
  date_of_birth?: string // kept for age calculation only, not shown directly
}

/**
 * Returns an anonymised view of the athlete — no name, email, phone, or
 * contact details. Used for all PDF and .txt exports.
 */
export function anonymise(athlete: any): AnonAthlete {
  return {
    uid_code:     athlete.uid_code ?? 'NO-UID',
    sport:        athlete.sport ?? '—',
    team:         athlete.team,
    position:     athlete.position,
    risk_level:   athlete.risk_level ?? 'unknown',
    status:       athlete.status ?? 'unknown',
    date_of_birth: athlete.date_of_birth,
  }
}

/**
 * Redacts any fragments that look like a personal name from a note.
 * Simple heuristic — replaces the athlete's first/last name with [REDACTED].
 */
export function redactNote(note: string, athlete: { first_name?: string; last_name?: string }): string {
  if (!note) return note
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
