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

// ── Audio transcription via Groq Whisper ──────────────────────────────────────

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

export interface TranscribeOptions {
  file: File
  language?: string        // ISO 639-1 code (e.g. 'en', 'hi', 'ta')
  prompt?: string          // Optional context to guide transcription
}

export async function transcribeAudio(opts: TranscribeOptions): Promise<string> {
  if (!GROQ_KEY) {
    throw new Error('Audio transcription requires VITE_GROQ_API_KEY in your environment variables.')
  }

  if (opts.file.size > 25 * 1024 * 1024) {
    throw new Error('Audio file must be under 25 MB. Please trim or compress the recording.')
  }

  const formData = new FormData()
  formData.append('file', opts.file)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('response_format', 'verbose_json')
  if (opts.language) formData.append('language', opts.language)
  if (opts.prompt) formData.append('prompt', opts.prompt)

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Transcription failed (${response.status})`)
  }

  const data = await response.json()
  return data.text ?? ''
}
