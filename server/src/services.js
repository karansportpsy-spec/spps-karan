import nodemailer from 'nodemailer';
import { Parser } from 'json2csv';

import { env } from './env.js';
import { pool } from './db.js';
import { supabaseAdmin } from './supabase.js';
import { buildConversationKey } from './utils/helpers.js';

let smtpTransporter = null;

export function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;

  smtpTransporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  return smtpTransporter;
}

function sanitizeBaseUrl(rawUrl) {
  if (!rawUrl) return env.clientOrigin.replace(/\/+$/, '');
  return String(rawUrl).replace(/\/+$/, '');
}

export async function createAthletePortalInvite({ practitionerId, athleteId, email }) {
  try {
    const insertRes = await pool.query(
      `insert into athlete_invites(practitioner_id, athlete_id, email)
       values ($1, $2, $3)
       returning token, expires_at`,
      [practitionerId, athleteId, email]
    );

    return insertRes.rows[0] || null;
  } catch (err) {
    // If the legacy invites table doesn't exist, we still return a login link fallback.
    if (err && typeof err === 'object' && err.code === '42P01') {
      return null;
    }
    throw err;
  }
}

export async function sendActivationEmail({ to, athleteName, portalLoginUrl, inviteUrl }) {
  if (!env.enableActivationEmail) {
    return { status: 'disabled', method: null, detail: 'activation_email_disabled' };
  }
  const transporter = getSmtpTransporter();

  const loginUrl = portalLoginUrl || `${sanitizeBaseUrl(env.clientOrigin)}/athlete/login`;
  const inviteLine = inviteUrl
    ? `To create your portal password for first-time access, open this secure link:\n${inviteUrl}\n\n`
    : '';

  if (transporter) {
    try {
      await transporter.sendMail({
        from: env.smtpFrom,
        to,
        subject: 'Your SPPS athlete portal is activated',
        text:
          `Hello ${athleteName},\n\n` +
          'Your athlete portal has been activated by your practitioner. ' +
          'You can now access assigned intervention programs, daily logs, and chat.\n\n' +
          inviteLine +
          `Athlete Portal Login:\n${loginUrl}\n\n` +
          'Regards,\nSPPS Team',
      });
      return { status: 'sent', method: 'smtp', detail: null };
    } catch (smtpErr) {
      console.error('[SPPS API] SMTP activation email failed:', smtpErr);
    }
  }

  // SMTP not configured: fallback to Supabase Auth transactional email flow.
  const resetResult = await supabaseAdmin.auth.resetPasswordForEmail(to, {
    redirectTo: inviteUrl || loginUrl,
  });
  if (!resetResult.error) {
    return { status: 'queued', method: 'supabase_reset', detail: null };
  }

  const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(to, {
    redirectTo: inviteUrl || loginUrl,
    data: {
      role: 'athlete',
      athlete_name: athleteName,
    },
  });
  if (!inviteResult.error) {
    return { status: 'queued', method: 'supabase_invite', detail: null };
  }

  return {
    status: 'failed',
    method: null,
    detail: resetResult.error?.message || inviteResult.error?.message || 'email_dispatch_failed',
  };
}

export async function getAthleteByAuthUserId(userId) {
  const result = await pool.query(
    `select
       a.id,
       link.practitioner_id,
       a.first_name,
       a.last_name,
       a.email,
       a.sport,
       a.team,
       a.is_portal_activated
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
    [userId]
  );
  if (result.rows[0]) {
    return result.rows[0];
  }

  try {
    const legacyResult = await pool.query(
      `select
         a.id,
         link.practitioner_id,
         a.first_name,
         a.last_name,
         a.email,
         a.sport,
         a.team,
         a.is_portal_activated
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
      [userId]
    );

    if (legacyResult.rows[0]) {
      return legacyResult.rows[0];
    }
  } catch (err) {
    if (err && typeof err === 'object' && err.code === '42703') {
      // Older schemas may not have portal_user_id yet; continue to self-heal below.
    } else {
      throw err;
    }
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return null;
    }
    return ensureAthleteForAuthUser(data.user);
  } catch (err) {
    console.error('[SPPS API] getAthleteByAuthUserId provision failed:', err);
    return null;
  }
}

