import { apiFetch, apiJson } from '@/lib/apiClient';
import { shouldFallbackToDirectDb } from '@/lib/apiFallback';
import { supabase } from '@/lib/supabase';

export async function downloadAthletesCsv(ids?: string[]) {
  const params = new URLSearchParams();
  if (ids && ids.length > 0) {
    params.set('ids', ids.join(','));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  try {
    const res = await apiFetch(`/api/athletes/export${suffix}`);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const blob = await res.blob();
    const filename = getFilename(res) || `athletes_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(blob, filename);
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }
    await downloadAthletesCsvFromDb(ids);
  }
}

export async function downloadAthleteCsv(athleteId: string) {
  try {
    const res = await apiFetch(`/api/athletes/${athleteId}/export`);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const blob = await res.blob();
    const filename = getFilename(res) || `athlete_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(blob, filename);
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }
    await downloadAthletesCsvFromDb([athleteId]);
  }
}

export async function setAthletePortalActivation(
  athleteId: string,
  isPortalActivated: boolean,
  sendActivationEmail = false
) {
  try {
    return await apiJson<{
      message: string;
      athlete: any;
      activationEmailSent: boolean;
      portalLoginUrl?: string | null;
      portalInviteUrl?: string | null;
    }>(
      `/api/athletes/${athleteId}/portal-activation`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isPortalActivated, sendActivationEmail }),
      }
    );
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    const nowIso = new Date().toISOString();
    const baseUrl = window.location.origin.replace(/\/+$/, '');
    const portalLoginUrl = `${baseUrl}/athlete/login`;
    let portalInviteUrl: string | null = null;
    let activationEmailSent = false;
    const updatePayload: Record<string, unknown> = {
      is_portal_activated: isPortalActivated,
      portal_activated_at: isPortalActivated ? nowIso : null,
    };

    const { data, error: updateError } = await supabase
      .from('athletes')
      .update(updatePayload)
      .eq('id', athleteId)
      .eq('practitioner_id', practitionerId)
      .select('id,email,is_portal_activated,portal_activated_at')
      .single();

    if (updateError) throw updateError;

    if (isPortalActivated && data?.email) {
      try {
        const { data: inviteData } = await supabase
          .from('athlete_invites')
          .insert({
            practitioner_id: practitionerId,
            athlete_id: athleteId,
            email: data.email,
          })
          .select('token')
          .single();

        if (inviteData?.token) {
          portalInviteUrl = `${baseUrl}/athlete/accept-invite?token=${inviteData.token}&email=${encodeURIComponent(
            data.email
          )}`;
        }
      } catch {
        // Invite table might not be available in fallback mode.
      }

      if (sendActivationEmail) {
        // Fallback notification path when API routes are unavailable.
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(data.email, {
          redirectTo: portalInviteUrl || portalLoginUrl,
        });
        if (!resetErr) {
          activationEmailSent = true;
        } else {
          const { error: otpErr } = await supabase.auth.signInWithOtp({
            email: data.email,
            options: {
              emailRedirectTo: portalInviteUrl || portalLoginUrl,
              shouldCreateUser: true,
              data: {
                role: 'athlete',
              },
            },
          });
          activationEmailSent = !otpErr;
        }
      }
    }

    return {
      message: isPortalActivated ? 'Athlete portal activated.' : 'Athlete portal deactivated.',
      athlete: data,
      activationEmailSent,
      portalLoginUrl: isPortalActivated ? portalLoginUrl : null,
      portalInviteUrl: isPortalActivated ? portalInviteUrl : null,
    };
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getFilename(res: Response) {
  const disposition = res.headers.get('Content-Disposition') || res.headers.get('content-disposition');
  if (!disposition) return null;
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  return match?.[1] || null;
}

type AthleteCsvRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  sport: string | null;
  team: string | null;
  country: string | null;
  status: string | null;
  risk_level: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  is_portal_activated: boolean | null;
  portal_activated_at: string | null;
  created_at: string | null;
};

const ATHLETE_CSV_COLUMNS: Array<keyof AthleteCsvRow> = [
  'id',
  'first_name',
  'last_name',
  'email',
  'sport',
  'team',
  'country',
  'status',
  'risk_level',
  'date_of_birth',
  'gender',
  'phone',
  'is_portal_activated',
  'portal_activated_at',
  'created_at',
];

async function downloadAthletesCsvFromDb(ids?: string[]) {
  const { data: authData } = await supabase.auth.getUser();
  const practitionerId = authData.user?.id;
  if (!practitionerId) {
    throw new Error('Not authenticated.');
  }

  let query = supabase
    .from('athletes')
    .select(
      'id,first_name,last_name,email,sport,team,country,status,risk_level,date_of_birth,gender,phone,is_portal_activated,portal_activated_at,created_at'
    )
    .eq('practitioner_id', practitionerId)
    .order('created_at', { ascending: false });

  if (ids && ids.length > 0) {
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as AthleteCsvRow[];
  const csv = rowsToCsv(rows);
  const filename =
    rows.length === 1
      ? `athlete_${rows[0].id}_${new Date().toISOString().slice(0, 10)}.csv`
      : `athletes_${new Date().toISOString().slice(0, 10)}.csv`;

  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

function rowsToCsv(rows: AthleteCsvRow[]) {
  const header = ATHLETE_CSV_COLUMNS.join(',');
  const lines = rows.map((row) =>
    ATHLETE_CSV_COLUMNS.map((column) => csvEscape(row[column])).join(',')
  );
  return [header, ...lines].join('\n');
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}
