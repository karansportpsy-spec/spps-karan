import { apiJson } from '@/lib/apiClient';

export type InterventionAssignment = {
  id: string;
  intervention_program_id: string;
  athlete_id: string;
  practitioner_id: string;
  assigned_at: string;
  due_date?: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'paused';
  completion_percentage: number;
  title?: string;
  description?: string;
  duration_weeks?: number;
  milestones?: string[];
  athlete_first_name?: string;
  athlete_last_name?: string;
};

export type InterventionProgressEntry = {
  id: string;
  athlete_intervention_id: string;
  progress_note?: string;
  progress_percentage: number;
  status: 'in_progress' | 'completed' | 'blocked';
  created_at: string;
};

export async function assignInterventionProgram(payload: {
  athleteId: string;
  programId?: string;
  title?: string;
  description?: string;
  durationWeeks?: number;
  milestones?: string[];
  dueDate?: string;
}) {
  return apiJson<InterventionAssignment>('/api/interventions/assign', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getInterventionAssignments(athleteId?: string, preferAthleteToken = false) {
  const qs = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
  return apiJson<InterventionAssignment[]>(`/api/interventions/assignments${qs}`, {
    preferAthleteToken,
  });
}

export async function addInterventionProgress(
  assignmentId: string,
  payload: { progressPercentage: number; status: 'in_progress' | 'completed' | 'blocked'; progressNote?: string },
  preferAthleteToken = false
) {
  return apiJson<InterventionProgressEntry>(`/api/interventions/assignments/${assignmentId}/progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
    preferAthleteToken,
  });
}

export async function getInterventionProgress(assignmentId: string, preferAthleteToken = false) {
  return apiJson<InterventionProgressEntry[]>(`/api/interventions/assignments/${assignmentId}/progress`, {
    preferAthleteToken,
  });
}
