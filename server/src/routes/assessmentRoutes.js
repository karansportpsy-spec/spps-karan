import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';

const assessmentBundleSchema = z
  .object({
    athleteId: z.string().uuid(),
    mentalHealth: z
      .object({
        tool: z.string().default('MentalHealthScreening'),
        scores: z.record(z.union([z.number(), z.string()])),
        totalScore: z.number().optional(),
        interpretation: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    psychophysiology: z
      .object({
        session_context: z.string().optional(),
        hrv: z.record(z.any()).optional(),
        vitals: z.record(z.any()).optional(),
        emg: z.array(z.any()).optional(),
        eeg: z.record(z.any()).optional(),
        gsr: z.record(z.any()).optional(),
        wearable_data: z.record(z.any()).optional(),
        device_used: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    neurocognitive: z
      .object({
        platform: z.string().optional(),
        test_date: z.string().optional(),
        comparison_group: z.string().optional(),
        context: z.string().optional(),
        senaptec_scores: z.record(z.any()).optional(),
        custom_metrics: z.array(z.any()).optional(),
        notes: z.string().optional(),
        raw_report_notes: z.string().optional(),
      })
      .optional(),
  })
  .refine((value) => value.mentalHealth || value.psychophysiology || value.neurocognitive, {
    message: 'At least one assessment section is required.',
  });

export function registerAssessmentRoutes(app) {
  app.post(
    `${env.apiBasePath}/assessments/bundle`,
    requireRoles('practitioner'),
    async (req, res) => {
      let client;
      try {
        const payload = assessmentBundleSchema.parse(req.body);

        const athleteCheck = await pool.query(
          `select id
           from athletes
           where id = $1
             and practitioner_id = $2
           limit 1`,
          [payload.athleteId, req.user.id]
        );

        if (athleteCheck.rowCount === 0) {
          return res.status(404).json({ message: 'Athlete not found for this practitioner.' });
        }

        client = await pool.connect();
        await client.query('begin');

        let mentalId = null;
        let physioId = null;
        let neuroId = null;

        if (payload.mentalHealth) {
          const m = payload.mentalHealth;
          const mentalRes = await client.query(
            `insert into assessments(
               practitioner_id, athlete_id, tool, administered_at, scores, total_score, interpretation, notes
             )
             values ($1, $2, $3, now(), $4::jsonb, $5, $6, $7)
             returning id`,
            [
              req.user.id,
              payload.athleteId,
              m.tool,
              JSON.stringify(m.scores || {}),
              m.totalScore ?? null,
              m.interpretation ?? null,
              m.notes ?? null,
            ]
          );
          mentalId = mentalRes.rows[0].id;
        }

        if (payload.psychophysiology) {
          const p = payload.psychophysiology;
          const physioRes = await client.query(
            `insert into psychophysiology(
               practitioner_id, athlete_id, session_context, hrv, vitals, emg, eeg, gsr, wearable_data, device_used, notes, created_at
             )
             values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, now())
             returning id`,
            [
              req.user.id,
              payload.athleteId,
              p.session_context || 'assessment_bundle',
              JSON.stringify(p.hrv || {}),
              JSON.stringify(p.vitals || {}),
              JSON.stringify(p.emg || []),
              JSON.stringify(p.eeg || {}),
              JSON.stringify(p.gsr || {}),
              JSON.stringify(p.wearable_data || {}),
              p.device_used ?? null,
              p.notes ?? null,
            ]
          );
          physioId = physioRes.rows[0].id;
        }

        if (payload.neurocognitive) {
          const n = payload.neurocognitive;
          const neuroRes = await client.query(
            `insert into neurocognitive(
               practitioner_id, athlete_id, platform, test_date, comparison_group, context,
               senaptec_scores, custom_metrics, notes, raw_report_notes, created_at
             )
             values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, now())
             returning id`,
            [
              req.user.id,
              payload.athleteId,
              n.platform || 'Bundle Entry',
              n.test_date || new Date().toISOString().slice(0, 10),
              n.comparison_group || null,
              n.context || 'assessment_bundle',
              JSON.stringify(n.senaptec_scores || {}),
              JSON.stringify(n.custom_metrics || []),
              n.notes ?? null,
              n.raw_report_notes ?? null,
            ]
          );
          neuroId = neuroRes.rows[0].id;
        }

        const bundleRes = await client.query(
          `insert into assessment_bundles(
             athlete_id, practitioner_id, mental_health_assessment_id, psychophysiology_id, neurocognitive_id
           )
           values ($1, $2, $3, $4, $5)
           returning *`,
          [payload.athleteId, req.user.id, mentalId, physioId, neuroId]
        );

        await client.query('commit');

        res.status(201).json({
          message: 'Assessment bundle saved successfully.',
          bundle: bundleRes.rows[0],
        });
      } catch (err) {
        if (client) {
          await client.query('rollback');
        }
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: 'Invalid assessment bundle payload.', issues: err.issues });
        }
        console.error('[SPPS API] assessment bundle save failed:', err);
        res.status(500).json({ message: 'Failed to save assessment bundle transactionally.' });
      } finally {
        if (client) client.release();
      }
    }
  );
}
