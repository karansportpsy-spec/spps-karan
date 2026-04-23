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
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (error) {
    console.error('[SPPS API] Network request failed:', { path, error });
    throw new Error(`Network request failed for ${path}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const err = await safeError(res);
    console.error('[SPPS API] Request failed:', { path, status: res.status, contentType, err });
    throw new Error(err || `Request failed with status ${res.status}`);
  }

  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await res.text();
    console.error('[SPPS API] Expected JSON but received:', {
      path,
      status: res.status,
      contentType,
      bodyPreview: body.slice(0, 200),
    });
    throw new Error(`Expected JSON response from ${path}, received ${contentType || 'unknown content type'}.`);
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
