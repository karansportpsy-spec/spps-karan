import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import {
  getAthleteByAuthUserId,
  parseCsvIds,
  loadAthleteExportData,
  buildAthleteCsv,
  createAthletePortalInvite,
  sendActivationEmail,
} from '../services.js';
import { sanitizeCsvFilename } from '../utils/helpers.js';

const linkAthleteSchema = z.object({
  email: z.string().email(),
});

const sendPortalInviteSchema = z.object({
  athleteId: z.string().uuid(),
  email: z.string().email(),
});

const referralSchema = z.object({
  source: z.string().optional(),
  mayThankReferrer: z.boolean().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
}).optional();

const athleteIntakeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  sport: z.string().min(1),
  team: z.string().optional(),
  position: z.string().optional(),
  experience: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  referral: referralSchema,
  familyRelationships: z.string().optional(),
  sportPsychologyHistory: z.object({
    priorPreparation: z.boolean().optional(),
    priorWorkWithPsychologist: z.boolean().optional(),
    details: z.string().optional(),
  }).optional(),
  sportBackground: z.string().optional(),
  presentingConcerns: z.string().optional(),
  concernRatings: z.record(z.number().int().min(0).max(3)).optional(),
  severityRatings: z.record(z.number().int().min(1).max(5)).optional(),
  additionalConcerns: z.string().optional(),
  injuryHistory: z.string().optional(),
  medicationsAndTreatment: z.string().optional(),
  mentalHealthHospitalization: z.string().optional(),
  intakeSignedBy: z.string().optional(),
  sendPortalInvite: z.boolean().optional().default(false),
});

const onboardingSubmissionSchema = z.object({
  practitionerId: z.string().uuid().optional(),
  signedBy: z.string().min(2),
  guardianName: z.string().optional(),
  guardianRelationship: z.string().optional(),
  guardianEmail: z.string().optional(),
  guardianPhone: z.string().optional(),
  mediaReleaseAccepted: z.boolean().default(false),
  confidentialityAccepted: z.boolean().default(true),
  consultationAccepted: z.boolean().default(true),
  intake: z.record(z.any()).default({}),
});

function isMissingRelation(err) {
  return Boolean(err && typeof err === 'object' && (err.code === '42P01' || err.code === '42703'));
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function findAthleteByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const directRes = await pool.query(
    `select id, first_name, last_name, email, practitioner_id, date_of_birth
     from athletes
     where lower(email) = $1
     order by created_at asc
     limit 1`,
    [normalizedEmail]
  );
  if (directRes.rowCount > 0) {
    return directRes.rows[0];
  }

  try {
    const profileRes = await pool.query(
      `select
         a.id,
         a.first_name,
         a.last_name,
         coalesce(a.email, ap.email) as email,
         a.practitioner_id,
         a.date_of_birth
       from athlete_profiles ap
       join athletes a on a.id = ap.athlete_id
       where lower(coalesce(ap.email, a.email)) = $1
       order by a.created_at asc
       limit 1`,
      [normalizedEmail]
    );
    return profileRes.rows[0] || null;
  } catch (err) {
    if (isMissingRelation(err)) {
      return null;
    }
    throw err;
  }
}

async function getActiveLink(practitionerId, athleteId) {
  try {
    const linkRes = await pool.query(
      `select id
       from practitioner_athlete_links
       where practitioner_id = $1
         and athlete_id = $2
         and status = 'active'
       order by linked_at desc
       limit 1`,
      [practitionerId, athleteId]
    );
    return linkRes.rows[0] || null;
  } catch (err) {
    if (!isMissingRelation(err)) {
      throw err;
    }
  }

  const legacyRes = await pool.query(
    `select id
     from athletes
     where id = $1
       and practitioner_id = $2
     limit 1`,
    [athleteId, practitionerId]
  );
  return legacyRes.rows[0] || null;
}

