import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import { assertAthleteAccess } from '../services.js';

const dailyLogSchema = z.object({
  athleteId: z.string().uuid(),
  moodScore: z.number().int().min(1).max(10).optional(),
  stressScore: z.number().int().min(1).max(10).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  readinessScore: z.number().int().min(1).max(10).optional(),
  reflection: z.string().optional(),
});

export function registerCaseRoutes(app) {
  app.post(`${env.apiBasePath}/daily-logs`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      const payload = dailyLogSchema.parse(req.body);

      if (!(await assertAthleteAccess(req, payload.athleteId))) {
        return res.status(403).json({ message: 'No access to this athlete logs.' });
      }

      const practitionerId = req.user.role === 'practitioner' ? req.user.id : req.user.practitionerId;

      const insertRes = await pool.query(
        `insert into daily_logs(
          athlete_id, practitioner_id, mood_score, stress_score, sleep_hours, readiness_score, reflection
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *`,
        [
          payload.athleteId,
          practitionerId,
          payload.moodScore ?? null,
          payload.stressScore ?? null,
          payload.sleepHours ?? null,
          payload.readinessScore ?? null,
          payload.reflection ?? null,
        ]
      );

      res.status(201).json(insertRes.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid daily log payload.', issues: err.issues });
      }
      console.error('[SPPS API] create daily log failed:', err);
      res.status(500).json({ message: 'Failed to save daily log.' });
    }
  });

  app.get(`${env.apiBasePath}/case-formulations/:athleteId/daily-summary`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      const { athleteId } = req.params;
      if (!(await assertAthleteAccess(req, athleteId))) {
        return res.status(403).json({ message: 'No access to this athlete.' });
      }

      const summaryRes = await pool.query('select get_daily_log_summary($1) as summary', [athleteId]);
      const caseRes = await pool.query(
        `select *
         from case_formulations
         where athlete_id = $1
         order by created_at desc
         limit 1`,
        [athleteId]
      );

      res.json({
        dailySummary: summaryRes.rows[0]?.summary || {
          athlete_id: athleteId,
          total_logs: 0,
          recent_logs: [],
        },
        latestCaseFormulation: caseRes.rows[0] || null,
      });
    } catch (err) {
      console.error('[SPPS API] case daily summary failed:', err);
      res.status(500).json({ message: 'Failed to fetch daily log summary.' });
    }
  });
}
