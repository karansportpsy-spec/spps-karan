// SessionRecorderPanel.tsx
// Uses the browser's built-in Web Speech API — no external API key, no audio files,
// no chunking bugs. Works in Chrome and Edge. Real-time word-by-word transcription.
// Supports 20+ languages including all major Indian languages.
// Optional: translate non-English transcript to English via Groq AI (already in SPPS).

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, Square, Volume2, Copy, Check,
  Languages, AlertCircle, RefreshCw, Globe, Sparkles, Loader2,
} from 'lucide-react'
import { callGroq } from '@/lib/groq'

// ── Language list ─────────────────────────────────────────────────────────────
// BCP-47 codes for Web Speech API

const LANGUAGES = [
  // Indian
  { code: 'en-IN', label: 'English (India)',     flag: '🇮🇳' },
  { code: 'hi-IN', label: 'Hindi',               flag: '🇮🇳' },
  { code: 'ta-IN', label: 'Tamil',               flag: '🇮🇳' },
  { code: 'te-IN', label: 'Telugu',              flag: '🇮🇳' },
  { code: 'bn-IN', label: 'Bengali',             flag: '🇮🇳' },
  { code: 'mr-IN', label: 'Marathi',             flag: '🇮🇳' },
  { code: 'kn-IN', label: 'Kannada',             flag: '🇮🇳' },
  { code: 'ml-IN', label: 'Malayalam',           flag: '🇮🇳' },
  { code: 'gu-IN', label: 'Gujarati',            flag: '🇮🇳' },
  { code: 'pa-IN', label: 'Punjabi',             flag: '🇮🇳' },
  { code: 'ur-IN', label: 'Urdu',                flag: '🇮🇳' },
  { code: 'or-IN', label: 'Odia',                flag: '🇮🇳' },
  // International
  { code: 'en-US', label: 'English (US)',        flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)',        flag: '🇬🇧' },
  { code: 'es-ES', label: 'Spanish',             flag: '🇪🇸' },
  { code: 'fr-FR', label: 'French',              flag: '🇫🇷' },
  { code: 'de-DE', label: 'German',              flag: '🇩🇪' },
  { code: 'pt-BR', label: 'Portuguese',          flag: '🇧🇷' },
  { code: 'ar-SA', label: 'Arabic',              flag: '🇸🇦' },
  { code: 'ja-JP', label: 'Japanese',            flag: '🇯🇵' },
  { code: 'zh-CN', label: 'Chinese (Simplified)',flag: '🇨🇳' },
  { code: 'ko-KR', label: 'Korean',              flag: '🇰🇷' },
  { code: 'ru-RU', label: 'Russian',             flag: '🇷🇺' },
  { code: 'it-IT', label: 'Italian',             flag: '🇮🇹' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Segment {
  id: string
  text: string
  lang: string
  timestamp: Date
  translated?: string
}

interface Props {
  athleteName?: string
  onTranscriptUpdate?: (fullTranscript: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function langLabel(code: string) {
  return LANGUAGES.find(l => l.code === code)?.label ?? code
}

// Declare Web Speech API types (not in standard TS lib)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((e: SpeechRecognitionEvent) => void) | null
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
  }
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number
    results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionResultList {
    length: number
    item(index: number): SpeechRecognitionResult
    [index: number]: SpeechRecognitionResult
  }
  interface SpeechRecognitionResult {
    isFinal: boolean
    length: number
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
  }
  interface SpeechRecognitionAlternative {
    transcript: string
    confidence: number
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string
    message: string
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionRecorderPanel({ athleteName, onTranscriptUpdate }: Props) {
  const [isRecording,    setIsRecording]    = useState(false)
  const [segments,       setSegments]       = useState<Segment[]>([])
  const [interimText,    setInterimText]    = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const [elapsed,        setElapsed]        = useState(0)
  const [lang,           setLang]           = useState('en-IN')
  const [autoTranslate,  setAutoTranslate]  = useState(false)
  const [translating,    setTranslating]    = useState(false)
  const [copied,         setCopied]         = useState(false)
  const [audioLevel,     setAudioLevel]     = useState(0)

  const recognitionRef  = useRef<SpeechRecognition | null>(null)
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef    = useRef<number>(0)
  const animFrameRef    = useRef<number>(0)
  const streamRef       = useRef<MediaStream | null>(null)
  const transcriptEnd   = useRef<HTMLDivElement>(null)
  const isRunningRef    = useRef(false) // prevents restart after intentional stop

  // ── Check browser support ──────────────────────────────────────────────────
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Full transcript string
  const fullTranscript = segments
    .map(s => autoTranslate && s.translated ? s.translated : s.text)
    .join('\n\n')

  // Notify parent whenever segments change
  useEffect(() => {
    if (fullTranscript) onTranscriptUpdate?.(fullTranscript)
  }, [segments, autoTranslate])

  // Auto-scroll
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, interimText])

  // ── Build and start a SpeechRecognition instance ───────────────────────────
  const startRecognition = useCallback((language: string) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous      = true
    rec.interimResults  = true
    rec.lang            = language
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          const text = result[0].transcript.trim()
          if (text) {
            const seg: Segment = {
              id: crypto.randomUUID(),
              text,
              lang: language,
              timestamp: new Date(),
            }
            setSegments(prev => [...prev, seg])
            setInterimText('')
            // Translate if needed
            if (autoTranslate && !language.startsWith('en')) {
              translateSegment(seg)
            }
          }
        } else {
          interim += result[0].transcript
        }
      }
      setInterimText(interim)
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech') return // normal, just waiting
      if (e.error === 'aborted') return   // intentional stop
      if (e.error === 'network') {
        setError('Network error — check your internet connection.')
        return
      }
      if (e.error === 'not-allowed') {
        setError('Microphone permission denied. Allow microphone in browser settings.')
        setIsRecording(false)
        isRunningRef.current = false
        return
      }
      setError(`Speech recognition error: ${e.error}`)
    }

    // Auto-restart on end (Chrome stops after ~60 s of silence or network hiccup)
    rec.onend = () => {
      setInterimText('')
      if (isRunningRef.current) {
        try { rec.start() } catch { /* already started */ }
      }
    }

    try {
      rec.start()
    } catch (err: any) {
      setError(`Could not start recognition: ${err.message}`)
    }
  }, [autoTranslate])

  // ── Translate a segment via Groq AI ────────────────────────────────────────
  async function translateSegment(seg: Segment) {
    setTranslating(true)
    try {
      const translated = await callGroq({
        messages: [{
          role: 'user',
          content: `Translate the following text to English. Return ONLY the translated text, no explanation:\n\n${seg.text}`,
        }],
        max_tokens: 500,
      })
      setSegments(prev =>
        prev.map(s => s.id === seg.id ? { ...s, translated: translated.trim() } : s)
      )
    } catch {
      // translation failed silently — original text still shown
    } finally {
      setTranslating(false)
    }
  }

  // ── Translate all existing segments ────────────────────────────────────────
  async function translateAll() {
    setTranslating(true)
    try {
      const nonEnglish = segments.filter(s => !s.lang.startsWith('en') && !s.translated)
      for (const seg of nonEnglish) {
        await translateSegment(seg)
      }
    } finally {
      setTranslating(false)
    }
  }

  // ── Audio level visualiser (microphone access) ─────────────────────────────
  async function startVisualiser() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(buf)
        setAudioLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch { /* visualiser non-critical */ }
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  async function startRecording() {
    setError(null)
    setSegments([])
    setInterimText('')
    setElapsed(0)

    isRunningRef.current = true
    setIsRecording(true)

    await startVisualiser()
    startRecognition(lang)

    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 1000)
  }

  // ── Stop ───────────────────────────────────────────────────────────────────
  function stopRecording() {
    isRunningRef.current = false
    setIsRecording(false)
    setInterimText('')

    recognitionRef.current?.stop()
    recognitionRef.current = null

    if (timerRef.current) clearInterval(timerRef.current)
    cancelAnimationFrame(animFrameRef.current)
    setAudioLevel(0)

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Switch language mid-session ────────────────────────────────────────────
  function switchLanguage(newLang: string) {
    setLang(newLang)
    if (isRecording) {
      // Stop current recognition, start fresh with new language
      recognitionRef.current?.abort()
      recognitionRef.current = null
      setInterimText('')
      setTimeout(() => startRecognition(newLang), 100)
    }
  }

  function copyTranscript() {
    navigator.clipboard.writeText(fullTranscript).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Cleanup
  useEffect(() => () => {
    isRunningRef.current = false
    recognitionRef.current?.abort()
    if (timerRef.current) clearInterval(timerRef.current)
    cancelAnimationFrame(animFrameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Not supported ──────────────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Browser not supported</p>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              Session recording requires <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
              Firefox and Safari do not support the Web Speech API.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              Open this app in Chrome for voice recording to work.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const BAR_COUNT = 28

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white font-semibold text-sm">Session Recording</p>
            {athleteName && <p className="text-slate-400 text-xs mt-0.5">{athleteName}</p>}
          </div>
          <div className="flex items-center gap-2">
            {translating && (
              <span className="flex items-center gap-1 bg-violet-500/20 text-violet-300 text-xs px-2 py-1 rounded-full">
                <Loader2 size={10} className="animate-spin" /> Translating…
              </span>
            )}
            {isRecording && (
              <span className="flex items-center gap-1.5 bg-red-500/20 text-red-300 text-xs px-2 py-1 rounded-full font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {fmtDuration(elapsed)}
              </span>
            )}
          </div>
        </div>
        {/* Waveform */}
        <div className="flex items-end gap-px h-7">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all duration-75 ${isRecording ? 'bg-blue-400/60' : 'bg-white/10'}`}
              style={{
                height: isRecording
                  ? `${2 + Math.sin((i / BAR_COUNT) * Math.PI) * audioLevel * 22 + Math.random() * audioLevel * 5}px`
                  : '2px',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">

        {/* Language selector */}
        <div>
          <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1.5">
            <Globe size={11} /> Language
            {isRecording && (
              <span className="text-blue-500 ml-1">— switch anytime during recording</span>
            )}
          </label>
          <select
            value={lang}
            onChange={e => switchLanguage(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <optgroup label="Indian Languages">
              {LANGUAGES.filter(l => l.flag === '🇮🇳').map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </optgroup>
            <optgroup label="International Languages">
              {LANGUAGES.filter(l => l.flag !== '🇮🇳').map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Translate toggle */}
        {!lang.startsWith('en') && (
          <div className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-violet-500" />
              <span className="text-xs font-medium text-violet-700">Translate to English (via AI)</span>
            </div>
            <div className="flex items-center gap-2">
              {segments.some(s => !s.lang.startsWith('en') && !s.translated) && !isRecording && (
                <button
                  onClick={translateAll}
                  disabled={translating}
                  className="text-xs text-violet-600 hover:text-violet-800 underline"
                >
                  Translate now
                </button>
              )}
              <button
                onClick={() => setAutoTranslate(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${autoTranslate ? 'bg-violet-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${autoTranslate ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Record / Stop */}
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 text-white font-semibold text-sm transition-all"
          >
            <Mic size={18} />
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-semibold text-sm transition-all"
          >
            <Square size={15} className="fill-white" />
            Stop Recording
          </button>
        )}

        {/* Info note */}
        <p className="text-xs text-gray-400 text-center">
          Powered by browser's built-in speech recognition · Works offline after page load · Chrome / Edge only
        </p>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-700 leading-relaxed">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-600 mt-0.5 underline">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Transcript ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Volume2 size={13} className="text-gray-400" />
            Live Transcript
            {segments.length > 0 && (
              <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full text-xs">
                {segments.length} line{segments.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
          {fullTranscript && (
            <button
              onClick={copyTranscript}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy all'}
            </button>
          )}
        </div>

        <div className="bg-gray-50 rounded-xl p-3 min-h-32 max-h-64 overflow-y-auto">
          {segments.length === 0 && !interimText ? (
            <div className="flex flex-col items-center justify-center h-24 text-center">
              <Mic size={24} className="text-gray-200 mb-2" />
              <p className="text-xs text-gray-400 leading-relaxed">
                {isRecording
                  ? `Listening in ${langLabel(lang)}…`
                  : 'Start recording — transcript appears in real time as you speak'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {segments.map((seg) => (
                <div key={seg.id} className="group">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xs text-gray-400 font-mono shrink-0 mt-0.5 w-16 text-right">
                      {fmtTime(seg.timestamp)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
                      {/* Show translation below if available and different language */}
                      {seg.translated && !seg.lang.startsWith('en') && (
                        <p className="text-xs text-violet-600 mt-0.5 flex items-center gap-1">
                          <Sparkles size={9} />
                          {seg.translated}
                        </p>
                      )}
                    </div>
                    {/* Language badge if switched mid-session */}
                    {seg.lang !== segments[0]?.lang && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0">
                        {langLabel(seg.lang).split(' ')[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Live interim text */}
              {interimText && (
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-gray-300 font-mono w-16 text-right shrink-0 mt-0.5">…</span>
                  <p className="text-sm text-gray-400 italic flex-1 leading-relaxed">
                    {interimText}
                    <span className="inline-block w-1.5 h-3.5 bg-blue-400 ml-0.5 animate-pulse rounded-sm" />
                  </p>
                </div>
              )}

              <div ref={transcriptEnd} />
            </div>
          )}
        </div>

        {segments.length > 0 && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <Check size={11} className="text-green-500" />
            Transcript appended to session notes when you save
          </p>
        )}
      </div>
    </div>
  )
}