async function getPractitionerManagedAthlete(practitionerId, athleteId) {
  try {
    const result = await pool.query(
      `select
         a.id,
         a.first_name,
         a.last_name,
         a.email,
         a.sport,
         a.team,
         a.status,
         a.is_portal_activated,
         a.portal_user_id,
         a.created_at,
         a.updated_at,
         link.id as active_link_id,
         link.linked_at
       from athletes a
       left join lateral (
         select id, linked_at
         from practitioner_athlete_links
         where practitioner_id = $1
           and athlete_id = a.id
           and status = 'active'
         order by linked_at desc
         limit 1
       ) link on true
       where a.id = $2
         and (a.practitioner_id = $1 or link.id is not null)
       limit 1`,
      [practitionerId, athleteId]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (!isMissingRelation(err)) {
      throw err;
    }
  }

  const fallback = await pool.query(
    `select
       id,
       first_name,
       last_name,
       email,
       sport,
       team,
       status,
       is_portal_activated,
       created_at,
       updated_at
     from athletes
     where id = $2
       and practitioner_id = $1
     limit 1`,
    [practitionerId, athleteId]
  );

  return fallback.rows[0] || null;
}

async function syncAthleteProfileMirror({
  practitionerId,
  athleteId,
  email,
  firstName,
  lastName,
  sport,
  team,
  dateOfBirth,
  phone,
}) {
  try {
    await pool.query(
      `insert into athlete_profiles(
         practitioner_id, athlete_id, email, first_name, last_name, sport, team,
         date_of_birth, phone
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (athlete_id)
       do update set
         practitioner_id = excluded.practitioner_id,
         email = coalesce(excluded.email, athlete_profiles.email),
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         sport = excluded.sport,
         team = coalesce(excluded.team, athlete_profiles.team),
         date_of_birth = coalesce(excluded.date_of_birth, athlete_profiles.date_of_birth),
         phone = coalesce(excluded.phone, athlete_profiles.phone),
         updated_at = now()`,
      [
        practitionerId,
        athleteId,
        email || null,
        firstName || '',
        lastName || '',
        sport || null,
        team || null,
        dateOfBirth || null,
        phone || null,
      ]
    );
    return true;
  } catch (err) {
    if (isMissingRelation(err)) {
      return false;
    }
    throw err;
  }
}

async function ensureAthleteLinked(practitionerId, athleteId) {
  try {
    const insertRes = await pool.query(
      `insert into practitioner_athlete_links(practitioner_id, athlete_id, status)
       values ($1, $2, 'active')
       returning id`,
      [practitionerId, athleteId]
    );
    await pool.query(
      `update athletes
       set practitioner_id = $1,
           status = 'linked',
           is_portal_activated = true,
           updated_at = now()
       where id = $2`,
      [practitionerId, athleteId]
    );
    return insertRes.rows[0]?.id || athleteId;
  } catch (err) {
    if (!isMissingRelation(err)) {
      throw err;
    }
  }

  const legacyRes = await pool.query(
    `update athletes
     set practitioner_id = $1,
         status = 'linked',
         is_portal_activated = true,
         updated_at = now()
     where id = $2
     returning id`,
    [practitionerId, athleteId]
  );
  return legacyRes.rows[0]?.id || athleteId;
}

async function getPractitionerLinksForAthlete(athleteId) {
  try {
    const linksRes = await pool.query(
      `select
         l.practitioner_id,
         p.first_name,
         p.last_name,
         p.email
       from practitioner_athlete_links l
       join practitioners p on p.id = l.practitioner_id
       where l.athlete_id = $1
         and l.status = 'active'
       order by l.linked_at asc`,
      [athleteId]
    );
    return linksRes.rows;
  } catch (err) {
    if (!isMissingRelation(err)) {
      throw err;
    }
  }

  const fallbackRes = await pool.query(
    `select
       p.id as practitioner_id,
       p.first_name,
       p.last_name,
       p.email
     from athletes a
     join practitioners p on p.id = a.practitioner_id
     where a.id = $1
       and a.practitioner_id is not null`,
    [athleteId]
  );
  return fallbackRes.rows;
}

async function recordAthleteIntakeSubmission({
  practitionerId,
  athleteId,
  submittedBy,
  submittedByRole,
  source,
  signedBy,
  guardianName,
  guardianRelationship,
  guardianEmail,
  guardianPhone,
  intakeData,
}) {
  try {
    await pool.query(
      `insert into athlete_intake_submissions(
         practitioner_id, athlete_id, submitted_by, submitted_by_role, source,
         intake_status, signed_by, signed_at,
         guardian_name, guardian_relationship, guardian_email, guardian_phone,
         intake_data
       )
       values (
         $1, $2, $3, $4, $5,
         'submitted', $6, now(),
         $7, $8, $9, $10,
         $11::jsonb
       )
       on conflict (practitioner_id, athlete_id, source)
       do update set
         submitted_by = excluded.submitted_by,
         submitted_by_role = excluded.submitted_by_role,
         intake_status = 'submitted',
         signed_by = excluded.signed_by,
         signed_at = now(),
         guardian_name = excluded.guardian_name,
         guardian_relationship = excluded.guardian_relationship,
         guardian_email = excluded.guardian_email,
         guardian_phone = excluded.guardian_phone,
         intake_data = excluded.intake_data,
         updated_at = now()`,
      [
        practitionerId,
        athleteId,
        submittedBy,
        submittedByRole,
        source,
        signedBy,
        guardianName || null,
        guardianRelationship || null,
        guardianEmail || null,
        guardianPhone || null,
        JSON.stringify(intakeData || {}),
      ]
    );
    return true;
  } catch (err) {
    if (isMissingRelation(err)) {
      return false;
    }
    throw err;
  }
}

async function createSignedConsent({
  practitionerId,
  athleteId,
  formType,
  signedBy,
  guardianName,
  guardianRelationship,
  guardianEmail,
  guardianPhone,
  formData,
  signatureIp,
}) {
  await pool.query(
    `insert into consent_forms(
       practitioner_id, athlete_id, form_type, status,
       signed_by, signed_at, signed_timestamp,
       guardian_name, guardian_relationship, guardian_email, guardian_phone,
       form_data, digital_signature, signature_ip
     )
     values (
       $1, $2, $3, 'signed',
       $4, now(), now(),
       $5, $6, $7, $8,
       $9::jsonb, $10, $11::inet
     )`,
    [
      practitionerId,
      athleteId,
      formType,
      signedBy,
      guardianName || null,
      guardianRelationship || null,
      guardianEmail || null,
      guardianPhone || null,
      JSON.stringify(formData || {}),
      signedBy,
      signatureIp || null,
    ]
  );
}

export function registerAthleteRoutes(app) {
  app.get(`${env.apiBasePath}/auth/me`, async (req, res) => {
    if (req.user.role === 'athlete') {
      const athlete = await getAthleteByAuthUserId(req.user.id);
      if (!athlete) return res.status(404).json({ message: 'Athlete profile not found.' });
      return res.json({ user: req.user, athlete });
    }
    return res.json({ user: req.user });
  });

  const portalActivationSchema = z.object({
    isPortalActivated: z.boolean(),
    sendActivationEmail: z.boolean().optional().default(false),
  });

  app.post(`${env.apiBasePath}/athletes/link-by-email`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = linkAthleteSchema.parse(req.body);
      const athlete = await findAthleteByEmail(payload.email);

      if (!athlete) {
        return res.json({
          ok: false,
          code: 'ATHLETE_NOT_FOUND',
          message: 'No athlete account found for this email.',
        });
      }

      const existingLink = await getActiveLink(req.user.id, athlete.id);
      if (existingLink) {
        return res.json({
          ok: false,
          code: 'ALREADY_LINKED',
          message: 'You already have an active link with this athlete.',
          link_id: existingLink.id,
          athlete_id: athlete.id,
          athlete_first_name: athlete.first_name,
          athlete_last_name: athlete.last_name,
        });
      }

      const linkId = await ensureAthleteLinked(req.user.id, athlete.id);

      return res.json({
        ok: true,
        link_id: linkId,
        athlete_id: athlete.id,
        athlete_first_name: athlete.first_name,
        athlete_last_name: athlete.last_name,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid athlete email.', issues: err.issues });
      }
      console.error('[SPPS API] link athlete by email failed:', err);
      return res.status(500).json({ message: 'Failed to link athlete by email.' });
    }
  });

  app.get(`${env.apiBasePath}/athletes/portal-candidates`, requireRoles('practitioner'), async (req, res) => {
    try {
      const result = await pool.query(
        `select
           a.id,
           a.first_name,
           a.last_name,
           a.email,
           a.sport,
           a.team,
           a.status,
           a.is_portal_activated,
           a.portal_user_id,
           a.created_at,
           a.updated_at,
           link.id as active_link_id,
           link.linked_at
         from athletes a
         left join lateral (
           select id, linked_at
           from practitioner_athlete_links
           where practitioner_id = $1
             and athlete_id = a.id
             and status = 'active'
           order by linked_at desc
           limit 1
         ) link on true
         where a.practitioner_id = $1
            or link.id is not null
         order by a.created_at desc, a.first_name asc, a.last_name asc`,
        [req.user.id]
      );

      return res.json(result.rows);
    } catch (err) {
      if (!isMissingRelation(err)) {
        console.error('[SPPS API] load portal candidates failed:', err);
        return res.status(500).json({ message: 'Failed to load athlete portal candidates.' });
      }

      try {
        const fallback = await pool.query(
          `select
             id,
             first_name,
             last_name,
             email,
             sport,
             team,
             status,
             is_portal_activated,
             created_at,
             updated_at
           from athletes
           where practitioner_id = $1
           order by created_at desc, first_name asc, last_name asc`,
          [req.user.id]
        );

        return res.json(
          fallback.rows.map((row) => ({
            ...row,
            portal_user_id: null,
            active_link_id: null,
            linked_at: row.created_at,
          }))
        );
      } catch (fallbackErr) {
        console.error('[SPPS API] fallback portal candidates failed:', fallbackErr);
        return res.status(500).json({ message: 'Failed to load athlete portal candidates.' });
      }
    }
  });

  app.post(`${env.apiBasePath}/athletes/send-portal-invite`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = sendPortalInviteSchema.parse(req.body);
      const normalizedEmail = payload.email.trim().toLowerCase();
      const athlete = await getPractitionerManagedAthlete(req.user.id, payload.athleteId);

      if (!athlete) {
        return res.status(404).json({ message: 'Athlete not found for this practitioner.' });
      }

      const existingEmailOwner = await findAthleteByEmail(normalizedEmail);
      if (existingEmailOwner && existingEmailOwner.id !== athlete.id) {
        return res.status(409).json({
          message: 'This email is already attached to another athlete record. Use that athlete record instead.',
        });
      }

      await ensureAthleteLinked(req.user.id, athlete.id);

      await pool.query(
        `update athletes
         set email = $1,
             practitioner_id = coalesce(practitioner_id, $2),
             status = case when status = 'active' then 'linked' else status end,
             is_portal_activated = true,
             updated_at = now()
         where id = $3`,
        [normalizedEmail, req.user.id, athlete.id]
      );

      await syncAthleteProfileMirror({
        practitionerId: req.user.id,
        athleteId: athlete.id,
        email: normalizedEmail,
        firstName: athlete.first_name,
        lastName: athlete.last_name,
        sport: athlete.sport,
        team: athlete.team,
      });

      const invite = await createAthletePortalInvite({
        practitionerId: req.user.id,
        athleteId: athlete.id,
        email: normalizedEmail,
      });

      const baseUrl = String(req.headers.origin || env.clientOrigin || '').replace(/\/+$/, '');
      const portalLoginUrl = `${baseUrl}/athlete/login`;
      const portalInviteUrl = invite?.token
        ? `${baseUrl}/athlete/accept-invite?token=${invite.token}&email=${encodeURIComponent(normalizedEmail)}`
        : null;

      const emailDispatch = await sendActivationEmail({
        to: normalizedEmail,
        athleteName: `${athlete.first_name} ${athlete.last_name}`.trim(),
        portalLoginUrl,
        inviteUrl: portalInviteUrl,
      });

      const inviteSent = ['sent', 'queued'].includes(emailDispatch?.status || '');
      if (inviteSent) {
        await pool.query(
          `update athletes
           set portal_activation_email_sent_at = now()
           where id = $1`,
          [athlete.id]
        );
      }

      if (!inviteSent) {
        return res.status(502).json({
          message: 'Athlete saved, but the portal invite email could not be sent.',
          portalInviteUrl,
          activationEmailStatus: emailDispatch?.status || 'failed',
          activationEmailMethod: emailDispatch?.method || null,
          activationEmailDetail: emailDispatch?.detail || null,
          athlete: {
            id: athlete.id,
            first_name: athlete.first_name,
            last_name: athlete.last_name,
            email: normalizedEmail,
          },
        });
      }

      return res.json({
        ok: true,
        athlete: {
          id: athlete.id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          email: normalizedEmail,
        },
        portalInviteUrl,
        activationEmailStatus: emailDispatch?.status || 'queued',
        activationEmailMethod: emailDispatch?.method || null,
        activationEmailDetail: emailDispatch?.detail || null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid portal invite payload.', issues: err.issues });
      }
      console.error('[SPPS API] send portal invite failed:', err);
      return res.status(500).json({ message: 'Failed to send the athlete portal invite.' });
    }
  });

  app.post(`${env.apiBasePath}/athletes/intake-create`, requireRoles('practitioner'), async (req, res) => {
    try {
      const payload = athleteIntakeSchema.parse(req.body);
      const normalizedEmail = normalizeOptionalText(payload.email)?.toLowerCase();

      if (normalizedEmail) {
        const existingAthlete = await findAthleteByEmail(normalizedEmail);
        if (existingAthlete) {
          return res.status(409).json({
            message: 'An athlete with this email already exists. Use Link athlete instead.',
            existingAthleteId: existingAthlete.id,
          });
        }
      }

      const athleteRes = await pool.query(
        `insert into athletes(
           practitioner_id, first_name, last_name, email, phone, date_of_birth,
           sport, team, position, status, notes
         )
         values (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11
         )
         returning id, first_name, last_name, email`,
        [
          req.user.id,
          payload.firstName.trim(),
          payload.lastName.trim(),
          normalizedEmail,
          normalizeOptionalText(payload.phone),
          normalizeOptionalText(payload.dateOfBirth),
          payload.sport.trim(),
          normalizeOptionalText(payload.team),
          normalizeOptionalText(payload.position),
          normalizedEmail ? 'unverified' : 'active',
          normalizeOptionalText(payload.presentingConcerns),
        ]
      );

      const athlete = athleteRes.rows[0];

      await syncAthleteProfileMirror({
        practitionerId: req.user.id,
        athleteId: athlete.id,
        email: normalizedEmail,
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        sport: payload.sport.trim(),
        team: normalizeOptionalText(payload.team),
        dateOfBirth: normalizeOptionalText(payload.dateOfBirth),
        phone: normalizeOptionalText(payload.phone),
      });

      await ensureAthleteLinked(req.user.id, athlete.id);
      await recordAthleteIntakeSubmission({
        practitionerId: req.user.id,
        athleteId: athlete.id,
        submittedBy: req.user.id,
        submittedByRole: 'practitioner',
        source: 'practitioner_intake',
        signedBy: payload.intakeSignedBy || `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim(),
        intakeData: {
          personal_information: {
            experience: payload.experience || null,
            street_address: payload.streetAddress || null,
            city: payload.city || null,
            state_province: payload.stateProvince || null,
            postal_code: payload.postalCode || null,
          },
          referral_information: payload.referral || {},
          family_relationships: payload.familyRelationships || '',
          sport_psychology_history: payload.sportPsychologyHistory || {},
          sport_background: payload.sportBackground || '',
          presenting_concerns: payload.presentingConcerns || '',
          concern_ratings: payload.concernRatings || {},
          severity_ratings: payload.severityRatings || {},
          additional_concerns: payload.additionalConcerns || '',
          health_and_medical: {
            injury_history: payload.injuryHistory || '',
            medications_and_treatment: payload.medicationsAndTreatment || '',
            mental_health_hospitalization: payload.mentalHealthHospitalization || '',
          },
        },
      });

      let portalInviteUrl = null;
      let portalInviteStatus = 'not_requested';
      let portalInviteMethod = null;
      let portalInviteDetail = null;
      if (payload.sendPortalInvite && athlete.email) {
        const invite = await createAthletePortalInvite({
          practitionerId: req.user.id,
          athleteId: athlete.id,
          email: athlete.email,
        });

        const baseUrl = String(req.headers.origin || env.clientOrigin || '').replace(/\/+$/, '');
        if (invite?.token) {
          portalInviteUrl = `${baseUrl}/athlete/accept-invite?token=${invite.token}&email=${encodeURIComponent(
            athlete.email
          )}`;
        }

        const emailDispatch = await sendActivationEmail({
          to: athlete.email,
          athleteName: `${athlete.first_name} ${athlete.last_name}`.trim(),
          portalLoginUrl: `${baseUrl}/athlete/login`,
          inviteUrl: portalInviteUrl,
        });
        portalInviteStatus = emailDispatch?.status || 'failed';
        portalInviteMethod = emailDispatch?.method || null;
        portalInviteDetail = emailDispatch?.detail || null;
      }

      return res.status(201).json({
        athlete,
        portalInviteUrl,
        portalInviteStatus,
        portalInviteMethod,
        portalInviteDetail,
        message: 'Athlete added successfully.',
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid intake payload.', issues: err.issues });
      }
      console.error('[SPPS API] create athlete from intake failed:', err);
      return res.status(500).json({ message: 'Failed to create athlete from intake.' });
    }
  });

  app.get(`${env.apiBasePath}/athlete/onboarding-status`, requireRoles('athlete'), async (req, res) => {
    try {
      const athleteId = req.user.athleteId;
      if (!athleteId) {
        return res.status(404).json({ message: 'Athlete profile not found.' });
      }

      const activePractitioners = await getPractitionerLinksForAthlete(athleteId);
      const athleteRes = await pool.query(
        `select id, date_of_birth from athletes where id = $1 limit 1`,
        [athleteId]
      );
      const athlete = athleteRes.rows[0];
      const isMinor = Boolean(
        athlete?.date_of_birth &&
        ((Date.now() - new Date(athlete.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) < 18
      );

      const consentRes = await pool.query(
        `select practitioner_id, form_type, status, form_data, signed_at
         from consent_forms
         where athlete_id = $1
           and status in ('signed', 'uploaded')
         order by created_at desc`,
        [athleteId]
      );

      let intakeRows = [];
      try {
        const intakeRes = await pool.query(
          `select practitioner_id, intake_status, source, signed_at, updated_at
           from athlete_intake_submissions
           where athlete_id = $1
           order by updated_at desc, created_at desc`,
          [athleteId]
        );
        intakeRows = intakeRes.rows;
      } catch (err) {
        if (!isMissingRelation(err)) {
          throw err;
        }
      }

      const practitioners = activePractitioners.map((row) => {
        const practitionerForms = consentRes.rows.filter((form) => form.practitioner_id === row.practitioner_id);
        const formTypes = new Set(practitionerForms.map((form) => String(form.form_type || '').toLowerCase()));
        const intakeComplete = intakeRows.some(
          (intake) =>
            intake.practitioner_id === row.practitioner_id &&
            ['submitted', 'reviewed'].includes(String(intake.intake_status || '').toLowerCase())
        );

        const consentComplete =
          formTypes.has('consent_confidentiality') ||
          formTypes.has('consent') ||
          formTypes.has('informed_consent') ||
          formTypes.has('confidentiality');

        const mediaComplete =
          formTypes.has('photo_media') ||
          formTypes.has('media_release') ||
          formTypes.has('photo_release') ||
          formTypes.has('image_release');

        const parentalComplete =
          !isMinor ||
          formTypes.has('parental_release') ||
          formTypes.has('parental_consent') ||
          formTypes.has('guardian_consent') ||
          formTypes.has('guardian_release');

        const missing = [];
        if (!intakeComplete) missing.push('intake');
        if (!consentComplete) missing.push('consent_confidentiality');
        if (!mediaComplete) missing.push('photo_media');
        if (!parentalComplete) missing.push('parental_release');

        return {
          practitionerId: row.practitioner_id,
          practitionerName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Your practitioner',
          practitionerEmail: row.email || '',
          missing,
          complete: missing.length === 0,
        };
      });

      return res.json({
        athleteId,
        isMinor,
        requiresOnboarding: practitioners.some((practitioner) => !practitioner.complete),
        practitioners,
      });
    } catch (err) {
      console.error('[SPPS API] athlete onboarding status failed:', err);
      return res.status(500).json({ message: 'Failed to load onboarding status.' });
    }
  });

  app.post(`${env.apiBasePath}/athlete/onboarding-submit`, requireRoles('athlete'), async (req, res) => {
    try {
      const payload = onboardingSubmissionSchema.parse(req.body);
      const athleteId = req.user.athleteId;
      if (!athleteId) {
        return res.status(404).json({ message: 'Athlete profile not found.' });
      }

      const activePractitioners = await getPractitionerLinksForAthlete(athleteId);
      const practitionerId = payload.practitionerId || req.user.practitionerId || activePractitioners[0]?.practitioner_id;
      if (!practitionerId) {
        return res.status(403).json({ message: 'No active practitioner link found for onboarding.' });
      }

      const hasAccess = activePractitioners.some((row) => row.practitioner_id === practitionerId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'You are not actively linked to this practitioner.' });
      }

      const athleteRes = await pool.query(
        `select id, date_of_birth from athletes where id = $1 limit 1`,
        [athleteId]
      );
      const athlete = athleteRes.rows[0];
      const isMinor = Boolean(
        athlete?.date_of_birth &&
        ((Date.now() - new Date(athlete.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) < 18
      );

      await recordAthleteIntakeSubmission({
        practitionerId,
        athleteId,
        submittedBy: req.user.id,
        submittedByRole: 'athlete',
        source: 'athlete_portal',
        signedBy: payload.signedBy,
        guardianName: payload.guardianName,
        guardianRelationship: payload.guardianRelationship,
        guardianEmail: payload.guardianEmail,
        guardianPhone: payload.guardianPhone,
        intakeData: payload.intake,
      });

      const signatureIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim() || null;

      await createSignedConsent({
        practitionerId,
        athleteId,
        formType: 'consent_confidentiality',
        signedBy: payload.signedBy,
        formData: {
          source: 'athlete_portal',
          confidentiality_accepted: payload.confidentialityAccepted,
          consultation_accepted: payload.consultationAccepted,
        },
        signatureIp,
      });

      await createSignedConsent({
        practitionerId,
        athleteId,
        formType: 'photo_media',
        signedBy: payload.signedBy,
        guardianName: payload.guardianName,
        guardianRelationship: payload.guardianRelationship,
        guardianEmail: payload.guardianEmail,
        guardianPhone: payload.guardianPhone,
        formData: {
          source: 'athlete_portal',
          media_release_accepted: payload.mediaReleaseAccepted,
        },
        signatureIp,
      });

      if (isMinor) {
        await createSignedConsent({
          practitionerId,
          athleteId,
          formType: 'parental_release',
          signedBy: payload.signedBy,
          guardianName: payload.guardianName,
          guardianRelationship: payload.guardianRelationship,
          guardianEmail: payload.guardianEmail,
          guardianPhone: payload.guardianPhone,
          formData: {
            source: 'athlete_portal',
            parental_release_accepted: true,
          },
          signatureIp,
        });
      }

      await pool.query(
        `update athletes
         set status = 'linked',
             is_portal_activated = true,
             portal_last_login_at = now(),
             practitioner_id = coalesce(practitioner_id, $1),
             updated_at = now()
         where id = $2`,
        [practitionerId, athleteId]
      );

      return res.status(201).json({ ok: true, message: 'Onboarding submitted successfully.' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid onboarding payload.', issues: err.issues });
      }
      console.error('[SPPS API] athlete onboarding submit failed:', err);
      return res.status(500).json({ message: 'Failed to submit onboarding forms.' });
    }
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
        let activationEmailStatus = 'not_requested';
        let activationEmailMethod = null;
        let activationEmailDetail = null;
        const baseUrl = String(req.headers.origin || env.clientOrigin || '').replace(/\/+$/, '');
        const portalLoginUrl = `${baseUrl}/athlete/login`;
        let portalInviteUrl = null;

        if (payload.isPortalActivated && athlete.email) {
          try {
            const invite = await createAthletePortalInvite({
              practitionerId: req.user.id,
              athleteId: athlete.id,
              email: athlete.email,
            });
            if (invite?.token) {
              portalInviteUrl = `${baseUrl}/athlete/accept-invite?token=${invite.token}&email=${encodeURIComponent(
                athlete.email
              )}`;
            }
          } catch (inviteErr) {
            console.error('[SPPS API] create portal invite failed:', inviteErr);
          }
        }

        if (payload.isPortalActivated && payload.sendActivationEmail && athlete.email) {
          try {
            const emailDispatch = await sendActivationEmail({
              to: athlete.email,
              athleteName: `${athlete.first_name} ${athlete.last_name}`,
              portalLoginUrl,
              inviteUrl: portalInviteUrl,
            });
            activationEmailStatus = emailDispatch?.status || 'failed';
            activationEmailMethod = emailDispatch?.method || null;
            activationEmailDetail = emailDispatch?.detail || null;
            activationEmailSent = ['sent', 'queued'].includes(activationEmailStatus);

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
          activationEmailStatus,
          activationEmailMethod,
          activationEmailDetail,
          portalLoginUrl: payload.isPortalActivated ? portalLoginUrl : null,
          portalInviteUrl: payload.isPortalActivated ? portalInviteUrl : null,
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
