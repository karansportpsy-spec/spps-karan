// Groq API helper — Llama 3.3 via Groq Cloud
// Supports both VITE_GROQ_API_KEY and VITE_GROQ_KEY env var names

const GROQ_KEY =
  import.meta.env.VITE_GROQ_API_KEY ??   // FIX: check both names
  import.meta.env.VITE_GROQ_KEY ??
  ''

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface GroqMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GroqOptions {
  system?: string
  messages: GroqMessage[]
  max_tokens?: number
}

export async function callGroq(opts: GroqOptions): Promise<string> {
  if (!GROQ_KEY) {
    return 'AI features require VITE_GROQ_API_KEY in your environment variables.'
  }

  const messages: { role: string; content: string }[] = []

  if (opts.system) {
    messages.push({ role: 'system', content: opts.system })
  }

  messages.push(...opts.messages)

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: opts.max_tokens ?? 1000,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Groq API error ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}
