import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import { assertAthleteAccess } from '../services.js';

const injuryLogSchema = z.object({
  athleteId: z.string().uuid(),
  injuryRecordId: z.string().uuid().optional(),
  moodScore: z.number().int().min(1).max(10).optional(),
  stressScore: z.number().int().min(1).max(10).optional(),
  confidenceScore: z.number().int().min(1).max(10).optional(),
  painAcceptanceScore: z.number().int().min(1).max(10).optional(),
  reflection: z.string().min(2),
});

export function registerInjuryRoutes(app) {
  app.get(`${env.apiBasePath}/injury-psychology-logs`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      let athleteId = String(req.query.athleteId || '');
      if (req.user.role === 'athlete') {
        athleteId = req.user.athleteId;
      }

      if (!athleteId) {
        return res.status(400).json({ message: 'athleteId is required.' });
      }

      if (!(await assertAthleteAccess(req, athleteId))) {
        return res.status(403).json({ message: 'No access to this athlete logs.' });
      }

      const practitionerFilter = req.user.role === 'practitioner' ? ' and practitioner_id = $2' : '';
      const params = req.user.role === 'practitioner' ? [athleteId, req.user.id] : [athleteId];

      const result = await pool.query(
        `select *
         from injury_psychology_logs
         where athlete_id = $1${practitionerFilter}
         order by created_at desc`,
        params
      );

      res.json(result.rows);
    } catch (err) {
      console.error('[SPPS API] list injury psychology logs failed:', err);
      res.status(500).json({ message: 'Failed to fetch injury psychology logs.' });
    }
  });

  app.post(`${env.apiBasePath}/injury-psychology-logs`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      const payload = injuryLogSchema.parse(req.body);

      if (!(await assertAthleteAccess(req, payload.athleteId))) {
        return res.status(403).json({ message: 'No access to this athlete logs.' });
      }

      const practitionerId = req.user.role === 'practitioner' ? req.user.id : req.user.practitionerId;
      const result = await pool.query(
        `insert into injury_psychology_logs(
          athlete_id, practitioner_id, injury_record_id,
          mood_score, stress_score, confidence_score, pain_acceptance_score,
          reflection
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning *`,
        [
          payload.athleteId,
          practitionerId,
          payload.injuryRecordId || null,
          payload.moodScore ?? null,
          payload.stressScore ?? null,
          payload.confidenceScore ?? null,
          payload.painAcceptanceScore ?? null,
          payload.reflection,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid injury log payload.', issues: err.issues });
      }
      console.error('[SPPS API] create injury log failed:', err);
      res.status(500).json({ message: 'Failed to save injury psychology log.' });
    }
  });

  app.put(`${env.apiBasePath}/injury-psychology-logs/:logId`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = injuryLogSchema.partial().parse(req.body);

      const result = await pool.query(
        `update injury_psychology_logs
         set mood_score = coalesce($1, mood_score),
             stress_score = coalesce($2, stress_score),
             confidence_score = coalesce($3, confidence_score),
             pain_acceptance_score = coalesce($4, pain_acceptance_score),
             reflection = coalesce($5, reflection),
             updated_at = now()
         where id = $6 and practitioner_id = $7
         returning *`,
        [
          payload.moodScore ?? null,
          payload.stressScore ?? null,
          payload.confidenceScore ?? null,
          payload.painAcceptanceScore ?? null,
          payload.reflection ?? null,
          req.params.logId,
          req.user.id,
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Injury psychology log not found.' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid injury log update payload.', issues: err.issues });
      }
      console.error('[SPPS API] update injury log failed:', err);
      res.status(500).json({ message: 'Failed to update injury psychology log.' });
    }
  });

  app.delete(`${env.apiBasePath}/injury-psychology-logs/:logId`, requireRoles('practitioner'), async (req, res) => {
    try {
      const result = await pool.query(
        `delete from injury_psychology_logs where id = $1 and practitioner_id = $2 returning id`,
        [req.params.logId, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Injury psychology log not found.' });
      }
      res.status(204).send();
    } catch (err) {
      console.error('[SPPS API] delete injury log failed:', err);
      res.status(500).json({ message: 'Failed to delete injury psychology log.' });
    }
  });
}
