import { supabase } from '@/lib/supabase';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:4000';
  }

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  return isLocalhost ? 'http://localhost:4000' : origin;
}

export const API_BASE_URL = resolveApiBaseUrl();
const ATHLETE_TOKEN_KEY = 'spps-athlete-access-token';

export function setAthleteAccessToken(token: string) {
  localStorage.setItem(ATHLETE_TOKEN_KEY, token);
}

export function clearAthleteAccessToken() {
  localStorage.removeItem(ATHLETE_TOKEN_KEY);
}

export function getAthleteAccessToken() {
  return localStorage.getItem(ATHLETE_TOKEN_KEY);
}

export async function getAuthToken(preferAthleteToken = false): Promise<string | null> {
  if (preferAthleteToken) {
    const athleteToken = getAthleteAccessToken();
    if (athleteToken) return athleteToken;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  return getAthleteAccessToken();
}

export async function apiFetch(
  path: string,
  init: RequestInit & { preferAthleteToken?: boolean; noAuth?: boolean } = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');

  if (!init.noAuth) {
    const token = await getAuthToken(Boolean(init.preferAthleteToken));
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

export async function apiJson<T>(
  path: string,
  init: RequestInit & { preferAthleteToken?: boolean; noAuth?: boolean } = {}
): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const err = await safeError(res);
    throw new Error(err || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

async function safeError(res: Response): Promise<string | null> {
  try {
    const payload = await res.json();
    if (typeof payload?.message === 'string') return payload.message;
    return null;
  } catch {
    return null;
  }
}
