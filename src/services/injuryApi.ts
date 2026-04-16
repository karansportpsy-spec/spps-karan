import { apiJson } from '@/lib/apiClient';
import { getErrorMessage, shouldFallbackToDirectDb } from '@/lib/apiFallback';
import { supabase } from '@/lib/supabase';

export type InjuryPsychologyLog = {
  id: string;
  athlete_id: string;
  practitioner_id: string;
  injury_record_id?: string;
  mood_score?: number;
  stress_score?: number;
  confidence_score?: number;
  pain_acceptance_score?: number;
  reflection: string;
  created_at: string;
};

export async function listInjuryPsychologyLogs(athleteId: string, preferAthleteToken = false) {
  try {
    return await apiJson<InjuryPsychologyLog[]>(`/api/injury-psychology-logs?athleteId=${encodeURIComponent(athleteId)}`, {
      preferAthleteToken,
    });
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    const canFallback =
      shouldFallbackToDirectDb(error) ||
      message.includes('failed to fetch injury psychology logs');
    if (!canFallback) {
      throw error;
    }

    const { data, error: listError } = await supabase
      .from('injury_psychology_logs')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });

    if (listError) throw listError;
    return (data ?? []) as InjuryPsychologyLog[];
  }
}

export async function createInjuryPsychologyLog(
  payload: {
    athleteId: string;
    injuryRecordId?: string;
    moodScore?: number;
    stressScore?: number;
    confidenceScore?: number;
    painAcceptanceScore?: number;
    reflection: string;
  },
  preferAthleteToken = false
) {
  try {
    return await apiJson<InjuryPsychologyLog>('/api/injury-psychology-logs', {
      method: 'POST',
      body: JSON.stringify(payload),
      preferAthleteToken,
    });
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    const canFallback =
      shouldFallbackToDirectDb(error) ||
      message.includes('failed to save injury psychology log');
    if (!canFallback) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    const { data, error: insertError } = await supabase
      .from('injury_psychology_logs')
      .insert({
        athlete_id: payload.athleteId,
        practitioner_id: practitionerId,
        injury_record_id: payload.injuryRecordId ?? null,
        mood_score: payload.moodScore ?? null,
        stress_score: payload.stressScore ?? null,
        confidence_score: payload.confidenceScore ?? null,
        pain_acceptance_score: payload.painAcceptanceScore ?? null,
        reflection: payload.reflection,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return data as InjuryPsychologyLog;
  }
}
