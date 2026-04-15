import { apiJson } from '@/lib/apiClient';

export type AssessmentBundlePayload = {
  athleteId: string;
  mentalHealth?: {
    tool?: string;
    scores: Record<string, number | string>;
    totalScore?: number;
    interpretation?: string;
    notes?: string;
  };
  psychophysiology?: Record<string, unknown>;
  neurocognitive?: Record<string, unknown>;
};

export async function saveAssessmentBundle(payload: AssessmentBundlePayload) {
  return apiJson<{ message: string; bundle: any }>('/api/assessments/bundle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