export async function ensurePractitionerForAuthUser(user) {
  if (!user) return null;

  const existingById = await pool.query(
    `select *
     from practitioners
     where id = $1
     limit 1`,
    [user.id]
  );

  if (existingById.rowCount > 0) {
    return existingById.rows[0];
  }

  if (user.email) {
    const existingByEmail = await pool.query(
      `select *
       from practitioners
       where lower(email) = lower($1)
       limit 1`,
      [user.email]
    );

    if (existingByEmail.rowCount > 0) {
      return existingByEmail.rows[0];
    }
  }

  const firstName = String(user.user_metadata?.first_name || '').trim();
  const lastName = String(user.user_metadata?.last_name || '').trim();
  const practitionerRole = String(user.user_metadata?.practitioner_role || '').trim()
    || String(user.user_metadata?.role || '').trim()
    || 'sport_psychologist';

  const insertResult = await pool.query(
    `insert into practitioners(
       id,
       email,
       first_name,
       last_name,
       role,
       hipaa_acknowledged,
       compliance_completed,
       notification_email,
       notification_sms
     )
     values ($1, $2, $3, $4, $5, false, false, true, false)
     returning *`,
    [
      user.id,
      user.email || '',
      firstName || 'Practitioner',
      lastName || '',
      practitionerRole === 'practitioner' ? 'sport_psychologist' : practitionerRole,
    ]
  );

  return insertResult.rows[0] || null;
}

export async function ensureAthleteForAuthUser(user) {
  if (!user) return null;

  const firstName = String(user.user_metadata?.first_name || '').trim();
  const lastName = String(user.user_metadata?.last_name || '').trim();
  const sport = String(user.user_metadata?.sport || '').trim();
  const practitionerId = String(user.user_metadata?.practitioner_id || '').trim() || null;
  const athleteId = String(user.user_metadata?.athlete_id || '').trim() || null;

  if (athleteId) {
    const updateById = await pool.query(
      `update athletes
       set portal_user_id = $1,
           email = coalesce(email, $2),
           practitioner_id = coalesce(practitioner_id, $3),
           is_portal_activated = true,
           updated_at = now()
       where id = $4
       returning id, practitioner_id, first_name, last_name, email, sport, team, is_portal_activated`,
      [user.id, user.email || null, practitionerId, athleteId]
    );
    if (updateById.rowCount > 0) {
      return updateById.rows[0];
    }
  }

  if (user.email) {
    const updateByEmail = await pool.query(
      `update athletes
       set portal_user_id = $1,
           practitioner_id = coalesce(practitioner_id, $2),
           is_portal_activated = true,
           updated_at = now()
       where lower(email) = lower($3)
       returning id, practitioner_id, first_name, last_name, email, sport, team, is_portal_activated`,
      [user.id, practitionerId, user.email]
    );
    if (updateByEmail.rowCount > 0) {
      return updateByEmail.rows[0];
    }
  }

  const insertResult = await pool.query(
    `insert into athletes(
       practitioner_id, first_name, last_name, email, sport,
       status, is_portal_activated, portal_user_id
     )
     values ($1, $2, $3, $4, $5, $6, true, $7)
     returning id, practitioner_id, first_name, last_name, email, sport, team, is_portal_activated`,
    [
      practitionerId,
      firstName || 'Athlete',
      lastName || '',
      user.email || null,
      sport,
      practitionerId ? 'linked' : 'unverified',
      user.id,
    ]
  );

  return insertResult.rows[0] || null;
}

export async function assertAthleteAccess(req, athleteId) {
  if (req.user.role === 'admin') return true;

  if (req.user.role === 'practitioner') {
    const result = await pool.query(
      `select 1
       from athletes
       where id = $1
         and practitioner_id = $2
       limit 1`,
      [athleteId, req.user.id]
    );
    return result.rowCount > 0;
  }

  if (req.user.role === 'athlete') return req.user.athleteId === athleteId;
  return false;
}

export async function assertMessagePeerAccess({ senderId, senderRole, receiverId, receiverRole }) {
  if (senderRole === 'admin' || receiverRole === 'admin') return true;

  if (senderRole === 'practitioner' && receiverRole === 'athlete') {
    const result = await pool.query(
      `select 1
       from practitioner_athlete_links
       where practitioner_id = $1
         and athlete_id = $2
         and status = 'active'
       limit 1`,
      [senderId, receiverId]
    );
    return result.rowCount > 0;
  }

  if (senderRole === 'athlete' && receiverRole === 'practitioner') {
    const result = await pool.query(
      `select 1
       from practitioner_athlete_links
       where athlete_id = $1
         and practitioner_id = $2
         and status = 'active'
       limit 1`,
      [senderId, receiverId]
    );
    return result.rowCount > 0;
  }

  return false;
}

