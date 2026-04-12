import { createClient } from '@supabase/supabase-js'

// ── Credentials from environment variables ────────────────────
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel
// Environment Variables (Settings → Environment Variables) and redeploy.

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Log a clear warning in the console instead of throwing.
// A module-level throw fires BEFORE React mounts — producing a completely
// blank page with no error UI. This way the app still renders and the
// practitioner sees a useful error message.
if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error(
    '[SPPS] Missing Supabase credentials.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Vercel\n' +
    'Environment Variables, then trigger a Redeploy so Vite can bake\n' +
    'the values into the production bundle.'
  )
}

export const supabase = createClient(
  SUPABASE_URL  ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON ?? 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: true,
      // storageKey is intentionally NOT set.
      // The old 'spps-auth' key caused a conflict: AuthContext cleanup only
      // scanned for 'sb-*' keys, so corrupted sessions were never cleared,
      // producing infinite spinners. Supabase's default key ('sb-<ref>-auth-token')
      // is correct and works with the existing cleanup code.
    },
    global: {
      headers: { 'x-application-name': 'spps-v2' },
    },
  }
)

export type SupabaseClient = typeof supabase

// Convenience: typed table helper
export const db = supabase.from.bind(supabase)
