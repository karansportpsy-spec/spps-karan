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

export async function getAthleteByPortalUserId(userId) {
  const result = await pool.query(
    `select id, practitioner_id, first_name, last_name, email, sport, team, is_portal_activated
     from athletes
     where portal_user_id = $1
     limit 1`,
    [userId]
  );
  return result.rows[0] || null;
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
       from athletes
       where practitioner_id = $1
         and portal_user_id = $2
         and is_portal_activated = true
       limit 1`,
      [senderId, receiverId]
    );
    return result.rowCount > 0;
  }

  if (senderRole === 'athlete' && receiverRole === 'practitioner') {
    const result = await pool.query(
      `select 1
       from athletes
       where portal_user_id = $1
         and practitioner_id = $2
         and is_portal_activated = true
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
