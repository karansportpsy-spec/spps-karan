// src/pages/athlete/AthleteMessagesPage.tsx
// Real-time messaging + AI assistant chat for athletes

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, Bot, ChevronLeft, AlertTriangle, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAthlete } from '@/contexts/AthleteContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { callGroq } from '@/lib/groq'

// ── Escalation detection ───────────────────────────────────────────────────────
const ESCALATION_PATTERNS = [
  /hurt\s*(my)?self/i, /self.harm/i, /suicid/i, /kill\s*(my)?self/i,
  /can'?t\s*cope/i, /want\s*to\s*die/i, /no\s*point/i,
  /urgently\s*(need|want)/i, /crisis/i, /emergency/i,
]
function requiresEscalation(text: string): boolean {
  return ESCALATION_PATTERNS.some(p => p.test(text))
}

const ESCALATION_RESPONSE = `I can hear that you're going through something really difficult right now, and I'm glad you reached out. 

This is beyond what I can support safely — I'm connecting you with your practitioner right now. They will be notified immediately.

**If you're in immediate danger, please call emergency services (112) or a crisis helpline:**
- iCall: 9152987821
- Vandrevala Foundation: 1860-2662-345 (24/7)

Please stay safe. Your practitioner has been notified.`

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(100)
      return data ?? []
    },
  })
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isAthlete }: { msg: any; isAthlete: boolean }) {
  const isOwn = msg.sender_role === (isAthlete ? 'athlete' : 'practitioner')
  const isBot = msg.sender_role === 'ai_bot'

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isOwn && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-1 text-xs font-bold ${
          isBot ? 'bg-purple-100 text-purple-600' : 'bg-blue-600 text-white'
        }`}>
          {isBot ? '🤖' : 'Dr'}
        </div>
      )}
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
        isOwn
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : isBot
            ? 'bg-purple-50 border border-purple-100 text-gray-800 rounded-tl-sm'
            : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-sm'
      }`}>
        {isBot && !isOwn && (
          <p className="text-xs font-semibold text-purple-600 mb-1">AI Assistant</p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ── Human Chat ────────────────────────────────────────────────────────────────

function HumanChat() {
  const { conversation, sendMessage, athleteProfile } = useAthlete()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { data: messages = [], refetch } = useMessages(conversation?.id)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!text.trim() || !conversation?.id) return
    setSending(true)
    await sendMessage(conversation.id, text.trim())
    setText('')
    setSending(false)
    refetch()
  }

  async function ensureConversation() {
    if (conversation) return conversation.id
    if (!athleteProfile) return null
    // Create conversation if doesn't exist
    const { data } = await supabase.from('conversations').upsert({
      practitioner_id: athleteProfile.practitioner_id,
      athlete_id: athleteProfile.athlete_id,
    }, { onConflict: 'practitioner_id,athlete_id' }).select().single()
    return data?.id
  }

  async function handleSendWithConversation() {
    if (!text.trim()) return
    setSending(true)
    const convId = await ensureConversation()
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: user!.id,
        sender_role: 'athlete',
        content: text.trim(),
        content_type: 'text',
      })
      setText('')
    }
    setSending(false)
    refetch()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
              <Send size={24} className="text-blue-400" />
            </div>
            <p className="font-semibold text-gray-700">Start a conversation</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">Send a message to your practitioner. They usually respond within a day.</p>
          </div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble key={msg.id} msg={msg} isAthlete={true} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWithConversation() }}}
            placeholder="Message your practitioner…"
            rows={1}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ maxHeight: '100px' }} />
          <button onClick={handleSendWithConversation} disabled={!text.trim() || sending}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors shrink-0">
            {sending ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

function AIChat() {
  const { athleteProfile, athleteRecord } = useAthlete()
  const { user } = useAuth()
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const QUICK_PROMPTS = [
    "I'm feeling anxious before competition",
    "Help me with a breathing technique",
    "I'm struggling with my confidence",
    "I need to talk to my practitioner",
  ]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(userText: string) {
    if (!userText.trim() || sending) return
    setSending(true)
    setInput('')

    const userMsg = { role: 'user' as const, content: userText }
    setMessages(prev => [...prev, userMsg])

    // Check for escalation
    if (requiresEscalation(userText)) {
      setEscalated(true)
      // Save escalation to DB
      if (athleteProfile) {
        await supabase.from('ai_chat_sessions').insert({
          athlete_id: athleteProfile.athlete_id,
          messages: [...messages, userMsg],
          escalated: true,
          escalation_reason: userText.slice(0, 200),
          escalated_at: new Date().toISOString(),
        })
        // Notify practitioner
        await supabase.from('athlete_notifications').insert({
          athlete_id: athleteProfile.athlete_id,
          type: 'progress_comment',
          title: '⚠️ Athlete needs urgent support',
          body: `Your athlete has indicated they may be in distress. Please check in immediately.`,
        }).then(() => {})
      }
      setMessages(prev => [...prev, { role: 'assistant', content: ESCALATION_RESPONSE }])
      setSending(false)
      return
    }

    // Build context
    const athleteName = athleteRecord ? athleteRecord.first_name : 'the athlete'
    const systemPrompt = `You are a supportive AI assistant for a sport psychology app (SPPS by WinMindPerform).

You are talking to ${athleteName}, an athlete.

GUIDELINES:
- Provide evidence-based mental performance support, not clinical diagnosis
- Be warm, practical, and concise (2-4 sentences max per response)  
- For anxiety: offer brief evidence-based techniques (box breathing, grounding, imagery)
- For performance issues: focus on process, not outcome
- Never diagnose, prescribe, or replace clinical care
- If they ask to speak to their practitioner, encourage it and say you'll pass it along
- Reference sport psychology principles: confidence, focus, arousal regulation, imagery

ESCALATION: If the user expresses crisis, suicidal thoughts, or self-harm, respond with concern and tell them to contact their practitioner immediately.`

    try {
      const response = await callGroq({
        system: systemPrompt,
        messages: [...messages, userMsg],
        max_tokens: 300,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment, or message your practitioner directly."
      }])
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Escalation banner */}
      {escalated && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            <strong>Your practitioner has been notified.</strong> Please reach out to them directly or call a crisis helpline.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-3 text-2xl">🤖</div>
            <p className="font-semibold text-gray-700 mb-1">AI Mental Performance Assistant</p>
            <p className="text-sm text-gray-400 text-center max-w-xs mb-6">
              I'm here to support your mental performance. I use evidence-based sport psychology — but I'm not a replacement for your practitioner.
            </p>
            <div className="w-full space-y-2">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)}
                  className="w-full text-left text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-2.5 rounded-xl transition-colors border border-purple-100">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mr-2 mt-1 text-sm">🤖</div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-purple-50 border border-purple-100 text-gray-800 rounded-tl-sm'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start mb-3">
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mr-2 mt-1 text-sm">🤖</div>
                <div className="bg-purple-50 border border-purple-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }}}
            placeholder="Ask your AI assistant…"
            rows={1}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
            style={{ maxHeight: '100px' }} />
          <button onClick={() => send(input)} disabled={!input.trim() || sending}
            className="w-10 h-10 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors shrink-0">
            {sending ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AthleteMessagesPage() {
  const [activeTab, setActiveTab] = useState<'practitioner' | 'ai'>('practitioner')

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-bold text-gray-900">Messages</h1>
      </div>

      {/* Tab switcher */}
      <div className="bg-white border-b border-gray-100 px-4 shrink-0">
        <div className="flex">
          {[
            { id: 'practitioner', label: '👨‍⚕️ Practitioner' },
            { id: 'ai', label: '🤖 AI Assistant' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'practitioner' ? <HumanChat /> : <AIChat />}
      </div>
    </div>
  )
}
