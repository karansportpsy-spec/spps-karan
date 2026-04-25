import crypto from 'crypto';
import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import { CLINICAL_ICD11_CODES } from '../data/clinicalIcd11.js';

const verifyPasswordSchema = z.object({
  password: z.string().min(1),
});

const setupPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  currentPassword: z.string().min(1).max(128).optional(),
});

const clinicalRecordSchema = z.object({
  athleteId: z.string().uuid(),
  diagnosisLabel: z.string().min(2).max(160),
  dsmReference: z.string().max(120).optional().or(z.literal('')),
  icdCode: z.string().min(2).max(32),
  notes: z.string().max(12000),
  severityLevel: z.enum(['mild', 'moderate', 'severe', 'critical']),
  status: z.enum(['active', 'archived']).default('active'),
});

const clinicalRecordUpdateSchema = clinicalRecordSchema.partial().extend({
  athleteId: z.string().uuid().optional(),
});

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signClinicalToken(practitionerId) {
  const expiresAt = Date.now() + env.clinicalAccessSessionMinutes * 60 * 1000;
  const payload = {
    practitionerId,
    exp: expiresAt,
    purpose: 'clinical_access',
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', env.clinicalAccessTokenSecret)
    .update(encodedPayload)
    .digest('base64url');

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

function verifyClinicalToken(token, practitionerId) {
  if (!token || !token.includes('.')) return { valid: false, reason: 'missing' };

  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', env.clinicalAccessTokenSecret)
    .update(encodedPayload)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'invalid_signature' };
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.purpose !== 'clinical_access') return { valid: false, reason: 'invalid_purpose' };
    if (payload.practitionerId !== practitionerId) return { valid: false, reason: 'wrong_practitioner' };
    if (Number(payload.exp || 0) <= Date.now()) return { valid: false, reason: 'expired' };
    return { valid: true, expiresAt: payload.exp };
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }
}

function anonymizePractitionerId(practitionerId) {
  return crypto
    .createHmac('sha256', env.clinicalAuditSalt)
    .update(String(practitionerId))
    .digest('hex');
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

async function writeClinicalAudit(practitionerId, action, meta = {}) {
  const safeMeta = JSON.stringify(meta || {});
  await pool.query(
    `insert into clinical_access_logs(practitioner_id, action, meta)
     values ($1, $2, $3::jsonb)`,
    [practitionerId, action, safeMeta]
  );
  await pool.query(
    `insert into clinical_audit_anonymous(hashed_practitioner_id, action_type, meta)
     values ($1, $2, $3::jsonb)`,
    [anonymizePractitionerId(practitionerId), action, safeMeta]
  );
}

async function hasPractitionerAthleteAccess(practitionerId, athleteId) {
  const linkRes = await pool.query(
    `select 1
     from practitioner_athlete_links
     where practitioner_id = $1
       and athlete_id = $2
       and status = 'active'
     limit 1`,
    [practitionerId, athleteId]
  );

  if (linkRes.rowCount > 0) return true;

  const legacyRes = await pool.query(
    `select 1
     from athletes
     where id = $1
       and practitioner_id = $2
     limit 1`,
    [athleteId, practitionerId]
  );

  return legacyRes.rowCount > 0;
}

async function validateClinicalPassword(practitionerId, password) {
  const config = await getClinicalPasswordConfig(practitionerId);
  if (!config.configured || !config.passwordHash) {
    throw new Error('Clinical access password hash is not configured.');
  }

  const result = await pool.query(
    `select crypt($1, $2) = $2 as valid`,
    [password, config.passwordHash]
  );

  return Boolean(result.rows[0]?.valid);
}

async function getClinicalPasswordConfig(practitionerId = null) {
  if (practitionerId) {
    try {
      const result = await pool.query(
        `select password_hash, updated_at
         from clinical_access_settings
         where practitioner_id = $1
         limit 1`,
        [practitionerId]
      );

      if (result.rowCount > 0) {
        return {
          configured: true,
          source: 'database',
          passwordHash: result.rows[0].password_hash,
          updatedAt: result.rows[0].updated_at,
          selfManaged: true,
          storageReady: true,
        };
      }
    } catch (err) {
      if (err?.code !== '42P01') {
        throw err;
      }

      if (env.clinicalAccessPasswordHash) {
        return {
          configured: true,
          source: 'environment',
          passwordHash: env.clinicalAccessPasswordHash,
          updatedAt: null,
          selfManaged: false,
          storageReady: true,
        };
      }

      return {
        configured: false,
        source: null,
        passwordHash: null,
        updatedAt: null,
        selfManaged: true,
        storageReady: false,
      };
    }
  }

  if (env.clinicalAccessPasswordHash) {
    return {
      configured: true,
      source: 'environment',
      passwordHash: env.clinicalAccessPasswordHash,
      updatedAt: null,
      selfManaged: false,
      storageReady: true,
    };
  }

  return {
    configured: false,
    source: null,
    passwordHash: null,
    updatedAt: null,
    selfManaged: true,
    storageReady: true,
  };
}

async function setClinicalPassword(practitionerId, password) {
  const result = await pool.query(
    `insert into clinical_access_settings(practitioner_id, password_hash)
     values ($1, crypt($2, gen_salt('bf', 10)))
     on conflict (practitioner_id)
     do update set
       password_hash = crypt($2, gen_salt('bf', 10)),
       updated_at = now()
     returning practitioner_id, updated_at`,
    [practitionerId, password]
  );

  return result.rows[0];
}

async function getRecentFailedAttempts(practitionerId, ipAddress) {
  const result = await pool.query(
    `select count(*)::int as count
     from clinical_access_logs
     where practitioner_id = $1
       and action = 'unlock_failed'
       and timestamp >= now() - make_interval(mins => $2::int)
       and coalesce(meta->>'ip_address', '') = $3`,
    [practitionerId, env.clinicalAccessWindowMinutes, ipAddress]
  );
  return Number(result.rows[0]?.count || 0);
}

function requireClinicalSession(req, res, next) {
  if (!req.user || req.user.role !== 'practitioner') {
    return res.status(403).json({ message: 'Clinical module is available only to practitioners.' });
  }

  const gateToken = req.headers['x-clinical-access-token'];
  const verified = verifyClinicalToken(String(gateToken || ''), req.user.id);

  if (!verified.valid) {
    return res.status(423).json({ message: 'Clinical access is locked. Re-enter the clinical access password.' });
  }

  req.clinicalAccess = {
    expiresAt: verified.expiresAt,
  };

  return next();
}

function mapRecord(row) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    practitionerId: row.practitioner_id,
    diagnosisLabel: row.diagnosis_label,
    dsmReference: row.dsm_reference,
    icdCode: row.icd_code,
    notes: row.notes,
    severityLevel: row.severity_level,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    athlete: {
      id: row.athlete_id,
      firstName: row.athlete_first_name,
      lastName: row.athlete_last_name,
      sport: row.athlete_sport,
      team: row.athlete_team,
    },
  };
}

