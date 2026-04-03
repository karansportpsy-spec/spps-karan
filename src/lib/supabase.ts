import { createClient } from '@supabase/supabase-js'

// ── Credentials from environment variables ────────────────────
// Copy .env.example → .env and fill in your Supabase project values.
// Get them from: Supabase Dashboard → Settings → API

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    '[SPPS] Missing Supabase credentials.\n' +
    'Copy .env.example → .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storageKey:         'spps-auth',
  },
  global: {
    headers: { 'x-application-name': 'spps-v2' },
  },
})

export type SupabaseClient = typeof supabase

// Convenience: typed table helper
export const db = supabase.from.bind(supabase)
