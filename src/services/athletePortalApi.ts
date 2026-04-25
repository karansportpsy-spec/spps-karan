import { supabase } from '@/lib/supabase';
import { clearAthleteAccessToken, setAthleteAccessToken } from '@/lib/apiClient';
import { shouldFallbackToDirectDb } from '@/lib/apiFallback';
import type { AthleteProfile } from '@/contexts/AuthContext';
import type { PortalSummary } from '@/contexts/PortalContext';

const ATHLETE_PROFILE_KEY = 'spps-athlete-profile';

export type AthletePortalProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  sport?: string;
  team?: string;
};

export type AthletePortalContext = {
  user: { id: string; role: 'athlete' };
  athlete: AthletePortalProfile & {
    practitioner_id: string;
    is_portal_activated?: boolean;
  };
  summary: PortalSummary | null;
};

function isAthleteUser(user: { user_metadata?: Record<string, unknown> } | null) {
  return user?.user_metadata?.role === 'athlete';
}

function toPortalProfile(athlete: AthleteProfile): AthletePortalProfile {
  return {
    id: athlete.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    email: athlete.email,
    sport: athlete.sport ?? undefined,
    team: athlete.team ?? undefined,
  };
}

function persistAthleteProfile(profile: AthletePortalProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATHLETE_PROFILE_KEY, JSON.stringify(profile));
}

async function fetchAthleteProfile(userId: string): Promise<AthleteProfile> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (data) {
    return data as AthleteProfile;
  }

  if (error) {
    console.error('[SPPS Athlete Portal] profile fetch by id failed:', error.message);
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('athletes')
    .select('*')
    .eq('portal_user_id', userId)
    .maybeSingle();

  if (legacyError) {
    if (legacyError.code !== '42703') {
      console.error('[SPPS Athlete Portal] profile fetch by portal_user_id failed:', legacyError.message);
      throw legacyError;
    }
  }

  if (!legacyData) {
    throw new Error('Signed in, but no athlete profile exists for this account.');
  }

  return legacyData as AthleteProfile;
}

export async function fetchAthletePortalSummary(): Promise<PortalSummary | null> {
  const { data, error } = await supabase.rpc('athlete_portal_summary');
  if (error) {
    if (shouldFallbackToDirectDb(error)) {
      console.warn('[SPPS Athlete Portal] summary RPC unavailable, continuing without summary:', error.message);
      return null;
    }
    console.error('[SPPS Athlete Portal] summary fetch failed:', error.message);
    throw error;
  }

  if (!data || (data as any).ok !== true) return null;
  return data as PortalSummary;
}

export async function loginAthletePortal(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;

  if (!data.user || !data.session) {
    throw new Error('Athlete sign in did not return an authenticated session.');
  }

  if (!isAthleteUser(data.user)) {
    await supabase.auth.signOut();
    throw new Error('This account is not an athlete account. Please use the practitioner portal.');
  }

  const athlete = toPortalProfile(await fetchAthleteProfile(data.user.id));
  persistAthleteProfile(athlete);
  setAthleteAccessToken(data.session.access_token);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    athlete,
    message: 'Athlete signed in.',
  };
}

export function getStoredAthleteProfile(): AthletePortalProfile | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(ATHLETE_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AthletePortalProfile;
  } catch {
    localStorage.removeItem(ATHLETE_PROFILE_KEY);
    return null;
  }
}

export function logoutAthletePortal() {
  clearAthleteAccessToken();

  if (typeof window !== 'undefined') {
    localStorage.removeItem(ATHLETE_PROFILE_KEY);
  }

  void supabase.auth.signOut();
}

export async function fetchAthletePortalContext(): Promise<AthletePortalContext> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const user = userData.user;
  if (!user) throw new Error('No authenticated athlete session was found.');

  if (!isAthleteUser(user)) {
    throw new Error('The current session is not an athlete session.');
  }

  const [athleteRecord, summary] = await Promise.all([
    fetchAthleteProfile(user.id),
    fetchAthletePortalSummary(),
  ]);

  const athlete = toPortalProfile(athleteRecord);
  persistAthleteProfile(athlete);

  return {
    user: { id: user.id, role: 'athlete' },
    athlete: {
      ...athlete,
      practitioner_id: summary?.active_links[0]?.practitioner_id ?? '',
      is_portal_activated: athleteRecord.status !== 'unverified',
    },
    summary,
  };
}
