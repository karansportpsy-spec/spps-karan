import { z } from 'zod';

import { env } from '../env.js';
import { pool } from '../db.js';
import { requireRoles } from '../middleware/auth.js';
import { buildConversationKey, normalizePagination } from '../utils/helpers.js';
import { assertMessagePeerAccess, persistMessage } from '../services.js';

const messageSendSchema = z.object({
  receiverId: z.string().uuid(),
  receiverRole: z.enum(['practitioner', 'athlete', 'admin']),
  body: z.string().min(1).max(4000),
});

const messagePeerSchema = z.object({
  peerId: z.string().uuid(),
  peerRole: z.enum(['practitioner', 'athlete', 'admin']),
});

export function registerMessageRoutes(app, io) {
  app.get(`${env.apiBasePath}/messages/history`, requireRoles('practitioner', 'athlete', 'admin'), async (req, res) => {
    try {
      const { peerId, peerRole } = messagePeerSchema.parse({
        peerId: req.query.peerId,
        peerRole: req.query.peerRole,
      });

      const isAllowed = await assertMessagePeerAccess({
        senderId: req.user.id,
        senderRole: req.user.role,
        receiverId: peerId,
        receiverRole: peerRole,
      });
      if (!isAllowed) {
        return res.status(403).json({ message: 'No access to this conversation.' });
      }

      const conversationKey = buildConversationKey(req.user.role, req.user.id, peerRole, peerId);
      const { limit, offset } = normalizePagination(req.query);

      const rows = await pool.query(
        `select *
         from messages
         where conversation_key = $1
         order by created_at desc
         limit $2 offset $3`,
        [conversationKey, limit, offset]
      );

      res.json(rows.rows.reverse());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid message history query.', issues: err.issues });
      }
      console.error('[SPPS API] message history failed:', err);
      res.status(500).json({ message: 'Failed to fetch message history.' });
    }
  });

  app.post(`${env.apiBasePath}/messages`, requireRoles('practitioner', 'athlete', 'admin'), async (req, res) => {
    try {
      const payload = messageSendSchema.parse(req.body);

      const isAllowed = await assertMessagePeerAccess({
        senderId: req.user.id,
        senderRole: req.user.role,
        receiverId: payload.receiverId,
        receiverRole: payload.receiverRole,
      });
      if (!isAllowed) {
        return res.status(403).json({ message: 'Messaging is not permitted for this peer.' });
      }

      const message = await persistMessage({
        senderId: req.user.id,
        senderRole: req.user.role,
        receiverId: payload.receiverId,
        receiverRole: payload.receiverRole,
        body: payload.body.trim(),
      });

      const senderRoom = `user:${req.user.role}:${req.user.id}`;
      const receiverRoom = `user:${payload.receiverRole}:${payload.receiverId}`;
      io.to(senderRoom).to(receiverRoom).emit('chat:new', message);

      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid message payload.', issues: err.issues });
      }
      console.error('[SPPS API] message send failed:', err);
      res.status(500).json({ message: 'Failed to send message.' });
    }
  });
}

export { messageSendSchema };
