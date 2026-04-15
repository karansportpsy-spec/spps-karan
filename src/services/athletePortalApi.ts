import { apiJson, clearAthleteAccessToken, setAthleteAccessToken } from '@/lib/apiClient';

const ATHLETE_PROFILE_KEY = 'spps-athlete-profile';

export type AthletePortalProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  sport?: string;
  team?: string;
};

export async function loginAthletePortal(email: string, password: string) {
  const result = await apiJson<{
    accessToken: string;
    refreshToken: string;
    athlete: AthletePortalProfile;
    message: string;
  }>('/api/auth/athlete/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    noAuth: true,
  });

  setAthleteAccessToken(result.accessToken);
  localStorage.setItem(ATHLETE_PROFILE_KEY, JSON.stringify(result.athlete));
  return result;
}

export function getStoredAthleteProfile(): AthletePortalProfile | null {
  const raw = localStorage.getItem(ATHLETE_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AthletePortalProfile;
  } catch {
    return null;
  }
}

export function logoutAthletePortal() {
  clearAthleteAccessToken();
  localStorage.removeItem(ATHLETE_PROFILE_KEY);
}

export async function fetchAthletePortalContext() {
  return apiJson<{
    user: { id: string; role: 'athlete' | 'practitioner' | 'admin' };
    athlete: AthletePortalProfile & { practitioner_id: string; is_portal_activated?: boolean };
  }>('/api/auth/me', {
    preferAthleteToken: true,
  });
}
