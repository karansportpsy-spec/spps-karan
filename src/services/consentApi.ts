import { apiJson } from '@/lib/apiClient';

export type ConsentPayload = {
  athleteId: string;
  formType: string;
  status?: 'pending' | 'signed' | 'expired' | 'uploaded';
  signedBy: string;
  signedAt?: string;
  validUntil?: string;
  notes?: string;
  digitalSignature?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  formData?: Record<string, unknown>;
};

export async function createConsent(payload: ConsentPayload) {
  return apiJson('/api/consents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteConsent(consentId: string) {
  await apiJson(`/api/consents/${consentId}`, {
    method: 'DELETE',
  });
}

export async function listConsents(athleteId?: string, preferAthleteToken = false) {
  const qs = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
  return apiJson(`/api/consents${qs}`, {
    preferAthleteToken,
  });
}
