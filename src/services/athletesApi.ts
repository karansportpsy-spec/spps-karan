import { apiFetch, apiJson } from '@/lib/apiClient';

export async function downloadAthletesCsv(ids?: string[]) {
  const params = new URLSearchParams();
  if (ids && ids.length > 0) {
    params.set('ids', ids.join(','));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/athletes/export${suffix}`);
  if (!res.ok) {
    throw new Error('Failed to export athletes CSV.');
  }

  const blob = await res.blob();
  const filename = getFilename(res) || `athletes_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(blob, filename);
}

export async function downloadAthleteCsv(athleteId: string) {
  const res = await apiFetch(`/api/athletes/${athleteId}/export`);
  if (!res.ok) {
    throw new Error('Failed to export athlete CSV.');
  }

  const blob = await res.blob();
  const filename = getFilename(res) || `athlete_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(blob, filename);
}

export async function setAthletePortalActivation(
  athleteId: string,
  isPortalActivated: boolean,
  sendActivationEmail = false
) {
  return apiJson<{ message: string; athlete: any; activationEmailSent: boolean }>(
    `/api/athletes/${athleteId}/portal-activation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isPortalActivated, sendActivationEmail }),
    }
  );
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
