import { supabaseAdmin } from '../supabase.js';
import { pool } from '../db.js';

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

  const athleteRes = await pool.query('select id from athletes where portal_user_id = $1 limit 1', [userId]);
  if (athleteRes.rowCount > 0) return 'athlete';

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
    const role = await resolveUserRole(user.id);

    req.user = {
      id: user.id,
      email: user.email || '',
      role,
      token,
    };

    if (role === 'athlete') {
      const athleteRes = await pool.query(
        `select id, practitioner_id, is_portal_activated
         from athletes
         where portal_user_id = $1
         limit 1`,
        [user.id]
      );
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
