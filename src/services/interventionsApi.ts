import { apiJson } from '@/lib/apiClient';
import { shouldFallbackToDirectDb } from '@/lib/apiFallback';
import { supabase } from '@/lib/supabase';

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

function mapAssignmentRow(row: any): InterventionAssignment {
  return {
    id: row.id,
    intervention_program_id: row.intervention_program_id,
    athlete_id: row.athlete_id,
    practitioner_id: row.practitioner_id,
    assigned_at: row.assigned_at,
    due_date: row.due_date ?? undefined,
    status: row.status,
    completion_percentage: Number(row.completion_percentage || 0),
    title: row.intervention_program?.title ?? row.title,
    description: row.intervention_program?.description ?? row.description,
    duration_weeks: row.intervention_program?.duration_weeks ?? row.duration_weeks,
    milestones: row.intervention_program?.milestones ?? row.milestones,
    athlete_first_name: row.athlete?.first_name ?? row.athlete_first_name,
    athlete_last_name: row.athlete?.last_name ?? row.athlete_last_name,
  };
}

async function requireCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const PROGRAM_MISSING_COLUMN_REGEX =
  /Could not find the ['"]([^'"]+)['"] column|column ["']([^"']+)["'] of relation ["']intervention_programs["'] does not exist/i;

export async function assignInterventionProgram(payload: {
  athleteId: string;
  programId?: string;
  title?: string;
  description?: string;
  durationWeeks?: number;
  milestones?: string[];
  dueDate?: string;
}) {
  try {
    return await apiJson<InterventionAssignment>('/api/interventions/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const practitionerId = await requireCurrentUserId();
    if (!practitionerId) {
      throw error;
    }

    let programId = payload.programId;

    if (!programId) {
      if (!payload.title) {
        throw new Error('Provide programId or title to create a program.');
      }
      const row: Record<string, unknown> = {
        practitioner_id: practitionerId,
        title: payload.title,
        description: payload.description ?? null,
        duration_weeks: payload.durationWeeks ?? null,
        milestones: payload.milestones ?? [],
      };
      const removedColumns = new Set<string>();
      let createdProgram: { id: string } | null = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: program, error: programError } = await supabase
          .from('intervention_programs')
          .insert(row)
          .select('id')
          .single();

        if (!programError) {
          createdProgram = program as { id: string };
          break;
        }

        const message = programError.message ?? '';
        const match = message.match(PROGRAM_MISSING_COLUMN_REGEX);
        const missingColumn = match?.[1] ?? match?.[2];
        if (missingColumn && missingColumn in row && !removedColumns.has(missingColumn)) {
          delete row[missingColumn];
          removedColumns.add(missingColumn);
          continue;
        }

        throw programError;
      }

      if (!createdProgram?.id) {
        throw new Error('Failed to create intervention program after compatibility retries.');
      }
      programId = createdProgram.id;
    }

    const insertAssignment = {
      intervention_program_id: programId,
      athlete_id: payload.athleteId,
      practitioner_id: practitionerId,
      due_date: payload.dueDate ?? null,
      status: 'assigned',
      completion_percentage: 0,
    };

    let assignment: any = null;
    let assignmentError: any = null;

    const primarySelect =
      '*, intervention_program:intervention_programs(title,description,duration_weeks,milestones), athlete:athletes(first_name,last_name)';
    const fallbackSelect =
      '*, intervention_program:intervention_programs(title,description,duration_weeks), athlete:athletes(first_name,last_name)';

    ({ data: assignment, error: assignmentError } = await supabase
      .from('athlete_interventions')
      .insert(insertAssignment)
      .select(primarySelect)
      .single());

    if (assignmentError && /milestones/i.test(assignmentError.message ?? '')) {
      ({ data: assignment, error: assignmentError } = await supabase
        .from('athlete_interventions')
        .insert(insertAssignment)
        .select(fallbackSelect)
        .single());
    }

    if (assignmentError) throw assignmentError;
    return mapAssignmentRow(assignment);
  }
}

export async function getInterventionAssignments(athleteId?: string, preferAthleteToken = false) {
  const qs = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
  try {
    return await apiJson<InterventionAssignment[]>(`/api/interventions/assignments${qs}`, {
      preferAthleteToken,
    });
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const userId = await requireCurrentUserId();
    if (!userId) {
      throw error;
    }

    const primarySelect =
      '*, intervention_program:intervention_programs(title,description,duration_weeks,milestones), athlete:athletes(first_name,last_name)';
    const fallbackSelect =
      '*, intervention_program:intervention_programs(title,description,duration_weeks), athlete:athletes(first_name,last_name)';

    const buildQuery = (selectExpr: string) => {
      let query = supabase
        .from('athlete_interventions')
        .select(selectExpr)
        .order('assigned_at', { ascending: false });

      if (athleteId) {
        query = query.eq('athlete_id', athleteId);
      } else if (!preferAthleteToken) {
        query = query.eq('practitioner_id', userId);
      }
      return query;
    };

    let { data, error: listError } = await buildQuery(primarySelect);
    if (listError && /milestones/i.test(listError.message ?? '')) {
      ({ data, error: listError } = await buildQuery(fallbackSelect));
    }

    if (listError) throw listError;
    return (data ?? []).map(mapAssignmentRow);
  }
}

export async function addInterventionProgress(
  assignmentId: string,
  payload: { progressPercentage: number; status: 'in_progress' | 'completed' | 'blocked'; progressNote?: string },
  preferAthleteToken = false
) {
  try {
    return await apiJson<InterventionProgressEntry>(`/api/interventions/assignments/${assignmentId}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload),
      preferAthleteToken,
    });
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('athlete_interventions')
      .select('*')
      .eq('id', assignmentId)
      .single();
    if (assignmentError) throw assignmentError;

    const { data: progressEntry, error: progressError } = await supabase
      .from('intervention_progress')
      .insert({
        athlete_intervention_id: assignmentId,
        practitioner_id: assignment.practitioner_id,
        athlete_id: assignment.athlete_id,
        progress_note: payload.progressNote ?? null,
        progress_percentage: payload.progressPercentage,
        status: payload.status,
      })
      .select()
      .single();
    if (progressError) throw progressError;

    const mappedStatus =
      payload.status === 'completed'
        ? 'completed'
        : payload.status === 'blocked'
          ? 'paused'
          : payload.progressPercentage > 0
            ? 'in_progress'
            : 'assigned';

    const { error: updateError } = await supabase
      .from('athlete_interventions')
      .update({
        completion_percentage: payload.progressPercentage,
        status: mappedStatus,
      })
      .eq('id', assignmentId);
    if (updateError) throw updateError;

    return progressEntry as InterventionProgressEntry;
  }
}

export async function getInterventionProgress(assignmentId: string, preferAthleteToken = false) {
  try {
    return await apiJson<InterventionProgressEntry[]>(`/api/interventions/assignments/${assignmentId}/progress`, {
      preferAthleteToken,
    });
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const { data, error: progressError } = await supabase
      .from('intervention_progress')
      .select('*')
      .eq('athlete_intervention_id', assignmentId)
      .order('created_at', { ascending: false });
    if (progressError) throw progressError;
    return (data ?? []) as InterventionProgressEntry[];
  }
}
