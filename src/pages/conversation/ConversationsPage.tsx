// src/pages/conversations/ConversationsPage.tsx
// Practitioner-side: view all athlete conversations, read and reply to messages

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, ChevronLeft, Loader2, Users, Search } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Avatar, Spinner, EmptyState } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/utils'

interface Conversation {
  id: string; practitioner_id: string; athlete_id: string; status: string
  practitioner_unread: number; athlete_unread: number
  last_message_at?: string; last_message_preview?: string; created_at: string
  athlete?: { first_name: string; last_name: string; sport: string }
}

interface Message {
  id: string; conversation_id: string; sender_id: string; sender_role: string
  content: string; content_type: string; is_read: boolean; is_ai_generated: boolean
  created_at: string
}

function useConversations() {
  const { user } = useAuth()
  return useQuery<Conversation[]>({
    queryKey: ['practitioner_conversations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, athlete:athletes(first_name,last_name,sport)')
        .eq('practitioner_id', user!.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Conversation[]
    },
  })
}

function useMessages(conversationId?: string) {
  return useQuery<Message[]>({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    staleTime: 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from('messages').select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true }).limit(200)
      return (data ?? []) as Message[]
    },
  })
}

function MessageBubble({ msg, practitionerId }: { msg: Message; practitionerId: string }) {
  const isOwn = msg.sender_id === practitionerId
  const isBot = msg.sender_role === 'ai_bot'

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isOwn && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-1 text-xs font-bold ${
          isBot ? 'bg-purple-100 text-purple-600' : 'bg-green-600 text-white'
        }`}>
          {isBot ? '🤖' : 'A'}
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isOwn
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : isBot
            ? 'bg-purple-50 border border-purple-100 text-gray-800 rounded-tl-sm'
            : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-sm'
      }`}>
        {isBot && <p className="text-xs font-semibold text-purple-500 mb-1">AI Assistant</p>}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function ChatPanel({ conversation, practitionerId }: { conversation: Conversation; practitionerId: string }) {
  const { data: messages = [], refetch } = useMessages(conversation.id)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark as read
  useEffect(() => {
    if (conversation.practitioner_unread > 0) {
      supabase.from('conversations').update({ practitioner_unread: 0 }).eq('id', conversation.id)
        .then(() => qc.invalidateQueries({ queryKey: ['practitioner_conversations'] }))
    }
  }, [conversation.id, conversation.practitioner_unread, qc])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        () => refetch()
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversation.id, refetch])

  async function handleSend() {
    if (!text.trim()) return
    setSending(true)
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: practitionerId,
      sender_role: 'practitioner',
      content: text.trim(),
      content_type: 'text',
    })
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.trim().slice(0, 100),
      athlete_unread: (conversation.athlete_unread ?? 0) + 1,
      practitioner_unread: 0,
    }).eq('id', conversation.id)
    setText('')
    setSending(false)
    refetch()
    qc.invalidateQueries({ queryKey: ['practitioner_conversations'] })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare size={32} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} practitionerId={practitionerId} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Reply to athlete…"
            rows={1}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ maxHeight: '100px' }} />
          <button onClick={handleSend} disabled={!text.trim() || sending}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors shrink-0">
            {sending ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConversationsPage() {
  const { user } = useAuth()
  const { data: conversations = [], isLoading } = useConversations()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const selected = conversations.find(c => c.id === selectedId) ?? null

  const filtered = conversations.filter(c => {
    if (!search) return true
    const name = `${c.athlete?.first_name} ${c.athlete?.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-6rem)] -m-6 bg-white rounded-xl overflow-hidden border border-gray-100">
        {/* Sidebar - conversation list */}
        <div className={`w-80 border-r border-gray-100 flex flex-col shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 mb-2">Athlete Messages</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No conversations yet</p>
                <p className="text-xs text-gray-300 mt-1">Athletes with portal access can message you</p>
              </div>
            ) : (
              filtered.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                    selectedId === c.id ? 'bg-blue-50' : ''
                  }`}>
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {c.athlete?.first_name?.[0]}{c.athlete?.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${c.practitioner_unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {c.athlete?.first_name} {c.athlete?.last_name}
                      </p>
                      {c.last_message_at && (
                        <span className="text-xs text-gray-400 shrink-0 ml-2">
                          {new Date(c.last_message_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 truncate">{c.last_message_preview ?? 'No messages'}</p>
                      {c.practitioner_unread > 0 && (
                        <span className="w-5 h-5 bg-blue-500 rounded-full text-xs font-bold text-white flex items-center justify-center shrink-0 ml-2">
                          {c.practitioner_unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className={`flex-1 flex flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
                <button onClick={() => setSelectedId(null)} className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600">
                  <ChevronLeft size={20} />
                </button>
                <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {selected.athlete?.first_name?.[0]}{selected.athlete?.last_name?.[0]}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selected.athlete?.first_name} {selected.athlete?.last_name}</p>
                  <p className="text-xs text-gray-400">{selected.athlete?.sport}</p>
                </div>
              </div>

              <ChatPanel conversation={selected} practitionerId={user!.id} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <MessageSquare size={48} className="text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">Select a conversation</p>
              <p className="text-sm text-gray-400 mt-1">Choose an athlete from the list to view messages</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
