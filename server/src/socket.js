import { z } from 'zod';

import { pool } from './db.js';
import { supabaseAdmin } from './supabase.js';
import { resolveUserRole } from './middleware/auth.js';
import { assertMessagePeerAccess, getAthleteByAuthUserId, persistMessage } from './services.js';
import { buildConversationKey } from './utils/helpers.js';
import { messageSendSchema } from './routes/messageRoutes.js';

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Missing socket auth token.'));
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        return next(new Error('Invalid socket auth token.'));
      }

      const role = await resolveUserRole(data.user.id);
      const socketUser = {
        id: data.user.id,
        role,
      };

      if (role === 'athlete') {
        const athlete = await getAthleteByAuthUserId(data.user.id);
        socketUser.athleteId = athlete?.id;
        socketUser.practitionerId = athlete?.practitioner_id;
      }

      socket.data.user = socketUser;
      next();
    } catch (_err) {
      next(new Error('Socket authentication failed.'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userRoom = `user:${user.role}:${user.id}`;
    socket.join(userRoom);

    socket.on('chat:send', async (payload, ack) => {
      try {
        const parsed = messageSendSchema.parse(payload);
        const isAllowed = await assertMessagePeerAccess({
          senderId: user.id,
          senderRole: user.role,
          receiverId: parsed.receiverId,
          receiverRole: parsed.receiverRole,
        });
        if (!isAllowed) {
          if (typeof ack === 'function') {
            ack({ ok: false, message: 'Messaging is not permitted for this peer.' });
          }
          return;
        }

        const message = await persistMessage({
          senderId: user.id,
          senderRole: user.role,
          receiverId: parsed.receiverId,
          receiverRole: parsed.receiverRole,
          body: parsed.body.trim(),
        });

        const receiverRoom = `user:${parsed.receiverRole}:${parsed.receiverId}`;
        io.to(userRoom).to(receiverRoom).emit('chat:new', message);

        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (_err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: 'Message send failed.' });
        }
      }
    });

    socket.on('chat:mark-read', async (payload, ack) => {
      try {
        const schema = z.object({
          peerId: z.string().uuid(),
          peerRole: z.enum(['practitioner', 'athlete', 'admin']),
        });
        const parsed = schema.parse(payload);
        const isAllowed = await assertMessagePeerAccess({
          senderId: user.id,
          senderRole: user.role,
          receiverId: parsed.peerId,
          receiverRole: parsed.peerRole,
        });
        if (!isAllowed) {
          if (typeof ack === 'function') ack({ ok: false });
          return;
        }

        const conversationKey = buildConversationKey(user.role, user.id, parsed.peerRole, parsed.peerId);

        await pool.query(
          `update messages
           set is_read = true,
               read_at = now()
           where conversation_key = $1
             and receiver_id = $2
             and is_read = false`,
          [conversationKey, user.id]
        );

        if (typeof ack === 'function') ack({ ok: true });
      } catch (_err) {
        if (typeof ack === 'function') ack({ ok: false });
      }
    });
  });
}