export function registerClinicalRoutes(app) {
  app.get(`${env.apiBasePath}/clinical/access/status`, requireRoles('practitioner'), async (req, res) => {
    try {
      const config = await getClinicalPasswordConfig(req.user.id);
      return res.json({
        configured: config.configured,
        source: config.source,
        selfManaged: config.selfManaged,
        storageReady: config.storageReady,
        updatedAt: config.updatedAt,
      });
    } catch (err) {
      console.error('[SPPS API] clinical access status failed:', err);
      return res.status(500).json({ message: 'Failed to load clinical access status.' });
    }
  });

  app.post(`${env.apiBasePath}/clinical/access/setup`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = setupPasswordSchema.parse(req.body);
      const config = await getClinicalPasswordConfig(req.user.id);

      if (!config.storageReady) {
        return res.status(503).json({
          message: 'Clinical password storage is not ready yet. Apply the latest clinical SQL migration first.',
        });
      }

      if (config.source === 'environment') {
        return res.status(409).json({
          message: 'Clinical access password is managed by server configuration. Remove CLINICAL_ACCESS_PASSWORD_HASH to manage it inside the app.',
        });
      }

      if (config.configured) {
        if (!payload.currentPassword) {
          return res.status(400).json({ message: 'Current clinical password is required to change it.' });
        }

        const currentValid = await validateClinicalPassword(req.user.id, payload.currentPassword);
        if (!currentValid) {
          return res.status(401).json({ message: 'Current clinical access password is incorrect.' });
        }
      }

      const updated = await setClinicalPassword(req.user.id, payload.password);

      return res.json({
        configured: true,
        source: 'database',
        selfManaged: true,
        storageReady: true,
        updatedAt: updated.updated_at,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Clinical password must be between 8 and 128 characters.', issues: err.issues });
      }
      console.error('[SPPS API] clinical access setup failed:', err);
      return res.status(500).json({ message: 'Failed to save the clinical access password.' });
    }
  });

  app.post(`${env.apiBasePath}/clinical/access/verify`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = verifyPasswordSchema.parse(req.body);
      const ipAddress = getClientIp(req);
      const config = await getClinicalPasswordConfig(req.user.id);

      if (!config.configured) {
        return res.status(428).json({
          code: 'clinical_password_not_configured',
          message: 'Clinical access password has not been configured yet. Set it up first to unlock this module.',
        });
      }

      const failedAttempts = await getRecentFailedAttempts(req.user.id, ipAddress);

      if (failedAttempts >= env.clinicalAccessMaxAttempts) {
        return res.status(429).json({
          message: `Too many failed clinical access attempts. Try again in ${env.clinicalAccessWindowMinutes} minutes.`,
        });
      }

      const valid = await validateClinicalPassword(req.user.id, payload.password);
      if (!valid) {
        await writeClinicalAudit(req.user.id, 'unlock_failed', { ip_address: ipAddress });
        return res.status(401).json({ message: 'Incorrect clinical access password.' });
      }

      const session = signClinicalToken(req.user.id);
      await writeClinicalAudit(req.user.id, 'unlock_success', { ip_address: ipAddress, expires_at: session.expiresAt });

      return res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        sessionMinutes: env.clinicalAccessSessionMinutes,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Password is required.', issues: err.issues });
      }
      console.error('[SPPS API] clinical access verify failed:', err);
      return res.status(500).json({ message: 'Failed to verify clinical access password.' });
    }
  });

  app.get(`${env.apiBasePath}/clinical/icd-search`, requireRoles('practitioner'), requireClinicalSession, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 50);

      const dbRes = await pool.query(
        `select code, title, category
         from clinical_icd_reference
         where is_active = true
           and (
             $1 = ''
             or lower(code) like $2
             or lower(title) like $2
             or lower(coalesce(category, '')) like $2
           )
         order by code asc
         limit $3`,
        [q, `%${q}%`, limit]
      );

      await writeClinicalAudit(req.user.id, 'icd_search', { query: q, result_count: dbRes.rowCount });
      return res.json(dbRes.rows);
    } catch (err) {
      console.error('[SPPS API] clinical ICD search failed, falling back to local list:', err);
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 50);
      const fallback = CLINICAL_ICD11_CODES
        .filter((item) =>
          !q ||
          item.code.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        )
        .slice(0, limit);
      return res.json(fallback);
    }
  });

  app.get(`${env.apiBasePath}/clinical/records`, requireRoles('practitioner'), requireClinicalSession, async (req, res) => {
    try {
      const athleteId = String(req.query.athleteId || '').trim();
      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();

      const params = [req.user.id];
      const clauses = ['cr.practitioner_id = $1'];

      if (athleteId) {
        params.push(athleteId);
        clauses.push(`cr.athlete_id = $${params.length}`);
      }

      if (status === 'active' || status === 'archived') {
        params.push(status);
        clauses.push(`cr.status = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        clauses.push(`(
          lower(cr.diagnosis_label) like $${params.length}
          or lower(cr.icd_code) like $${params.length}
          or lower(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) like $${params.length}
        )`);
      }

      const result = await pool.query(
        `select
           cr.*,
           a.first_name as athlete_first_name,
           a.last_name as athlete_last_name,
           a.sport as athlete_sport,
           a.team as athlete_team
         from clinical_records cr
         join athletes a on a.id = cr.athlete_id
         where ${clauses.join(' and ')}
         order by cr.created_at desc`,
        params
      );

      await writeClinicalAudit(req.user.id, 'view', {
        athlete_id: athleteId || null,
        status: status || null,
        search: search || null,
        count: result.rowCount,
      });

      return res.json(result.rows.map(mapRecord));
    } catch (err) {
      console.error('[SPPS API] list clinical records failed:', err);
      return res.status(500).json({ message: 'Failed to load clinical records.' });
    }
  });

  app.post(`${env.apiBasePath}/clinical/records`, requireRoles('practitioner'), requireClinicalSession, async (req, res) => {
    try {
      const payload = clinicalRecordSchema.parse(req.body);
      const hasAccess = await hasPractitionerAthleteAccess(req.user.id, payload.athleteId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'You do not have clinical access to this athlete.' });
      }

      const result = await pool.query(
        `insert into clinical_records(
           athlete_id, practitioner_id, diagnosis_label, dsm_reference,
           icd_code, notes, severity_level, status
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          payload.athleteId,
          req.user.id,
          payload.diagnosisLabel.trim(),
          payload.dsmReference?.trim() || null,
          payload.icdCode.trim(),
          payload.notes,
          payload.severityLevel,
          payload.status,
        ]
      );

      await writeClinicalAudit(req.user.id, 'create', {
        record_id: result.rows[0].id,
        athlete_id: payload.athleteId,
        icd_code: payload.icdCode,
      });

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid clinical record payload.', issues: err.issues });
      }
      console.error('[SPPS API] create clinical record failed:', err);
      return res.status(500).json({ message: 'Failed to create clinical record.' });
    }
  });

  app.patch(`${env.apiBasePath}/clinical/records/:recordId`, requireRoles('practitioner'), requireClinicalSession, async (req, res) => {
    try {
      const payload = clinicalRecordUpdateSchema.parse(req.body);

      const existing = await pool.query(
        `select id, practitioner_id, athlete_id
         from clinical_records
         where id = $1 and practitioner_id = $2
         limit 1`,
        [req.params.recordId, req.user.id]
      );

      if (existing.rowCount === 0) {
        return res.status(404).json({ message: 'Clinical record not found.' });
      }

      const athleteId = payload.athleteId || existing.rows[0].athlete_id;
      const hasAccess = await hasPractitionerAthleteAccess(req.user.id, athleteId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'You do not have clinical access to this athlete.' });
      }

      const result = await pool.query(
        `update clinical_records
         set athlete_id = coalesce($3, athlete_id),
             diagnosis_label = coalesce($4, diagnosis_label),
             dsm_reference = case when $5 is null then dsm_reference else $5 end,
             icd_code = coalesce($6, icd_code),
             notes = coalesce($7, notes),
             severity_level = coalesce($8, severity_level),
             status = coalesce($9, status),
             updated_at = now()
         where id = $1
           and practitioner_id = $2
         returning *`,
        [
          req.params.recordId,
          req.user.id,
          payload.athleteId || null,
          payload.diagnosisLabel?.trim() || null,
          payload.dsmReference === undefined ? null : (payload.dsmReference?.trim() || null),
          payload.icdCode?.trim() || null,
          payload.notes ?? null,
          payload.severityLevel ?? null,
          payload.status ?? null,
        ]
      );

      await writeClinicalAudit(req.user.id, 'edit', {
        record_id: req.params.recordId,
        athlete_id: athleteId,
      });

      return res.json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid clinical update payload.', issues: err.issues });
      }
      console.error('[SPPS API] update clinical record failed:', err);
      return res.status(500).json({ message: 'Failed to update clinical record.' });
    }
  });

  app.post(`${env.apiBasePath}/clinical/records/:recordId/archive`, requireRoles('practitioner'), requireClinicalSession, async (req, res) => {
    try {
      const result = await pool.query(
        `update clinical_records
         set status = 'archived',
             updated_at = now()
         where id = $1
           and practitioner_id = $2
         returning *`,
        [req.params.recordId, req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Clinical record not found.' });
      }

      await writeClinicalAudit(req.user.id, 'archive', {
        record_id: req.params.recordId,
        athlete_id: result.rows[0].athlete_id,
      });

      return res.json(result.rows[0]);
    } catch (err) {
      console.error('[SPPS API] archive clinical record failed:', err);
      return res.status(500).json({ message: 'Failed to archive clinical record.' });
    }
  });

  app.get(`${env.apiBasePath}/clinical/owner-analytics`, requireRoles('admin'), async (_req, res) => {
    try {
      const [usageRes, trendRes, totalRes] = await Promise.all([
        pool.query(
          `select usage_day, action_type, action_count, unique_practitioners
           from clinical_owner_usage_summary
           order by usage_day desc, action_type asc
           limit 90`
        ),
        pool.query(
          `select icd_code, severity_level, status, record_count
           from clinical_owner_diagnosis_trends
           order by record_count desc
           limit 50`
        ),
        pool.query(
          `select
             count(*)::int as total_diagnoses,
             count(*) filter (where status = 'active')::int as active_records,
             count(*) filter (where status = 'archived')::int as archived_records
           from clinical_records`
        ),
      ]);

      return res.json({
        totals: totalRes.rows[0],
        usage: usageRes.rows,
        trends: trendRes.rows,
      });
    } catch (err) {
      console.error('[SPPS API] owner clinical analytics failed:', err);
      return res.status(500).json({ message: 'Failed to load anonymized clinical analytics.' });
    }
  });
}
