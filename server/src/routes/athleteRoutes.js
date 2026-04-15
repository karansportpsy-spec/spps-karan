import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import {
  getAthleteByPortalUserId,
  parseCsvIds,
  loadAthleteExportData,
  buildAthleteCsv,
  sendActivationEmail,
} from '../services.js';
import { sanitizeCsvFilename } from '../utils/helpers.js';

export function registerAthleteRoutes(app) {
  app.get(`${env.apiBasePath}/auth/me`, async (req, res) => {
    if (req.user.role === 'athlete') {
      const athlete = await getAthleteByPortalUserId(req.user.id);
      if (!athlete) return res.status(404).json({ message: 'Athlete profile not found.' });
      return res.json({ user: req.user, athlete });
    }
    return res.json({ user: req.user });
  });

  const portalActivationSchema = z.object({
    isPortalActivated: z.boolean(),
    sendActivationEmail: z.boolean().optional().default(false),
  });

  app.patch(
    `${env.apiBasePath}/athletes/:athleteId/portal-activation`,
    requireRoles('practitioner'),
    async (req, res) => {
      try {
        const { athleteId } = req.params;
        const payload = portalActivationSchema.parse(req.body);

        const updateRes = await pool.query(
          `update athletes
           set is_portal_activated = $1,
               portal_activated_at = case when $1 then now() else null end,
               updated_at = now()
           where id = $2 and practitioner_id = $3
           returning id, first_name, last_name, email, is_portal_activated, portal_activated_at`,
          [payload.isPortalActivated, athleteId, req.user.id]
        );

        if (updateRes.rowCount === 0) {
          return res.status(404).json({ message: 'Athlete not found for this practitioner.' });
        }

        const athlete = updateRes.rows[0];
        let activationEmailSent = false;

        if (payload.isPortalActivated && payload.sendActivationEmail && athlete.email) {
          try {
            activationEmailSent = await sendActivationEmail({
              to: athlete.email,
              athleteName: `${athlete.first_name} ${athlete.last_name}`,
            });

            if (activationEmailSent) {
              await pool.query(
                `update athletes
                 set portal_activation_email_sent_at = now()
                 where id = $1`,
                [athlete.id]
              );
            }
          } catch (mailErr) {
            console.error('[SPPS API] activation email send failed:', mailErr);
          }
        }

        res.json({
          message: payload.isPortalActivated
            ? 'Athlete portal activated.'
            : 'Athlete portal deactivated.',
          athlete,
          activationEmailSent,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: 'Invalid portal activation payload.', issues: err.issues });
        }
        console.error('[SPPS API] portal activation failed:', err);
        res.status(500).json({ message: 'Failed to update athlete portal activation.' });
      }
    }
  );

  app.get(`${env.apiBasePath}/athletes/export`, requireRoles('practitioner'), async (req, res) => {
    try {
      const ids = parseCsvIds(String(req.query.ids || ''));
      const rows = await loadAthleteExportData(req.user.id, ids);
      const csv = buildAthleteCsv(rows);

      const filename = ids.length > 0
        ? `athletes_selected_${new Date().toISOString().slice(0, 10)}.csv`
        : `athletes_all_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err) {
      console.error('[SPPS API] athletes export failed:', err);
      res.status(500).json({ message: 'Failed to export athletes CSV.' });
    }
  });

  app.get(`${env.apiBasePath}/athletes/:athleteId/export`, requireRoles('practitioner'), async (req, res) => {
    try {
      const rows = await loadAthleteExportData(req.user.id, [req.params.athleteId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Athlete not found for export.' });
      }

      const csv = buildAthleteCsv(rows);
      const athlete = rows[0];
      const filename = `athlete_${sanitizeCsvFilename(`${athlete.first_name}_${athlete.last_name}`)}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err) {
      console.error('[SPPS API] athlete export failed:', err);
      res.status(500).json({ message: 'Failed to export athlete CSV.' });
    }
  });
}
