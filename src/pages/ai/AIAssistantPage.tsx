import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { callGroq, type GroqMessage } from '@/lib/groq'

const QUICK_PROMPTS = [
  'Summarise evidence-based relaxation techniques for pre-competition anxiety',
  'Generate a SMART goal-setting framework for an athlete returning from injury',
  'What are the key components of a crisis intervention protocol in sport psychology?',
  'Explain cognitive restructuring techniques for performance slumps',
]

export default function AIAssistantPage() {
  const { practitioner } = useAuth()
  const [messages, setMessages] = useState<GroqMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setApiError('')
    const userMsg: GroqMessage = { role: 'user', content: text.trim() }
    const newMessages: GroqMessage[] = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const reply = await callGroq({
        system: `You are an expert sport psychology clinical assistant supporting ${practitioner?.first_name ?? 'the practitioner'}. Provide evidence-based, clinically appropriate guidance. Be concise and practical. Format responses clearly with markdown where helpful.`,
        messages: newMessages,
      })
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setApiError(msg)
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="AI Assistant"
        subtitle="Evidence-based clinical guidance powered by Groq AI (Llama 3.3)"
      />

      {apiError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-220px)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-spps flex items-center justify-center">
                <Bot size={28} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Clinical AI Assistant</p>
                <p className="text-sm text-gray-500 max-w-sm mt-1">
                  Ask anything about sport psychology practice, interventions,
                  assessment interpretation, or clinical documentation.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {QUICK_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-left text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3 transition-colors"
                  >
                    <Sparkles size={12} className="inline mr-1 text-blue-500" />
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.role === 'assistant' ? 'bg-gradient-spps' : 'bg-gray-200'}`}>
                {m.role === 'assistant'
                  ? <Bot size={16} className="text-white" />
                  : <User size={16} className="text-gray-600" />
                }
              </div>
              <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${m.role === 'assistant' ? 'bg-white border border-gray-100 text-gray-800' : 'bg-gradient-spps text-white'}`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-spps flex items-center justify-center shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Spinner size="sm" />
                <span className="text-xs text-gray-400">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 pt-3 border-t border-gray-100">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Ask about interventions, assessments, clinical protocols…"
            className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="px-4"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
