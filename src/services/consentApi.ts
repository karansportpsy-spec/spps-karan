import { apiJson } from '@/lib/apiClient';
import { getErrorMessage, shouldFallbackToDirectDb } from '@/lib/apiFallback';
import { supabase } from '@/lib/supabase';

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

function getFormTypeCandidates(formType: string): string[] {
  const normalized = (formType || '').trim().toLowerCase();
  const base = [normalized].filter(Boolean);

  const map: Record<string, string[]> = {
    consent_confidentiality: ['consent', 'informed_consent', 'confidentiality'],
    parental_release: ['parental_consent', 'guardian_consent', 'guardian_release'],
    photo_media: ['media_release', 'photo_release', 'image_release'],
    emergency_medical: ['medical_authority', 'emergency_consent', 'emergency_medical_authority'],
  };

  const extras = map[normalized] ?? [];
  return Array.from(new Set([...base, ...extras]));
}

export async function createConsent(payload: ConsentPayload) {
  try {
    return await apiJson('/api/consents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    const canFallback =
      shouldFallbackToDirectDb(error) ||
      message.includes('failed to save consent form');
    if (!canFallback) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    const signedAtIso = payload.signedAt
      ? new Date(payload.signedAt).toISOString()
      : new Date().toISOString();
    const validUntilIso = payload.validUntil ? new Date(payload.validUntil).toISOString() : null;

    const formTypeCandidates = getFormTypeCandidates(payload.formType);
    const row: Record<string, unknown> = {
      practitioner_id: practitionerId,
      athlete_id: payload.athleteId,
      form_type: formTypeCandidates[0] || payload.formType,
      status: payload.status ?? 'signed',
      signed_by: payload.signedBy,
      signed_at: signedAtIso,
      signed_timestamp: signedAtIso,
      valid_until: validUntilIso,
      notes: payload.notes ?? null,
      digital_signature: payload.digitalSignature ?? payload.signedBy,
      guardian_name: payload.guardianName ?? null,
      guardian_relationship: payload.guardianRelationship ?? null,
      guardian_email: payload.guardianEmail ?? null,
      guardian_phone: payload.guardianPhone ?? null,
      form_data: payload.formData ?? {},
    };

    const missingColumnRegex =
      /Could not find the ['"]([^'"]+)['"] column|column ["']([^"']+)["'] of relation ["']consent_forms["'] does not exist/i;
    const removedColumns = new Set<string>();

    let formTypeCandidateIndex = 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data, error: insertError } = await supabase
        .from('consent_forms')
        .insert(row)
        .select()
        .single();

      if (!insertError) {
        return data;
      }

      const message = insertError.message ?? '';
      if (
        insertError.code === '23514' &&
        message.includes('consent_forms_form_type_check') &&
        formTypeCandidateIndex < formTypeCandidates.length - 1
      ) {
        formTypeCandidateIndex += 1;
        row.form_type = formTypeCandidates[formTypeCandidateIndex];
        continue;
      }

      const match = message.match(missingColumnRegex);
      const missingColumn = match?.[1] ?? match?.[2];

      if (!missingColumn || !(missingColumn in row) || removedColumns.has(missingColumn)) {
        throw insertError;
      }

      delete row[missingColumn];
      removedColumns.add(missingColumn);
    }

    throw new Error('Failed to save consent form after compatibility retries.');
  }
}

export async function deleteConsent(consentId: string) {
  try {
    await apiJson(`/api/consents/${consentId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (!shouldFallbackToDirectDb(error) && !message.includes('failed to delete consent form')) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    const { error: deleteError } = await supabase
      .from('consent_forms')
      .delete()
      .eq('id', consentId)
      .eq('practitioner_id', practitionerId);
    if (deleteError) throw deleteError;
  }
}

export async function listConsents(athleteId?: string, preferAthleteToken = false) {
  const qs = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
  try {
    return await apiJson(`/api/consents${qs}`, {
      preferAthleteToken,
    });
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (!shouldFallbackToDirectDb(error) && !message.includes('failed to fetch consent forms')) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    let query = supabase
      .from('consent_forms')
      .select('*')
      .eq('practitioner_id', practitionerId)
      .order('created_at', { ascending: false });
    if (athleteId) {
      query = query.eq('athlete_id', athleteId);
    }

    const { data, error: listError } = await query;
    if (listError) throw listError;
    return data ?? [];
  }
}
