import { useState, useCallback } from 'react'
import { Upload, FileText, User, AlertTriangle, CheckCircle, Loader, X, Edit } from 'lucide-react'
import { Button, Modal, Input, Select } from '@/components/ui'
import { useCreateAthlete } from '@/hooks/useAthletes'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const GROQ_KEY = import.meta.env.VITE_GROQ_KEY ?? ''

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (athleteId: string) => void
}

type Step = 'upload' | 'extracting' | 'review' | 'saving' | 'done'

// ── Read any file as text ─────────────────────────────────────

async function readFileAsText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  // Plain text files
  if (['txt', 'md', 'csv', 'json', 'rtf'].includes(ext)) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(`[Could not read ${file.name}]`)
      reader.readAsText(file)
    })
  }

  // DOCX — extract XML text content
  if (ext === 'docx' || ext === 'doc') {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const arr = reader.result as ArrayBuffer
          const uint8 = new Uint8Array(arr)
          let text = ''

          // Try to find and decode XML text from ZIP structure
          const decoder = new TextDecoder('utf-8')
          const raw = decoder.decode(uint8)

          // Extract text between w:t tags (Word XML)
          const matches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) ?? []
          text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim()

          // If that fails, try finding any readable text (printable ASCII/UTF sequences)
          if (text.length < 50) {
            const readable = raw.replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/ {10,}/g, '\n')
              .trim()
            text = readable.slice(0, 8000)
          }

          resolve(text.slice(0, 8000) || `[Document: ${file.name} — could not extract readable text. File size: ${(file.size/1024).toFixed(0)}KB]`)
        } catch {
          resolve(`[Document: ${file.name}]`)
        }
      }
      reader.onerror = () => resolve(`[Could not read ${file.name}]`)
      reader.readAsArrayBuffer(file)
    })
  }

  // PDF — extract what we can
  if (ext === 'pdf') {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const arr = reader.result as ArrayBuffer
          const uint8 = new Uint8Array(arr)
          const decoder = new TextDecoder('latin1')
          const raw = decoder.decode(uint8)
          // Extract text streams from PDF
          const streams = raw.match(/BT[\s\S]*?ET/g) ?? []
          const texts = streams.map(s =>
            s.replace(/\(([^)]+)\)\s*Tj/g, '$1 ')
             .replace(/[^\x20-\x7E\n]/g, ' ')
             .replace(/\s+/g, ' ')
             .trim()
          ).filter(t => t.length > 3)
          const result = texts.join(' ').slice(0, 6000)
          resolve(result || `[PDF: ${file.name} — binary content, ${(file.size/1024).toFixed(0)}KB]`)
        } catch {
          resolve(`[PDF: ${file.name}]`)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // Images — describe by filename
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return `[Image file: ${file.name}. Please extract any athlete information visible in this image if possible.]`
  }

  // Fallback
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).slice(0, 6000))
    reader.onerror = () => resolve(`[File: ${file.name}]`)
    reader.readAsText(file)
  })
}

// ── AI extraction ─────────────────────────────────────────────

