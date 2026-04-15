import { apiJson } from '@/lib/apiClient';

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
  return apiJson<InjuryPsychologyLog[]>(`/api/injury-psychology-logs?athleteId=${encodeURIComponent(athleteId)}`, {
    preferAthleteToken,
  });
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
  return apiJson<InjuryPsychologyLog>('/api/injury-psychology-logs', {
    method: 'POST',
    body: JSON.stringify(payload),
    preferAthleteToken,
  });
}
