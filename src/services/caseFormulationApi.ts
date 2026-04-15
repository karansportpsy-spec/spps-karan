import { apiJson } from '@/lib/apiClient';

export type DailyLogSummary = {
  athlete_id: string;
  total_logs: number;
  last_log_at?: string;
  avg_mood?: number;
  avg_stress?: number;
  avg_readiness?: number;
  avg_sleep_hours?: number;
  recent_logs: Array<{
    id: string;
    created_at: string;
    mood_score?: number;
    stress_score?: number;
    sleep_hours?: number;
    readiness_score?: number;
    reflection?: string;
  }>;
};

export async function fetchCaseDailyLogSummary(athleteId: string) {
  return apiJson<{ dailySummary: DailyLogSummary; latestCaseFormulation: any }>(
    `/api/case-formulations/${athleteId}/daily-summary`
  );
}

export async function createDailyLog(
  payload: {
    athleteId: string;
    moodScore?: number;
    stressScore?: number;
    sleepHours?: number;
    readinessScore?: number;
    reflection?: string;
  },
  preferAthleteToken = false
) {
  return apiJson('/api/daily-logs', {
    method: 'POST',
    body: JSON.stringify(payload),
    preferAthleteToken,
  });
}