async function extractWithAI(text: string, fileName: string): Promise<any> {
  const isTeamReport = text.length > 2000 && (text.match(/Athlete:/gi) ?? []).length > 2

  const prompt = `You are a sport psychology data extraction expert for the WinMindPerform SPPS platform.

CRITICAL RULES — MUST FOLLOW:
1. NEVER say "no information found" or "document does not contain extractable data". There is ALWAYS content to extract.
2. The document may be in ANY format. Your job is to READ and RE-FORMAT — not to check if it matches a template.
3. ALWAYS populate session_note with a full clinical narrative using everything you find in the document.
4. ALWAYS set confidence 75+ if the document has any athlete or clinical content at all.
5. If only partial data is available, extract what exists and set remaining fields to null.
${isTeamReport ? '6. TEAM REPORT DETECTED: This covers multiple athletes. Extract data for the FIRST or most prominent athlete only.' : ''}

Documents you will receive (all formats, no exceptions):
- Psychological case reports: demographics, case description, presenting concerns, cognitive/affective/behavioural schemas, test results
- Assessment scores: CSAI-2, POMS, OCEAN/Big-5, Young Schema Questionnaire, ACQ, RCQQ, SAS, 5Cs, OMSAT, TRPS, MFAS, SCES, PSAS, CFAS
- Senaptec sensory reports, PST session logs, referral letters, coach notes, physio reports
- Excel/tabular data, training logs, performance spreadsheets
- Informal notes, partial records — extract whatever exists

Document: ${fileName}
Content:
---
${text.slice(0, 7000)}
---

Return ONLY a valid JSON object (no markdown, no explanation, no backticks):
{
  "first_name": "first name extracted from document, or null if not present",
  "last_name": "last name extracted from document, or null if not present",
  "full_name_raw": "full name or code as written in document, or null",
  "age": number if stated or calculable, or null,
  "date_of_birth": "YYYY-MM-DD if stated, or null",
  "gender": "M or F or Other — infer from pronouns if not stated explicitly",
  "sport": "sport and/or event extracted from document",
  "event_position": "specific event, discipline, or playing position",
  "team": "team, club, academy, or organisation name",
  "email": "email if present in document, or null",
  "phone": "phone if present, or null",
  "coach": "coach name if mentioned, or null",
  "risk_level": "high or critical if any of: serious injury, severe anxiety/depression, crisis, trauma. moderate if: competition anxiety, confidence issues, interpersonal conflict. low if: general performance enhancement with no clinical concerns",
  "presenting_concerns": "concrete summary of psychological and performance concerns in ≤200 chars, using specific language from the document",
  "goals": ["specific psychological and performance goals or intervention targets mentioned — list each separately"],
  "achievements": "medals, personal bests, competition results, or performance strengths mentioned",
  "notes": "assessment scores, schema profiles, test results, and key clinical findings in ≤300 chars",
  "session_note": "Write 3 paragraphs: (1) Athlete profile and presenting concerns with specific details from the document. (2) Assessment findings and psychological profile — include ALL scores, schema names, test results found. (3) Intervention plan, recommendations, and clinical priorities. Use professional clinical language. Include every specific detail from the document.",
  "confidence": number 75-95 (use 75 if minimal data, 85 if moderate data with some scores, 95 if comprehensive case data),
  "extraction_notes": "list the specific data types that were found, e.g. 'demographics, CSAI-2 scores, schema profile, intervention plan'"
}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2500,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`AI service error: ${res.status}`)
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  const clean = raw.replace(/```json\n?|```/g, '').trim()

  try {
    return JSON.parse(clean)
  } catch {
    // If JSON parse fails, try to extract key values manually
    return {
      first_name: null, last_name: null, sport: null, risk_level: 'low',
      confidence: 10, extraction_notes: 'Could not parse AI response',
    }
  }
}

// ── Component ─────────────────────────────────────────────────

export default function AthleteImportModal({ open, onClose, onSuccess }: Props) {
  const { user } = useAuth()
  const createAthlete = useCreateAthlete()

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [extracted, setExtracted] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [includeSessionNote, setIncludeSessionNote] = useState(true)
  const [createdId, setCreatedId] = useState('')

  // Editable form
  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '', sport: '', team: '',
    position: '', email: '', phone: '', risk_level: 'low', status: 'active', notes: '',
  })

  function reset() {
    setStep('upload'); setFile(null); setExtracted(null)
    setError(null); setStatus(''); setCreatedId('')
    setForm({ first_name: '', last_name: '', date_of_birth: '', sport: '', team: '', position: '', email: '', phone: '', risk_level: 'low', status: 'active', notes: '' })
  }

  function handleClose() { reset(); onClose() }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  function setField(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleExtract() {
    if (!file) return
    setStep('extracting'); setError(null)
    try {
      setStatus('Reading file…')
      const text = await readFileAsText(file)

      setStatus('Extracting with AI…')
      const result = await extractWithAI(text, file.name)
      setExtracted(result)

      // Parse name
      let firstName = result.first_name ?? ''
      let lastName = result.last_name ?? ''
      if (!firstName && result.full_name_raw) {
        const parts = result.full_name_raw.trim().split(/\s+/)
        firstName = parts[0] ?? ''
        lastName = parts.slice(1).join(' ')
      }

      // Parse DOB from age if needed
      let dob = result.date_of_birth ?? ''
      if (!dob && result.age) {
        const year = new Date().getFullYear() - result.age
        dob = `${year}-01-01`
      }

      setForm({
        first_name: firstName || '',
        last_name: lastName || '',
        date_of_birth: dob,
        sport: result.sport ?? '',
        team: result.team ?? '',
        position: result.event_position ?? '',
        email: result.email ?? '',
        phone: result.phone ?? '',
        risk_level: result.risk_level ?? 'low',
        status: 'active',
        notes: [result.presenting_concerns, result.notes].filter(Boolean).join('\n\n').slice(0, 500),
      })
      setStep('review')
    } catch (err: any) {
      setError(err.message ?? 'Extraction failed. Please fill in the form manually.')
      // Still go to review with blank form so user can fill manually
      setStep('review')
    } finally {
      setStatus('')
    }
  }

  async function handleSave() {
    setStep('saving'); setError(null)
    try {
      const athlete = await createAthlete.mutateAsync(form as any)

      // Create session note if available
      if (includeSessionNote && extracted?.session_note && athlete?.id && user) {
        await supabase.from('sessions').insert({
          practitioner_id: user.id,
          athlete_id: athlete.id,
          session_type: 'individual',
          status: 'completed',
          scheduled_at: new Date().toISOString(),
          duration_minutes: 60,
          notes: extracted.session_note,
          follow_up_required: true,
        })
      }

      setCreatedId(athlete?.id ?? '')
      setStep('done')
      setTimeout(() => { onSuccess(athlete?.id ?? ''); handleClose() }, 1800)
    } catch (err: any) {
      setError(err.message ?? 'Could not save athlete')
      setStep('review')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Athlete from Document" maxWidth="max-w-2xl">

      {/* ── Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload any document — case file, referral letter, assessment report, session notes, CSV, or plain text.
            AI will extract what it can and let you review and edit before saving.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
          >
            <Upload size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-700 mb-1">Drop any file here</p>
            <p className="text-xs text-gray-400 mb-4">PDF · DOCX · TXT · CSV · JPG — any format works</p>
            <label className="cursor-pointer">
              <span className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                Choose File
              </span>
              <input type="file" accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.jpg,.jpeg,.png"
                className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <FileText size={20} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 truncate">{file.name}</p>
                <p className="text-xs text-blue-400">{(file.size/1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => setFile(null)} className="text-blue-300 hover:text-blue-600"><X size={16} /></button>
            </div>
          )}

          <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 leading-relaxed">
            🔒 File content is processed by AI temporarily and not stored. Only the extracted structured data is saved.
            <br />ℹ️ If extraction is imperfect, you can always edit the profile manually after saving.
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleClose}>Cancel</Button>
            <Button className="flex-1" disabled={!file} onClick={handleExtract}>
              Extract with AI →
            </Button>
          </div>
        </div>
      )}

      {/* ── Extracting ── */}
      {step === 'extracting' && (
        <div className="py-16 text-center">
          <Loader size={44} className="mx-auto text-blue-500 animate-spin mb-4" />
          <p className="font-semibold text-gray-900 mb-1">Analysing document…</p>
          <p className="text-sm text-gray-400">{status}</p>
        </div>
      )}

      {/* ── Review / Edit ── */}
      {step === 'review' && (
        <div className="space-y-4">
          {extracted && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
              extracted.confidence >= 60 ? 'bg-green-50 text-green-700' :
              extracted.confidence >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}>
              <Edit size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{extracted.confidence >= 60 ? 'Good extraction' : extracted.confidence >= 30 ? 'Partial extraction' : 'Low extraction'} — {extracted.confidence ?? 0}% confidence</p>
                <p className="text-xs mt-0.5">{extracted.extraction_notes ?? 'Review all fields before saving. You can edit anything.'}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl text-amber-700 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">AI extraction had issues — please fill in manually</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
            ✏️ Review and complete the profile below. All fields are editable — the AI may have missed some details, especially if the document format was unusual.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name *" value={form.first_name} onChange={e => setField('first_name', e.target.value)} placeholder="First name" />
            <Input label="Last Name" value={form.last_name} onChange={e => setField('last_name', e.target.value)} placeholder="Last name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={e => setField('date_of_birth', e.target.value)} />
            <Input label="Sport *" value={form.sport} onChange={e => setField('sport', e.target.value)} placeholder="e.g. Athletics" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Team / Organisation" value={form.team} onChange={e => setField('team', e.target.value)} />
            <Input label="Position / Event" value={form.position} onChange={e => setField('position', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" value={form.email} onChange={e => setField('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={e => setField('phone', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Risk Level" value={form.risk_level} onChange={e => setField('risk_level', e.target.value)}
              options={[{ value: 'low', label: 'Low' }, { value: 'moderate', label: 'Moderate' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]} />
            <Select label="Status" value={form.status} onChange={e => setField('status', e.target.value)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'on_hold', label: 'On Hold' }]} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Clinical Notes</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={3}
              placeholder="Presenting concerns, referral reason, relevant history…"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {extracted?.session_note && (
            <label className="flex items-start gap-2 cursor-pointer p-3 bg-blue-50 rounded-xl border border-blue-100">
              <input type="checkbox" checked={includeSessionNote} onChange={e => setIncludeSessionNote(e.target.checked)} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Create initial session note from document</p>
                <p className="text-xs text-blue-500 mt-0.5 line-clamp-2">{extracted.session_note.slice(0, 120)}…</p>
              </div>
            </label>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>← Back</Button>
            <Button className="flex-1" onClick={handleSave}
              disabled={!form.first_name && !form.sport}>
              <User size={16} /> Save Athlete Profile
            </Button>
          </div>
        </div>
      )}

      {/* ── Saving ── */}
      {step === 'saving' && (
        <div className="py-16 text-center">
          <Loader size={44} className="mx-auto text-blue-500 animate-spin mb-4" />
          <p className="font-semibold text-gray-900">Saving athlete profile…</p>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="py-16 text-center">
          <CheckCircle size={52} className="mx-auto text-green-500 mb-4" />
          <p className="font-bold text-gray-900 text-xl">Athlete profile created!</p>
          <p className="text-sm text-gray-400 mt-2">
            {form.first_name} {form.last_name} has been added.
            {extracted?.session_note && includeSessionNote ? ' Initial session note saved.' : ''}
          </p>
          <p className="text-xs text-gray-300 mt-1">You can add more details from the athlete profile page.</p>
        </div>
      )}
    </Modal>
  )
}
