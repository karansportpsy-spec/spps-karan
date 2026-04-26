import { supabase } from '@/lib/supabase';
import { apiJson } from '@/lib/apiClient';

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

export async function markMessagesRead(
  peerId: string,
  peerRole: string,
  preferAthleteToken = false
) {
  return apiJson<{ updated: number }>('/api/messages/mark-read', {
    method: 'POST',
    body: JSON.stringify({ peerId, peerRole }),
    preferAthleteToken,
  });
}

export function subscribeToChatMessages(
  myUserId: string,
  peerId: string,
  onMessage: (msg: ChatMessage) => void
): () => void {
  const channelName = `chat:${[myUserId, peerId].sort().join(':')}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${myUserId}`,
      },
      ({ new: msg }) => {
        const incoming = msg as ChatMessage;
        if (incoming.sender_id === peerId || incoming.receiver_id === peerId) {
          onMessage(incoming);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.debug('[SPPS Chat] Realtime channel subscribed:', channelName);
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('[SPPS Chat] Realtime channel error:', channelName);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
