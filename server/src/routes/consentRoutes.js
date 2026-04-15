import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';

const consentSchema = z.object({
  athleteId: z.string().uuid(),
  formType: z.string().min(2),
  status: z.enum(['pending', 'signed', 'expired', 'uploaded']).default('signed'),
  signedBy: z.string().min(2),
  signedAt: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  digitalSignature: z.string().optional(),
  guardianName: z.string().optional(),
  guardianRelationship: z.string().optional(),
  guardianEmail: z.string().optional(),
  guardianPhone: z.string().optional(),
  formData: z.record(z.any()).optional(),
});

export function registerConsentRoutes(app) {
  app.get(`${env.apiBasePath}/consents`, requireRoles('practitioner', 'athlete'), async (req, res) => {
    try {
      if (req.user.role === 'athlete') {
        const rows = await pool.query(
          `select * from consent_forms where athlete_id = $1 order by created_at desc`,
          [req.user.athleteId]
        );
        return res.json(rows.rows);
      }

      const athleteId = String(req.query.athleteId || '');
      const params = [req.user.id];
      let filterSql = '';
      if (athleteId) {
        params.push(athleteId);
        filterSql = ' and athlete_id = $2';
      }

      const rows = await pool.query(
        `select *
         from consent_forms
         where practitioner_id = $1${filterSql}
         order by created_at desc`,
        params
      );
      res.json(rows.rows);
    } catch (err) {
      console.error('[SPPS API] list consents failed:', err);
      res.status(500).json({ message: 'Failed to fetch consent forms.' });
    }
  });

  app.post(`${env.apiBasePath}/consents`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = consentSchema.parse(req.body);

      const athleteCheck = await pool.query(
        'select id from athletes where id = $1 and practitioner_id = $2',
        [payload.athleteId, req.user.id]
      );
      if (athleteCheck.rowCount === 0) {
        return res.status(404).json({ message: 'Athlete not found for this practitioner.' });
      }

      const insertRes = await pool.query(
        `insert into consent_forms(
          practitioner_id, athlete_id, form_type, status,
          signed_by, signed_at, signed_timestamp,
          valid_until, notes, digital_signature,
          guardian_name, guardian_relationship, guardian_email, guardian_phone,
          form_data, signature_ip
        )
        values (
          $1, $2, $3, $4,
          $5, $6, $6,
          $7, $8, $9,
          $10, $11, $12, $13,
          $14::jsonb, $15::inet
        )
        returning *`,
        [
          req.user.id,
          payload.athleteId,
          payload.formType,
          payload.status,
          payload.signedBy,
          payload.signedAt ? new Date(payload.signedAt).toISOString() : new Date().toISOString(),
          payload.validUntil ? new Date(payload.validUntil).toISOString() : null,
          payload.notes || null,
          payload.digitalSignature || payload.signedBy,
          payload.guardianName || null,
          payload.guardianRelationship || null,
          payload.guardianEmail || null,
          payload.guardianPhone || null,
          JSON.stringify(payload.formData || {}),
          (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim() || null,
        ]
      );

      res.status(201).json(insertRes.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid consent payload.', issues: err.issues });
      }
      console.error('[SPPS API] create consent failed:', err);
      res.status(500).json({ message: 'Failed to save consent form.' });
    }
  });

  app.delete(`${env.apiBasePath}/consents/:consentId`, requireRoles('practitioner'), async (req, res) => {
    try {
      const result = await pool.query(
        `delete from consent_forms where id = $1 and practitioner_id = $2 returning id`,
        [req.params.consentId, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Consent form not found.' });
      }
      res.status(204).send();
    } catch (err) {
      console.error('[SPPS API] delete consent failed:', err);
      res.status(500).json({ message: 'Failed to delete consent form.' });
    }
  });
}
