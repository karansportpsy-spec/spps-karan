import crypto from 'crypto';
import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import { SESSION_TOKEN_COST, debitWallet } from '../services/billing.js';

const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  timezone: z.string().min(2).default('UTC'),
});

const bookingRequestSchema = z.object({
  practitionerUserId: z.string().uuid(),
  requestedStart: z.string().datetime().optional(),
  requestedEnd: z.string().datetime().optional(),
  note: z.string().max(2000).optional(),
});

const confirmBookingSchema = z.object({
  practitionerUserId: z.string().uuid(),
  relationshipId: z.string().uuid().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  timezone: z.string().min(2).default('UTC'),
  paymentOrderId: z.string().uuid().optional(),
  useWallet: z.boolean().default(false),
  note: z.string().max(2000).optional(),
});

async function findActiveRelationship(client, practitionerUserId, athleteUserId, relationshipId = null) {
  const params = [practitionerUserId, athleteUserId];
  let whereClause = `practitioner_user_id = $1 and athlete_user_id = $2 and status = 'active'`;

  if (relationshipId) {
    params.push(relationshipId);
    whereClause += ` and id = $3`;
  }

  const result = await client.query(
    `select *
     from practitioner_athlete_relationships
     where ${whereClause}
     limit 1`,
    params
  );

  return result.rows[0] || null;
}

async function createLegacySessionIfPossible(client, { practitionerUserId, athleteUserId, scheduledStart, scheduledEnd, note }) {
  try {
    const practitionerRes = await client.query(
      `select id
       from practitioners
       where id = $1
       limit 1`,
      [practitionerUserId]
    );
    if (practitionerRes.rowCount === 0) return null;

    let athleteRes = await client.query(
      `select id
       from athletes
       where id = $1
       limit 1`,
      [athleteUserId]
    );

    if (athleteRes.rowCount === 0) {
      athleteRes = await client.query(
        `select id
         from athletes
         where portal_user_id = $1
         limit 1`,
        [athleteUserId]
      );
    }

    if (athleteRes.rowCount === 0) return null;

    const durationMinutes = Math.max(
      30,
      Math.round(
        (new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime()) / (1000 * 60)
      )
    );

    const insertRes = await client.query(
      `insert into sessions(
         practitioner_id, athlete_id, session_type, status, scheduled_at, duration_minutes, location, notes
       )
       values ($1, $2, 'individual', 'scheduled', $3, $4, 'video', $5)
       returning id`,
      [practitionerUserId, athleteRes.rows[0].id, scheduledStart, durationMinutes, note || null]
    );

    return insertRes.rows[0]?.id || null;
  } catch (error) {
    if (error && typeof error === 'object' && (error.code === '42P01' || error.code === '42703')) {
      return null;
    }
    throw error;
  }
}

function buildSlotsForDay({ rows, existingBookings, date }) {
  const slots = [];
  const slotSize = 30;

  for (const row of rows) {
    for (let minute = row.start_minute; minute + slotSize <= row.end_minute; minute += slotSize) {
      const start = new Date(`${date}T00:00:00.000Z`);
      start.setUTCMinutes(minute);
      const end = new Date(start.getTime() + slotSize * 60 * 1000);

      const overlapping = existingBookings.some((booking) => {
        const bookingStart = new Date(booking.scheduled_start).getTime();
        const bookingEnd = new Date(booking.scheduled_end).getTime();
        return start.getTime() < bookingEnd && end.getTime() > bookingStart;
      });

      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        available: !overlapping,
      });
    }
  }

  return slots;
}

