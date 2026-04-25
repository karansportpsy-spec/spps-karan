import { supabaseAdmin } from '../supabase.js';
import { pool } from '../db.js';
import { ensureAthleteForAuthUser, ensurePractitionerForAuthUser } from '../services.js';

export async function resolveUserRole(userId) {
  const roleRes = await pool.query(
    'select role from user_roles where user_id = $1 limit 1',
    [userId]
  );
  if (roleRes.rowCount > 0) {
    return roleRes.rows[0].role;
  }

  const practitionerRes = await pool.query('select id from practitioners where id = $1 limit 1', [userId]);
  if (practitionerRes.rowCount > 0) return 'practitioner';

  const athleteRes = await pool.query('select id from athletes where id = $1 limit 1', [userId]);
  if (athleteRes.rowCount > 0) return 'athlete';

  try {
    const legacyAthleteRes = await pool.query('select id from athletes where portal_user_id = $1 limit 1', [userId]);
    if (legacyAthleteRes.rowCount > 0) return 'athlete';
  } catch (err) {
    if (!(err && typeof err === 'object' && err.code === '42703')) {
      throw err;
    }
  }

  return 'unknown';
}

export async function authenticateRequest(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Missing bearer token.' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    const user = data.user;
    const metadataRoleRaw = user.user_metadata?.role || user.app_metadata?.role || null;
    const metadataRole = metadataRoleRaw === 'sport_psychologist'
      ? 'practitioner'
      : metadataRoleRaw;
    let role = await resolveUserRole(user.id);

    if (role === 'unknown' && (metadataRole === 'practitioner' || metadataRole === 'athlete')) {
      role = metadataRole;
    }

    req.user = {
      id: user.id,
      email: user.email || '',
      role,
      token,
      metadataRole,
      rawAuthUser: user,
    };

    if (role === 'practitioner') {
      try {
        await ensurePractitionerForAuthUser(user);
      } catch (err) {
        console.error('[SPPS API] ensurePractitionerForAuthUser failed:', err);
      }
    }

    if (role === 'athlete') {
      let athleteRes = await pool.query(
        `select
           a.id,
           a.is_portal_activated,
           link.practitioner_id
         from athletes a
         left join lateral (
           select practitioner_id
           from practitioner_athlete_links
           where athlete_id = a.id
             and status = 'active'
           order by linked_at desc
           limit 1
         ) link on true
         where a.id = $1
         limit 1`,
        [user.id]
      );

      if (athleteRes.rowCount === 0) {
        try {
          athleteRes = await pool.query(
            `select
               a.id,
               a.is_portal_activated,
               link.practitioner_id
             from athletes a
             left join lateral (
               select practitioner_id
               from practitioner_athlete_links
               where athlete_id = a.id
                 and status = 'active'
               order by linked_at desc
               limit 1
             ) link on true
             where a.portal_user_id = $1
             limit 1`,
            [user.id]
          );
        } catch (err) {
          if (!(err && typeof err === 'object' && err.code === '42703')) {
            throw err;
          }
        }
      }

      if (athleteRes.rowCount === 0) {
        const ensuredAthlete = await ensureAthleteForAuthUser(user);
        if (ensuredAthlete?.id) {
          athleteRes = {
            rowCount: 1,
            rows: [{
              id: ensuredAthlete.id,
              is_portal_activated: ensuredAthlete.is_portal_activated,
              practitioner_id: ensuredAthlete.practitioner_id || null,
            }],
          };
        }
      }

      if (athleteRes.rowCount > 0) {
        req.user.athleteId = athleteRes.rows[0].id;
        req.user.practitionerId = athleteRes.rows[0].practitioner_id;
        req.user.isPortalActivated = athleteRes.rows[0].is_portal_activated;
      }
    }

    next();
  } catch (err) {
    console.error('[SPPS API] auth middleware failed:', err);
    res.status(500).json({ message: 'Authentication middleware error.' });
  }
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthenticated request.' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden for role ${req.user.role}. Required: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
