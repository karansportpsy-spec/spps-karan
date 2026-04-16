import { apiJson } from '@/lib/apiClient';
import { shouldFallbackToDirectDb } from '@/lib/apiFallback';
import { supabase } from '@/lib/supabase';

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
  try {
    return await apiJson<{ message: string; bundle: any }>('/api/assessments/bundle', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!shouldFallbackToDirectDb(error)) {
      throw error;
    }

    const { data: authData } = await supabase.auth.getUser();
    const practitionerId = authData.user?.id;
    if (!practitionerId) {
      throw error;
    }

    const bundleIds: Record<string, string | null> = {
      mental_health_assessment_id: null,
      psychophysiology_id: null,
      neurocognitive_id: null,
    };

    if (payload.mentalHealth) {
      const mental = payload.mentalHealth;
      const { data, error: mentalError } = await supabase
        .from('assessments')
        .insert({
          practitioner_id: practitionerId,
          athlete_id: payload.athleteId,
          tool: mental.tool || 'MentalHealthScreening',
          administered_at: new Date().toISOString(),
          scores: mental.scores || {},
          total_score: mental.totalScore ?? null,
          interpretation: mental.interpretation ?? null,
          notes: mental.notes ?? null,
        })
        .select('id')
        .single();
      if (mentalError) throw mentalError;
      bundleIds.mental_health_assessment_id = data?.id ?? null;
    }

    if (payload.psychophysiology) {
      const physio = payload.psychophysiology;
      const { data, error: physioError } = await supabase
        .from('psychophysiology')
        .insert({
          practitioner_id: practitionerId,
          athlete_id: payload.athleteId,
          session_context: (physio as any).session_context || 'assessment_bundle',
          hrv: (physio as any).hrv || {},
          vitals: (physio as any).vitals || {},
          emg: (physio as any).emg || [],
          eeg: (physio as any).eeg || {},
          gsr: (physio as any).gsr || {},
          wearable_data: (physio as any).wearable_data || {},
          device_used: (physio as any).device_used ?? null,
          notes: (physio as any).notes ?? null,
        })
        .select('id')
        .single();
      if (physioError) throw physioError;
      bundleIds.psychophysiology_id = data?.id ?? null;
    }

    if (payload.neurocognitive) {
      const neuro = payload.neurocognitive;
      const { data, error: neuroError } = await supabase
        .from('neurocognitive')
        .insert({
          practitioner_id: practitionerId,
          athlete_id: payload.athleteId,
          platform: (neuro as any).platform || 'Bundle Entry',
          test_date: (neuro as any).test_date || new Date().toISOString().slice(0, 10),
          comparison_group: (neuro as any).comparison_group || null,
          context: (neuro as any).context || 'assessment_bundle',
          senaptec_scores: (neuro as any).senaptec_scores || {},
          custom_metrics: (neuro as any).custom_metrics || [],
          notes: (neuro as any).notes ?? null,
          raw_report_notes: (neuro as any).raw_report_notes ?? null,
        })
        .select('id')
        .single();
      if (neuroError) throw neuroError;
      bundleIds.neurocognitive_id = data?.id ?? null;
    }

    let bundleRecord: any = {
      athlete_id: payload.athleteId,
      practitioner_id: practitionerId,
      ...bundleIds,
      created_at: new Date().toISOString(),
    };

    const { data: insertedBundle, error: bundleError } = await supabase
      .from('assessment_bundles')
      .insert(bundleRecord)
      .select()
      .single();
    if (!bundleError && insertedBundle) {
      bundleRecord = insertedBundle;
    }

    return {
      message: 'Assessment bundle saved successfully.',
      bundle: bundleRecord,
    };
  }
}
