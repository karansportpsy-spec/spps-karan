import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';

const createProgramSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(104).optional(),
  milestones: z.array(z.string()).optional(),
});

const assignProgramSchema = z.object({
  athleteId: z.string().uuid(),
  programId: z.string().uuid().optional(),
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(104).optional(),
  milestones: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
});

const progressSchema = z.object({
  progressPercentage: z.number().min(0).max(100),
  status: z.enum(['in_progress', 'completed', 'blocked']),
  progressNote: z.string().optional(),
});

function ensureAssignmentAccess(req, assignment) {
  if (req.user.role === 'admin') return true;
  if (req.user.id === assignment.practitioner_id) return true;
  if (req.user.role === 'athlete' && req.user.athleteId === assignment.athlete_id) return true;
  return false;
}

export function registerInterventionRoutes(app) {
  app.post(`${env.apiBasePath}/interventions/programs`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = createProgramSchema.parse(req.body);
      const result = await pool.query(
        `insert into intervention_programs(practitioner_id, title, description, duration_weeks, milestones)
         values ($1, $2, $3, $4, $5::jsonb)
         returning *`,
        [req.user.id, payload.title, payload.description || null, payload.durationWeeks || null, JSON.stringify(payload.milestones || [])]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid program payload.', issues: err.issues });
      }
      console.error('[SPPS API] create program failed:', err);
      res.status(500).json({ message: 'Failed to create intervention program.' });
    }
  });

  app.post(`${env.apiBasePath}/interventions/assign`, requireRoles('practitioner'), async (req, res) => {
    const client = await pool.connect();
    try {
      const payload = assignProgramSchema.parse(req.body);

      await client.query('begin');

      const athleteCheck = await client.query(
        'select id from athletes where id = $1 and practitioner_id = $2',
        [payload.athleteId, req.user.id]
      );
      if (athleteCheck.rowCount === 0) {
        await client.query('rollback');
        return res.status(404).json({ message: 'Athlete not found for this practitioner.' });
      }

      let programId = payload.programId || null;

      if (!programId) {
        if (!payload.title) {
          await client.query('rollback');
          return res.status(400).json({ message: 'Provide programId or title to create a program.' });
        }

        const createProgram = await client.query(
          `insert into intervention_programs(practitioner_id, title, description, duration_weeks, milestones)
           values ($1, $2, $3, $4, $5::jsonb)
           returning id`,
          [
            req.user.id,
            payload.title,
            payload.description || null,
            payload.durationWeeks || null,
            JSON.stringify(payload.milestones || []),
          ]
        );
        programId = createProgram.rows[0].id;
      }

      const assignmentRes = await client.query(
        `insert into athlete_interventions(intervention_program_id, athlete_id, practitioner_id, due_date, status, completion_percentage)
         values ($1, $2, $3, $4, 'assigned', 0)
         returning *`,
        [programId, payload.athleteId, req.user.id, payload.dueDate || null]
      );

      await client.query('commit');
      res.status(201).json(assignmentRes.rows[0]);
    } catch (err) {
      await client.query('rollback');
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid assignment payload.', issues: err.issues });
      }
      console.error('[SPPS API] assign program failed:', err);
      res.status(500).json({ message: 'Failed to assign intervention program.' });
    } finally {
      client.release();
    }
  });

  app.get(`${env.apiBasePath}/interventions/assignments`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      const athleteIdFilter = String(req.query.athleteId || '');
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      if (req.user.role === 'athlete') {
        const rows = await pool.query(
          `select ai.*, ip.title, ip.description, ip.duration_weeks, ip.milestones
           from athlete_interventions ai
           join intervention_programs ip on ip.id = ai.intervention_program_id
           where ai.athlete_id = $1
           order by ai.assigned_at desc
           limit $2 offset $3`,
          [req.user.athleteId, limit, offset]
        );
        return res.json(rows.rows);
      }

      const params = [req.user.id, limit, offset];
      let filterSql = '';
      if (athleteIdFilter) {
        params.push(athleteIdFilter);
        filterSql = ` and ai.athlete_id = $4`;
      }

      const rows = await pool.query(
        `select ai.*, ip.title, ip.description, ip.duration_weeks, ip.milestones,
                a.first_name as athlete_first_name, a.last_name as athlete_last_name
         from athlete_interventions ai
         join intervention_programs ip on ip.id = ai.intervention_program_id
         join athletes a on a.id = ai.athlete_id
         where ai.practitioner_id = $1${filterSql}
         order by ai.assigned_at desc
         limit $2 offset $3`,
        params
      );

      res.json(rows.rows);
    } catch (err) {
      console.error('[SPPS API] list assignments failed:', err);
      res.status(500).json({ message: 'Failed to fetch intervention assignments.' });
    }
  });

  app.post(
    `${env.apiBasePath}/interventions/assignments/:assignmentId/progress`,
    requireRoles('practitioner', 'athlete'),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const payload = progressSchema.parse(req.body);
        const { assignmentId } = req.params;

        const assignmentRes = await client.query(`select * from athlete_interventions where id = $1`, [assignmentId]);
        if (assignmentRes.rowCount === 0) {
          return res.status(404).json({ message: 'Intervention assignment not found.' });
        }
        const assignment = assignmentRes.rows[0];

        if (!ensureAssignmentAccess(req, assignment)) {
          return res.status(403).json({ message: 'No access to this intervention assignment.' });
        }

        await client.query('begin');

        const progressInsert = await client.query(
          `insert into intervention_progress(
            athlete_intervention_id, practitioner_id, athlete_id, progress_note, progress_percentage, status
          )
          values ($1, $2, $3, $4, $5, $6)
          returning *`,
          [assignmentId, assignment.practitioner_id, assignment.athlete_id, payload.progressNote || null, payload.progressPercentage, payload.status]
        );

        await client.query(
          `update athlete_interventions
           set completion_percentage = $1,
               status = case
                 when $2 = 'completed' then 'completed'
                 when $2 = 'blocked' then 'paused'
                 when completion_percentage = 0 and $1 > 0 then 'in_progress'
                 else status
               end,
               updated_at = now()
           where id = $3`,
          [payload.progressPercentage, payload.status, assignmentId]
        );

        await client.query('commit');
        res.status(201).json(progressInsert.rows[0]);
      } catch (err) {
        await client.query('rollback');
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: 'Invalid progress payload.', issues: err.issues });
        }
        console.error('[SPPS API] save progress failed:', err);
        res.status(500).json({ message: 'Failed to save intervention progress.' });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    `${env.apiBasePath}/interventions/assignments/:assignmentId/progress`,
    requireRoles('practitioner', 'athlete'),
    async (req, res) => {
      try {
        const { assignmentId } = req.params;

        const assignmentRes = await pool.query('select * from athlete_interventions where id = $1', [assignmentId]);
        if (assignmentRes.rowCount === 0) {
          return res.status(404).json({ message: 'Intervention assignment not found.' });
        }
        const assignment = assignmentRes.rows[0];

        if (!ensureAssignmentAccess(req, assignment)) {
          return res.status(403).json({ message: 'No access to this intervention assignment.' });
        }

        const rows = await pool.query(
          `select *
           from intervention_progress
           where athlete_intervention_id = $1
           order by created_at desc`,
          [assignmentId]
        );

        res.json(rows.rows);
      } catch (err) {
        console.error('[SPPS API] list progress failed:', err);
        res.status(500).json({ message: 'Failed to fetch intervention progress.' });
      }
    }
  );
}