export function registerBookingRoutes(app) {
  app.get(`${env.apiBasePath}/practitioners/:practitionerUserId/availability`, requireRoles('athlete', 'practitioner', 'admin'), async (req, res) => {
    try {
      const practitionerUserId = z.string().uuid().parse(req.params.practitionerUserId);
      const date = String(req.query.date || '').slice(0, 10);
      if (!date) {
        return res.status(400).json({ message: 'A date query parameter is required.' });
      }

      const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();

      const [availabilityResult, existingResult] = await Promise.all([
        pool.query(
          `select day_of_week, start_minute, end_minute, timezone
           from practitioner_availability
           where practitioner_user_id = $1
             and day_of_week = $2
             and is_active = true
           order by start_minute asc`,
          [practitionerUserId, dayOfWeek]
        ),
        pool.query(
          `select scheduled_start, scheduled_end
           from session_bookings
           where practitioner_user_id = $1
             and status in ('confirmed', 'completed')
             and scheduled_start::date = $2::date`,
          [practitionerUserId, date]
        ),
      ]);

      res.json({
        practitionerUserId,
        date,
        slots: buildSlotsForDay({
          rows: availabilityResult.rows,
          existingBookings: existingResult.rows,
          date,
        }),
      });
    } catch (error) {
      console.error('[SPPS Booking] availability fetch failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch availability.' });
    }
  });

  app.put(`${env.apiBasePath}/practitioners/me/availability`, requireRoles('practitioner', 'admin'), async (req, res) => {
    let client;
    try {
      const payload = z.array(availabilitySlotSchema).max(50).parse(req.body?.slots || req.body);
      client = await pool.connect();
      await client.query('begin');

      await client.query(
        `delete from practitioner_availability
         where practitioner_user_id = $1`,
        [req.user.id]
      );

      for (const slot of payload) {
        await client.query(
          `insert into practitioner_availability(
             practitioner_user_id, day_of_week, start_minute, end_minute, timezone, is_active
           )
           values ($1, $2, $3, $4, $5, true)`,
          [req.user.id, slot.dayOfWeek, slot.startMinute, slot.endMinute, slot.timezone]
        );
      }

      await client.query('commit');
      res.json({ slots: payload });
    } catch (error) {
      if (client) await client.query('rollback');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid availability payload.', issues: error.issues });
      }
      console.error('[SPPS Booking] availability update failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update availability.' });
    } finally {
      if (client) client.release();
    }
  });

  app.post(`${env.apiBasePath}/session-requests`, requireRoles('athlete'), async (req, res) => {
    let client;
    try {
      const payload = bookingRequestSchema.parse(req.body);
      client = await pool.connect();
      await client.query('begin');

      const relationship = await findActiveRelationship(client, payload.practitionerUserId, req.user.id);
      if (!relationship) {
        return res.status(403).json({ message: 'An active practitioner relationship is required before requesting a session.' });
      }

      const insertRes = await client.query(
        `insert into session_booking_requests(
           athlete_user_id, practitioner_user_id, relationship_id, requested_start, requested_end, note, token_quote
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          req.user.id,
          payload.practitionerUserId,
          relationship.id,
          payload.requestedStart || null,
          payload.requestedEnd || null,
          payload.note || null,
          SESSION_TOKEN_COST,
        ]
      );

      await client.query('commit');
      res.status(201).json(insertRes.rows[0]);
    } catch (error) {
      if (client) await client.query('rollback');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid session request payload.', issues: error.issues });
      }
      console.error('[SPPS Booking] session request failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create session request.' });
    } finally {
      if (client) client.release();
    }
  });

  app.post(`${env.apiBasePath}/session-bookings/confirm`, requireRoles('athlete'), async (req, res) => {
    let client;
    try {
      const payload = confirmBookingSchema.parse(req.body);
      client = await pool.connect();
      await client.query('begin');

      const relationship = await findActiveRelationship(
        client,
        payload.practitionerUserId,
        req.user.id,
        payload.relationshipId || null
      );

      if (!relationship) {
        return res.status(403).json({ message: 'This athlete is not actively linked to the selected practitioner.' });
      }

      if (payload.useWallet) {
        await debitWallet({
          client,
          userId: req.user.id,
          quantity: SESSION_TOKEN_COST,
          reason: 'session_booking',
          idempotencyKey: `booking_${crypto.randomUUID()}`,
          relatedUserId: payload.practitionerUserId,
          metadata: {
            scheduledStart: payload.scheduledStart,
            scheduledEnd: payload.scheduledEnd,
          },
        });
      } else {
        if (!payload.paymentOrderId) {
          return res.status(400).json({ message: 'A paid payment order or wallet usage is required to confirm booking.' });
        }

        const paymentOrder = await client.query(
          `select *
           from payment_orders
           where id = $1
             and athlete_user_id = $2
             and practitioner_user_id = $3
             and status = 'paid'
             and product_type = 'session_unlock'
           limit 1`,
          [payload.paymentOrderId, req.user.id, payload.practitionerUserId]
        );

        if (paymentOrder.rowCount === 0) {
          return res.status(400).json({ message: 'No paid session unlock order was found for this practitioner.' });
        }
      }

      const videoRoom = await client.query(
        `insert into video_rooms(room_provider, room_url, room_metadata)
         values ('external', $1, $2::jsonb)
         returning *`,
        [
          `${env.clientOrigin}/video/${crypto.randomUUID()}`,
          JSON.stringify({
            scheduledStart: payload.scheduledStart,
            scheduledEnd: payload.scheduledEnd,
          }),
        ]
      );

      const bookingRes = await client.query(
        `insert into session_bookings(
           relationship_id, athlete_user_id, practitioner_user_id, payment_order_id, video_room_id,
           scheduled_start, scheduled_end, timezone, status, token_cost, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9, $10)
         returning *`,
        [
          relationship.id,
          req.user.id,
          payload.practitionerUserId,
          payload.paymentOrderId || null,
          videoRoom.rows[0].id,
          payload.scheduledStart,
          payload.scheduledEnd,
          payload.timezone,
          SESSION_TOKEN_COST,
          payload.note || null,
        ]
      );

      const legacySessionId = await createLegacySessionIfPossible(client, {
        practitionerUserId: payload.practitionerUserId,
        athleteUserId: req.user.id,
        scheduledStart: payload.scheduledStart,
        scheduledEnd: payload.scheduledEnd,
        note: payload.note,
      });

      await client.query('commit');
      res.status(201).json({
        booking: bookingRes.rows[0],
        videoRoom: videoRoom.rows[0],
        legacySessionId,
      });
    } catch (error) {
      if (client) await client.query('rollback');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid booking confirmation payload.', issues: error.issues });
      }
      if (error instanceof Error && error.message.toLowerCase().includes('insufficient tokens')) {
        return res.status(402).json({ message: error.message });
      }
      console.error('[SPPS Booking] booking confirmation failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to confirm session booking.' });
    } finally {
      if (client) client.release();
    }
  });
}
