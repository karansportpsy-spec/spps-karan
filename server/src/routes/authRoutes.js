import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { supabaseAnon } from '../supabase.js';

export function registerAuthRoutes(app) {
  const athleteLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  app.post(`${env.apiBasePath}/auth/athlete/login`, async (req, res) => {
    try {
      const { email, password } = athleteLoginSchema.parse(req.body);

      const signInResult = await supabaseAnon.auth.signInWithPassword({ email, password });
      if (signInResult.error || !signInResult.data.session || !signInResult.data.user) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const authUser = signInResult.data.user;
      const athleteRes = await pool.query(
        `select id, practitioner_id, first_name, last_name, sport, team, email, is_portal_activated, portal_user_id
         from athletes
         where lower(email) = lower($1)
         limit 1`,
        [email]
      );

      if (athleteRes.rowCount === 0) {
        return res.status(403).json({ message: 'No athlete profile is linked to this email.' });
      }

      const athlete = athleteRes.rows[0];
      if (!athlete.is_portal_activated) {
        return res.status(403).json({ message: 'Athlete portal is not activated by practitioner yet.' });
      }

      if (athlete.portal_user_id && athlete.portal_user_id !== authUser.id) {
        return res.status(403).json({
          message: 'This athlete portal is linked to another account. Contact your practitioner.',
        });
      }

      const client = await pool.connect();
      try {
        await client.query('begin');

        await client.query(
          `update athletes
           set portal_user_id = coalesce(portal_user_id, $2),
               portal_last_login_at = now()
           where id = $1`,
          [athlete.id, authUser.id]
        );

        await client.query(
          `insert into user_roles(user_id, role)
           values ($1, 'athlete')
           on conflict (user_id) do nothing`,
          [authUser.id]
        );

        await client.query('commit');
      } catch (txErr) {
        await client.query('rollback');
        throw txErr;
      } finally {
        client.release();
      }

      return res.json({
        message: 'Athlete login successful.',
        accessToken: signInResult.data.session.access_token,
        refreshToken: signInResult.data.session.refresh_token,
        athlete: {
          id: athlete.id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          email: athlete.email,
          sport: athlete.sport,
          team: athlete.team,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid athlete login payload.', issues: err.issues });
      }
      console.error('[SPPS API] athlete login failed:', err);
      res.status(500).json({ message: 'Athlete login failed.' });
    }
  });
}
