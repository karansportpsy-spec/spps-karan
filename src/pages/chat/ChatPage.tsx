import { useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Send } from 'lucide-react'

import AppShell from '@/components/layout/AppShell'
import { PageHeader, Card, Button, Spinner, Avatar } from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import { useAuth } from '@/contexts/AuthContext'
import {
  createChatSocket,
  fetchMessageHistory,
  sendMessageRest,
  type ChatMessage,
} from '@/services/chatApi'

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ChatPage() {
  const { user } = useAuth()
  const { data: athletes = [] } = useAthletes()

  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const chatAthletes = useMemo(
    () => athletes.filter((a: any) => Boolean((a as any).portal_user_id) && Boolean((a as any).is_portal_activated)),
    [athletes]
  )
  const selectedAthlete = chatAthletes.find((a) => a.id === selectedAthleteId) || null
  const peerId = (selectedAthlete as any)?.portal_user_id as string | undefined

  useEffect(() => {
    if (!selectedAthleteId && chatAthletes.length > 0) {
      setSelectedAthleteId(chatAthletes[0].id)
    }
  }, [selectedAthleteId, chatAthletes])

  const { data: history = [], isLoading: historyLoading, refetch } = useQuery({
    queryKey: ['chat_history', peerId],
    enabled: Boolean(peerId),
    queryFn: () => fetchMessageHistory(peerId!, 'athlete'),
  })

  useEffect(() => {
    setMessages(history)
  }, [history])

  useEffect(() => {
    if (!user?.id) return
    let closed = false

    createChatSocket(false)
      .then((socket) => {
        if (closed) {
          socket.disconnect()
          return
        }
        socketRef.current = socket
        socket.on('chat:new', (incoming: ChatMessage) => {
          const selectedPeerId = (selectedAthlete as any)?.portal_user_id
          if (!selectedPeerId) return
          const matchPeer = incoming.sender_id === selectedPeerId || incoming.receiver_id === selectedPeerId
          if (!matchPeer) return
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
        })
      })
      .catch((err) => {
        console.error('[SPPS Chat] socket connection failed:', err)
      })

    return () => {
      closed = true
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [user?.id, selectedAthlete])

  useEffect(() => {
    if (!peerId || !socketRef.current) return
    socketRef.current.emit('chat:mark-read', { peerId, peerRole: 'athlete' })
  }, [peerId, messages.length])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!peerId || !text.trim()) return
    setSending(true)
    try {
      const sent = await sendMessageRest({
        receiverId: peerId,
        receiverRole: 'athlete',
        body: text.trim(),
      })
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
      setText('')
      await refetch()
    } catch (err: any) {
      alert(err?.message ?? 'Message send failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Athlete Chat"
        subtitle="Real-time communication with activated athlete portals"
      />

      <div className="grid lg:grid-cols-[280px,1fr] gap-4">
        <Card className="p-3 h-[70vh] overflow-y-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Athletes</p>
          {chatAthletes.length === 0 ? (
            <p className="text-sm text-gray-500">No activated athlete portals available for chat.</p>
          ) : (
            <div className="space-y-1.5">
              {chatAthletes.map((athlete) => (
                <button
                  key={athlete.id}
                  onClick={() => setSelectedAthleteId(athlete.id)}
                  className={`w-full text-left rounded-xl px-3 py-2 border transition-colors ${
                    selectedAthleteId === athlete.id
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar firstName={athlete.first_name} lastName={athlete.last_name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {athlete.first_name} {athlete.last_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{athlete.sport}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-0 h-[70vh] flex flex-col overflow-hidden">
          {selectedAthlete && peerId ? (
            <>
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-900">
                  {selectedAthlete.first_name} {selectedAthlete.last_name}
                </p>
                <p className="text-xs text-gray-500">{selectedAthlete.sport}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {historyLoading ? (
                  <div className="py-10 flex justify-center"><Spinner size="md" /></div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">No messages yet.</div>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_id === user?.id
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-xl ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                          <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={endRef} />
              </div>

              <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="Type a message..."
                />
                <Button onClick={handleSend} loading={sending} disabled={!text.trim()}>
                  <Send size={14} />
                </Button>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
              <MessageSquare size={28} />
              <p className="text-sm">Select an athlete to start chatting.</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  )
}
