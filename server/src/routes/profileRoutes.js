import { env } from '../env.js';
import { ensureAthleteForAuthUser, ensurePractitionerForAuthUser } from '../services.js';

function normalizeRole(reqUser) {
  if (!reqUser) return 'unknown';
  if (reqUser.role === 'practitioner' || reqUser.role === 'athlete') return reqUser.role;
  if (reqUser.metadataRole === 'practitioner' || reqUser.metadataRole === 'athlete') return reqUser.metadataRole;
  return 'unknown';
}

export function registerProfileRoutes(app) {
  app.post(`${env.apiBasePath}/profile/bootstrap`, async (req, res) => {
    try {
      const role = normalizeRole(req.user);
      const authUser = req.user?.rawAuthUser;

      if (!authUser) {
        return res.status(401).json({ message: 'Authenticated user context is missing.' });
      }

      if (role === 'practitioner') {
        const practitioner = await ensurePractitionerForAuthUser(authUser);
        return res.json({
          role,
          practitioner,
          athlete: null,
        });
      }

      if (role === 'athlete') {
        const athlete = await ensureAthleteForAuthUser(authUser);
        return res.json({
          role,
          practitioner: null,
          athlete,
        });
      }

      return res.status(400).json({ message: 'Unable to determine a supported profile role for this user.' });
    } catch (err) {
      console.error('[SPPS API] profile bootstrap failed:', err);
      return res.status(500).json({ message: 'Failed to bootstrap account profile.' });
    }
  });
}