export function parseCsvIds(idsString) {
  if (!idsString) return [];
  return idsString
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function loadAthleteExportData(practitionerId, athleteIds = []) {
  const params = [practitionerId];
  let athleteFilter = '';
  if (athleteIds.length > 0) {
    params.push(athleteIds);
    athleteFilter = ` and a.id = any($2::uuid[])`;
  }

  const athletesRes = await pool.query(
    `select a.*
     from athletes a
     where a.practitioner_id = $1${athleteFilter}
     order by a.first_name asc, a.last_name asc`,
    params
  );

  if (athletesRes.rowCount === 0) return [];

  const ids = athletesRes.rows.map((row) => row.id);
  const commonParams = [practitionerId, ids];

  const [sessionsRes, checkinsRes, assessmentsRes, interventionsRes, reportsRes] = await Promise.all([
    pool.query(
      `select athlete_id, count(*) as count
       from sessions
       where practitioner_id = $1 and athlete_id = any($2::uuid[])
       group by athlete_id`,
      commonParams
    ),
    pool.query(
      `select athlete_id, count(*) as count
       from check_ins
       where practitioner_id = $1 and athlete_id = any($2::uuid[])
       group by athlete_id`,
      commonParams
    ),
    pool.query(
      `select athlete_id, count(*) as count
       from assessments
       where practitioner_id = $1 and athlete_id = any($2::uuid[])
       group by athlete_id`,
      commonParams
    ),
    pool.query(
      `select athlete_id, count(*) as count
       from interventions
       where practitioner_id = $1 and athlete_id = any($2::uuid[])
       group by athlete_id`,
      commonParams
    ),
    pool.query(
      `select athlete_id, count(*) as count
       from reports
       where practitioner_id = $1 and athlete_id = any($2::uuid[])
       group by athlete_id`,
      commonParams
    ),
  ]);

  const countsByAthlete = {
    sessions: Object.fromEntries(sessionsRes.rows.map((r) => [r.athlete_id, Number(r.count)])),
    checkins: Object.fromEntries(checkinsRes.rows.map((r) => [r.athlete_id, Number(r.count)])),
    assessments: Object.fromEntries(assessmentsRes.rows.map((r) => [r.athlete_id, Number(r.count)])),
    interventions: Object.fromEntries(interventionsRes.rows.map((r) => [r.athlete_id, Number(r.count)])),
    reports: Object.fromEntries(reportsRes.rows.map((r) => [r.athlete_id, Number(r.count)])),
  };

  return athletesRes.rows.map((a) => ({
    id: a.id,
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email,
    phone: a.phone,
    date_of_birth: a.date_of_birth,
    sport: a.sport,
    team: a.team,
    position: a.position,
    status: a.status,
    risk_level: a.risk_level,
    is_portal_activated: a.is_portal_activated,
    portal_activated_at: a.portal_activated_at,
    uid_code: a.uid_code,
    created_at: a.created_at,
    sessions_count: countsByAthlete.sessions[a.id] || 0,
    checkins_count: countsByAthlete.checkins[a.id] || 0,
    assessments_count: countsByAthlete.assessments[a.id] || 0,
    interventions_count: countsByAthlete.interventions[a.id] || 0,
    reports_count: countsByAthlete.reports[a.id] || 0,
  }));
}

export function buildAthleteCsv(rows) {
  const parser = new Parser({
    fields: [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'date_of_birth',
      'sport',
      'team',
      'position',
      'status',
      'risk_level',
      'is_portal_activated',
      'portal_activated_at',
      'uid_code',
      'created_at',
      'sessions_count',
      'checkins_count',
      'assessments_count',
      'interventions_count',
      'reports_count',
    ],
  });

  return parser.parse(rows);
}

export async function persistMessage({ senderId, senderRole, receiverId, receiverRole, body }) {
  const conversationKey = buildConversationKey(senderRole, senderId, receiverRole, receiverId);
  const insertRes = await pool.query(
    `insert into messages(
      conversation_key,
      sender_id,
      sender_role,
      receiver_id,
      receiver_role,
      body
    )
    values ($1, $2, $3, $4, $5, $6)
    returning *`,
    [conversationKey, senderId, senderRole, receiverId, receiverRole, body]
  );
  return insertRes.rows[0];
}
