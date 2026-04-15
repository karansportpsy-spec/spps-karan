import { io, Socket } from 'socket.io-client';

import { API_BASE_URL, apiJson, getAuthToken } from '@/lib/apiClient';

export type ChatMessage = {
  id: string;
  conversation_key: string;
  sender_id: string;
  sender_role: 'practitioner' | 'athlete' | 'admin';
  receiver_id: string;
  receiver_role: 'practitioner' | 'athlete' | 'admin';
  body: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
};

export async function fetchMessageHistory(peerId: string, peerRole: string, preferAthleteToken = false) {
  return apiJson<ChatMessage[]>(
    `/api/messages/history?peerId=${encodeURIComponent(peerId)}&peerRole=${encodeURIComponent(peerRole)}`,
    { preferAthleteToken }
  );
}

export async function sendMessageRest(
  payload: { receiverId: string; receiverRole: 'practitioner' | 'athlete' | 'admin'; body: string },
  preferAthleteToken = false
) {
  return apiJson<ChatMessage>('/api/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
    preferAthleteToken,
  });
}

export async function createChatSocket(preferAthleteToken = false): Promise<Socket> {
  const token = await getAuthToken(preferAthleteToken);
  if (!token) {
    throw new Error('Missing auth token for chat socket.');
  }

  return io(API_BASE_URL, {
    transports: ['websocket'],
    auth: { token },
  });
}
