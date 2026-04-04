// src/components/AthleteDocumentsPanel.tsx
// Upload any document against an athlete → AI analyses it → findings stored
// and fed into Case Formulation AI Summary + PDF export.

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FileText, Brain, AlertTriangle, CheckCircle, Loader2,
  Trash2, ChevronDown, ChevronUp, Tag, Sparkles, X, Edit3, Save,
  FilePlus, Eye, Download, RefreshCw, DownloadCloud,
} from 'lucide-react'
import { Button, Spinner, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { callGroq } from '@/lib/groq'
import { fmtDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AthleteDocument {
  id: string
  practitioner_id: string
  athlete_id: string
  file_name: string
  file_type: string
  file_size_kb?: number
  storage_path?: string
  document_category: DocumentCategory
  extracted_text?: string
  ai_summary?: string
  ai_key_findings: string[]
  ai_flags: string[]
  ai_recommendations?: string
  ai_confidence: number
  practitioner_notes?: string
  uploaded_at: string
  analysed_at?: string
}

export type DocumentCategory =
  | 'medical_report'
  | 'psychological_assessment'
  | 'physiotherapy_report'
  | 'coach_report'
  | 'performance_data'
  | 'competition_results'
  | 'training_log'
  | 'referral_letter'
  | 'consent_form'
  | 'correspondence'
  | 'session_notes'
  | 'nutrition_report'
  | 'injury_report'
  | 'other'

const CATEGORY_META: Record<DocumentCategory, { label: string; color: string; icon: string }> = {
  medical_report:           { label: 'Medical Report',           color: 'bg-red-100 text-red-700',     icon: '🏥' },
  psychological_assessment: { label: 'Psych Assessment',         color: 'bg-purple-100 text-purple-700', icon: '🧠' },
  physiotherapy_report:     { label: 'Physio Report',            color: 'bg-teal-100 text-teal-700',   icon: '💪' },
  coach_report:             { label: 'Coach Report',             color: 'bg-blue-100 text-blue-700',   icon: '📋' },
  performance_data:         { label: 'Performance Data',         color: 'bg-amber-100 text-amber-700', icon: '📊' },
  competition_results:      { label: 'Competition Results',      color: 'bg-yellow-100 text-yellow-700', icon: '🏆' },
  training_log:             { label: 'Training Log',             color: 'bg-green-100 text-green-700', icon: '🏃' },
  referral_letter:          { label: 'Referral Letter',          color: 'bg-indigo-100 text-indigo-700', icon: '📨' },
  consent_form:             { label: 'Consent Form',             color: 'bg-gray-100 text-gray-600',   icon: '✍️' },
  correspondence:           { label: 'Correspondence',           color: 'bg-cyan-100 text-cyan-700',   icon: '📧' },
  session_notes:            { label: 'Session Notes',            color: 'bg-violet-100 text-violet-700', icon: '📝' },
  nutrition_report:         { label: 'Nutrition Report',         color: 'bg-lime-100 text-lime-700',   icon: '🥗' },
  injury_report:            { label: 'Injury Report',            color: 'bg-orange-100 text-orange-700', icon: '🩹' },
  other:                    { label: 'Other',                    color: 'bg-gray-100 text-gray-500',   icon: '📁' },
}

const CATEGORIES = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as DocumentCategory,
  label: meta.label,
}))

// ── Text extraction ───────────────────────────────────────────────────────────

// ── Native ZIP + DecompressionStream DOCX extractor (no npm needed) ──────────
// Browsers support DecompressionStream('deflate-raw') from Chrome 80+, Firefox 113+, Safari 16.4+

async function extractDocxXml(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer)
  const dec = new TextDecoder('utf-8', { fatal: false })

  // Scan for the word/document.xml local file entry in the ZIP binary
  // PKZIP local file header signature: 50 4B 03 04
  let i = 0
  while (i < bytes.length - 30) {
    if (bytes[i] !== 0x50 || bytes[i+1] !== 0x4B || bytes[i+2] !== 0x03 || bytes[i+3] !== 0x04) {
      i++
      continue
    }
    const method        = bytes[i+8]  | (bytes[i+9]  << 8)
    const compSize      = bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24)
    const fileNameLen   = bytes[i+26] | (bytes[i+27] << 8)
    const extraLen      = bytes[i+28] | (bytes[i+29] << 8)
    const nameBytes     = bytes.slice(i + 30, i + 30 + fileNameLen)
    const name          = dec.decode(nameBytes)
    const dataStart     = i + 30 + fileNameLen + extraLen
    const dataEnd       = dataStart + compSize

    if (name === 'word/document.xml') {
      const compressed = bytes.slice(dataStart, dataEnd)

      if (method === 0) {
        // Stored — no compression
        return dec.decode(compressed)
      } else if (method === 8) {
        // DEFLATE — decompress with native DecompressionStream
        const ds     = new (window as any).DecompressionStream('deflate-raw')
        const writer = ds.writable.getWriter()
        const reader = ds.readable.getReader()
        writer.write(compressed)
        writer.close()

        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read() as { done: boolean; value: Uint8Array }
          if (done) break
          chunks.push(value)
        }
        const total = chunks.reduce((s, c) => s + c.length, 0)
        const out   = new Uint8Array(total)
        let off     = 0
        for (const chunk of chunks) { out.set(chunk, off); off += chunk.length }
        return dec.decode(out)
      }
      return '' // Unknown compression method
    }

    // Skip to next entry
    i = dataEnd
  }
  return '' // word/document.xml not found
}


async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (['txt', 'md', 'csv', 'json', 'rtf'].includes(ext)) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).slice(0, 10000))
      reader.onerror = () => resolve(`[Could not read ${file.name}]`)
      reader.readAsText(file)
    })
  }

  if (['docx', 'doc'].includes(ext)) {
    // DOCX is a ZIP (PKZIP) archive containing word/document.xml (DEFLATE-compressed).
    // We parse the ZIP binary manually and decompress with the browser-native
    // DecompressionStream API — zero npm packages required.
    try {
      const arrayBuffer = await file.arrayBuffer()
      const xmlText = await extractDocxXml(arrayBuffer)
      if (!xmlText) return '[DOCX: ' + file.name + ' — no readable text found]'

      // Pull text from <w:t> nodes (Word paragraph text runs)
      const nodes = xmlText.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []
      const text = nodes
        .map((n: string) => n.replace(/<[^>]+>/g, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      return text.slice(0, 10000) || '[DOCX: ' + file.name + ' — document appears empty or image-based]'
    } catch (err: any) {
      return '[DOCX: ' + file.name + ' — ' + String(err?.message ?? 'read error') + ']'
    }
  }

  if (ext === 'pdf') {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const raw = new TextDecoder('latin1').decode(new Uint8Array(reader.result as ArrayBuffer))
          const streams = raw.match(/BT[\s\S]*?ET/g) ?? []
          const texts = streams.map(s =>
            s.replace(/\(([^)]+)\)\s*Tj/g, '$1 ')
             .replace(/[^\x20-\x7E\n]/g, ' ')
             .replace(/\s+/g, ' ').trim()
          ).filter(t => t.length > 3)
          resolve(texts.join(' ').slice(0, 8000) || `[PDF: ${file.name}]`)
        } catch { resolve(`[PDF: ${file.name}]`) }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // Images — return hint
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return `[Image file: ${file.name} — ${(file.size / 1024).toFixed(0)} KB. Please describe any clinical information visible.]`
  }

  return `[File: ${file.name} — ${file.type}]`
}

// ── AI Analysis ───────────────────────────────────────────────────────────────

interface AIAnalysisResult {
  document_category: DocumentCategory
  summary: string
  key_findings: string[]
  flags: string[]
  recommendations: string
  confidence: number
}

async function analyseDocumentWithAI(
  text: string,
  fileName: string,
  athleteName: string
): Promise<AIAnalysisResult> {
  const prompt = `You are a senior sport psychologist and data extraction expert for the WinMindPerform SPPS platform.

CRITICAL RULES — READ FIRST:
1. NEVER say "no information found" or "document does not contain data". There is ALWAYS something to extract.
2. The document may be in ANY format — structured or unstructured, formal or informal, partial notes or full reports.
3. Your job is NOT to check if the format matches a template. Your job is to READ the content and RE-FORMAT it into the required JSON.
4. If the document has text, extract it. If it has numbers, record them. If it has names, capture them. If it has clinical language, summarise it.
5. Set confidence 70+ if there is any athlete-related or clinical content. Only use below 40 if the document is genuinely blank or unreadable.

Document types you may receive (handle ALL of them without complaint):
- Psychological case reports: case description, schema profiles, cognitive/affective/behavioural responses, test results
- Assessment results: CSAI-2, POMS, OCEAN/Big-5, Young Schema Questionnaire, ACQ, RCQQ, SAS, 5Cs, OMSAT, TRPS, MFAS, SCES
- Senaptec Sensory Station: Visual Clarity, Contrast Sensitivity, Near-Far Quickness, Depth Sensitivity, Perception Span, Multiple Object Tracking, Reaction Time, Target Capture, Peripheral Reaction, Go/No-Go
- PST session logs, intervention records, imagery scripts
- Coach reports, referral letters, physiotherapy notes, performance data
- Excel/tabular training data, daily monitoring logs
- Handwritten-style notes, partial records, informal case summaries
- Team reports covering multiple athletes — extract the most prominent one

Athlete: ${athleteName}
Document: ${fileName}
Content:
---
${text.slice(0, 8000)}
---

Extract everything present and return ONLY a valid JSON object (no markdown, no backticks):
{
  "document_category": "psychological_assessment" if any psych test/assessment/case report content; "session_notes" if session records; "coach_report" if coach observations; "performance_data" if scores/metrics; "medical_report" if medical/physio content; "training_log" if training data; otherwise best matching category from: "physiotherapy_report"|"competition_results"|"referral_letter"|"consent_form"|"correspondence"|"nutrition_report"|"injury_report"|"other",
  "summary": "2-3 paragraph professional clinical summary written in YOUR OWN WORDS integrating ALL content found — case description, presenting concerns, test scores, interventions used, performance context, recommendations. Specific numbers and scores must be included. Do NOT say 'the document contains' — just write the clinical narrative directly.",
  "key_findings": ["Each finding must be a specific, concrete statement WITH values where available. Examples: 'CSAI-2: High cognitive state anxiety, moderate somatic anxiety, low self-confidence', 'Performance schemas: attachment, approval-seeking, fear of losing control', 'Presenting concern: competition anxiety and low confidence despite national-level medals', 'Intervention plan: CBT, relaxation training, goal-setting, visualisation'. Include 4-8 findings."],
  "flags": ["List any clinical risks, urgent concerns, or items needing immediate attention. E.g. injury + ongoing performance, emotional distress patterns, high anxiety. Empty array only if genuinely nothing concerning."],
  "recommendations": "2-3 specific sentences on psychological intervention priorities and management recommendations based on what was found.",
  "confidence": 85
}`

  const text_response = await callGroq({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2500,
  })

  try {
    const clean = text_response.replace(/```json\n?|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      document_category: parsed.document_category ?? 'other',
      summary: parsed.summary ?? 'Document analysed.',
      key_findings: Array.isArray(parsed.key_findings) ? parsed.key_findings : [],
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      recommendations: parsed.recommendations ?? '',
      confidence: parsed.confidence ?? 50,
    }
  } catch {
    return {
      document_category: 'other',
      summary: `Document "${fileName}" was uploaded and processed. Manual review recommended.`,
      key_findings: [],
      flags: [],
      recommendations: 'Review document manually and add relevant findings to athlete notes.',
      confidence: 10,
    }
  }
}

// ── Supabase hooks ────────────────────────────────────────────────────────────

export function useAthleteDocuments(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<AthleteDocument[]>({
    queryKey: ['athlete_documents', athleteId, user?.id],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_documents')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(d => ({
        ...d,
        ai_key_findings: d.ai_key_findings ?? [],
        ai_flags: d.ai_flags ?? [],
      })) as AthleteDocument[]
    },
  })
}

function useCreateDocument() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<AthleteDocument, 'id' | 'practitioner_id'>) => {
      const { data, error } = await supabase
        .from('athlete_documents')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athlete_documents'] }),
  })
}

function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, athleteId, ...patch }: { id: string; athleteId: string } & Partial<AthleteDocument>) => {
      const { data, error } = await supabase
        .from('athlete_documents')
        .update(patch)
        .eq('id', id)
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athlete_documents'] }),
  })
}

function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, athleteId }: { id: string; athleteId: string }) => {
      const { error } = await supabase.from('athlete_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athlete_documents'] }),
  })
}

// ── Upload drop zone ──────────────────────────────────────────────────────────

function UploadZone({
  athleteId, athleteName, onUploaded
}: { athleteId: string; athleteName: string; onUploaded: () => void }) {
  const createDoc = useCreateDocument()
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processStatus, setProcessStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ name: string; category: string } | null>(null)

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    setLastResult(null)

    for (const file of Array.from(files)) {
      setProcessing(true)
      try {
        // Step 1: Extract text
        setProcessStatus(`Extracting text from ${file.name}…`)
        const extractedText = await extractTextFromFile(file)

        // Step 2: AI analysis
        setProcessStatus('Analysing with AI…')
        const analysis = await analyseDocumentWithAI(extractedText, file.name, athleteName)

        // Step 3: Optional: upload to Supabase Storage
        // (If bucket exists, store file; otherwise store text only)
        let storagePath: string | undefined
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `${athleteId}/${Date.now()}_${safeName}`
          const { error: uploadError } = await supabase.storage
            .from('athlete-documents')
            .upload(path, file, { upsert: false })
          if (!uploadError) storagePath = path
        } catch { /* Storage optional — continue without it */ }

        // Step 4: Save to database
        setProcessStatus('Saving…')
        await createDoc.mutateAsync({
          athlete_id: athleteId,
          file_name: file.name,
          file_type: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
          file_size_kb: Math.round(file.size / 1024),
          storage_path: storagePath,
          document_category: analysis.document_category,
          extracted_text: extractedText.slice(0, 8000),
          ai_summary: analysis.summary,
          ai_key_findings: analysis.key_findings,
          ai_flags: analysis.flags,
          ai_recommendations: analysis.recommendations,
          ai_confidence: analysis.confidence,
          uploaded_at: new Date().toISOString(),
          analysed_at: new Date().toISOString(),
        })

        setLastResult({ name: file.name, category: CATEGORY_META[analysis.document_category].label })
        onUploaded()

      } catch (err: any) {
        setError(`Failed to process ${file.name}: ${err.message}`)
      } finally {
        setProcessing(false)
        setProcessStatus('')
      }
    }
  }, [athleteId, athleteName, createDoc, onUploaded])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  if (processing) {
    return (
      <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center bg-blue-50">
        <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-blue-800">{processStatus || 'Processing…'}</p>
        <p className="text-xs text-blue-500 mt-1">AI is reading and categorising the document</p>
      </div>
    )
  }

  return (
    <div>
      {lastResult && (
        <div className="flex items-center gap-2 mb-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
          <CheckCircle size={15} className="text-green-500 shrink-0" />
          <p className="text-sm text-green-700">
            <strong>{lastResult.name}</strong> saved as <strong>{lastResult.category}</strong>
          </p>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
        }`}
      >
        <Upload size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-700 mb-1">Drop documents here</p>
        <p className="text-xs text-gray-400 mb-3">
          PDF · DOCX · TXT · CSV · JPG · PNG — any format
        </p>
        <label className="cursor-pointer">
          <span className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
            Choose Files
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </label>
      </div>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Each file is processed by AI: categorised, summarised, and key findings extracted.
        Results feed into the AI Case Summary and PDF export.
      </p>

      {error && (
        <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocumentCard({ doc, athleteId, athleteName }: { doc: AthleteDocument; athleteId: string; athleteName: string }) {
  const updateDoc = useUpdateDocument()
  const deleteDoc = useDeleteDocument()
  const [expanded, setExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(doc.practitioner_notes ?? '')
  const [editingCategory, setEditingCategory] = useState(false)
  const [category, setCategory] = useState(doc.document_category)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reanalysing, setReanalysing] = useState(false)
  const [reanalyseStatus, setReanalyseStatus] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const meta = CATEGORY_META[doc.document_category] ?? CATEGORY_META.other
  const hasFlags = doc.ai_flags?.length > 0
  const isPoorAnalysis = doc.ai_confidence <= 15 || doc.ai_summary?.includes('Manual review recommended')

  async function saveNote() {
    setSavingNote(true)
    setNoteError('')
    try {
      await updateDoc.mutateAsync({ id: doc.id, athleteId, practitioner_notes: noteText })
      setEditingNote(false)
    } catch (err: any) {
      setNoteError('Failed to save note: ' + (err?.message ?? 'unknown error'))
    } finally {
      setSavingNote(false)
    }
  }

  async function saveCategory() {
    setSavingCategory(true)
    setCategoryError('')
    try {
      await updateDoc.mutateAsync({ id: doc.id, athleteId, document_category: category })
      setEditingCategory(false)
    } catch (err: any) {
      setCategoryError('Failed to update category: ' + (err?.message ?? 'unknown error'))
    } finally {
      setSavingCategory(false)
    }
  }

  // Re-run AI analysis on the stored extracted text — no re-upload needed
  async function reanalyse() {
    if (!doc.extracted_text || doc.extracted_text.length < 20) {
      setReanalyseStatus('No extracted text available — please delete and re-upload the file.')
      return
    }
    setReanalysing(true)
    setReanalyseStatus('Re-analysing with AI…')
    try {
      const analysis = await analyseDocumentWithAI(doc.extracted_text, doc.file_name, athleteName)
      await updateDoc.mutateAsync({
        id: doc.id,
        athleteId,
        document_category: analysis.document_category,
        ai_summary: analysis.summary,
        ai_key_findings: analysis.key_findings,
        ai_flags: analysis.flags,
        ai_recommendations: analysis.recommendations,
        ai_confidence: analysis.confidence,
        analysed_at: new Date().toISOString(),
      })
      setReanalyseStatus('✓ Re-analysis complete')
      setTimeout(() => setReanalyseStatus(''), 3000)
    } catch (err: any) {
      setReanalyseStatus('Error: ' + String(err?.message ?? 'unknown'))
    } finally {
      setReanalysing(false)
    }
  }

  // Download original file from Supabase Storage
  async function downloadOriginal() {
    if (!doc.storage_path) {
      alert('Original file not stored in repository. Delete and re-upload to enable storage.')
      return
    }
    setDownloading(true)
    try {
      const { data, error } = await supabase.storage
        .from('athlete-documents')
        .createSignedUrl(doc.storage_path, 300) // 5-min signed URL
      if (error || !data?.signedUrl) {
        alert('Could not generate download link: ' + (error?.message ?? 'unknown error'))
        return
      }
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      alert('Download error: ' + String(err?.message ?? 'unknown'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${
      hasFlags ? 'border-amber-200' : 'border-gray-100'
    }`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {/* File type icon */}
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-base">
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{doc.file_name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {editingCategory ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as DocumentCategory)}
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button onClick={saveCategory} className="text-xs text-blue-500 hover:text-blue-700">Save</button>
                <button onClick={() => setEditingCategory(false)} className="text-xs text-gray-400">✕</button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setEditingCategory(true) }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} flex items-center gap-1`}
              >
                <Tag size={9} /> {meta.label}
              </button>
            )}
            <span className="text-xs text-gray-400">{fmtDate(doc.uploaded_at)}</span>
            {doc.file_size_kb && <span className="text-xs text-gray-400">{doc.file_size_kb} KB</span>}
            {doc.ai_confidence > 0 && (
              <span className="text-xs text-violet-500 flex items-center gap-0.5">
                <Sparkles size={9} /> {doc.ai_confidence}% confidence
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasFlags && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> {doc.ai_flags.length} flag{doc.ai_flags.length > 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">

          {/* AI Summary */}
          {doc.ai_summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-2">
                <Brain size={11} /> AI Clinical Summary
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{doc.ai_summary}</p>
            </div>
          )}

          {/* Key findings */}
          {doc.ai_key_findings?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Key Findings</p>
              <ul className="space-y-1">
                {doc.ai_key_findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-blue-400 shrink-0 mt-0.5">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Flags */}
          {doc.ai_flags?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={11} /> Clinical Flags
              </p>
              <ul className="space-y-1">
                {doc.ai_flags.map((f, i) => (
                  <li key={i} className="text-sm text-amber-800 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">⚠</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {doc.ai_recommendations && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-600 mb-1">Recommendations</p>
              <p className="text-sm text-blue-800">{doc.ai_recommendations}</p>
            </div>
          )}

          {/* Practitioner notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">Practitioner Notes</p>
              {!editingNote && (
                <button
                  onClick={() => setEditingNote(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                >
                  <Edit3 size={11} /> Edit
                </button>
              )}
            </div>
            {editingNote ? (
              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="Add your clinical observations about this document…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveNote} loading={savingNote}>
                    <Save size={12} /> Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingNote(false); setNoteError('') }}>Cancel</Button>
                </div>
                {noteError && <p className="text-xs text-red-600 mt-1">{noteError}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">
                {doc.practitioner_notes || 'No notes added yet.'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-gray-100">

            {/* Re-analyse status */}
            {reanalyseStatus && (
              <p className={`text-xs px-3 py-1.5 rounded-lg ${
                reanalyseStatus.startsWith('✓') ? 'bg-green-50 text-green-700' :
                reanalyseStatus.startsWith('Error') ? 'bg-red-50 text-red-700' :
                'bg-blue-50 text-blue-700'
              }`}>{reanalyseStatus}</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-2 flex-wrap">

                {/* Re-analyse button — always shown, prominent if poor analysis */}
                <button
                  onClick={reanalyse}
                  disabled={reanalysing}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    isPoorAnalysis
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
                      : 'text-violet-500 hover:text-violet-700 hover:bg-violet-50'
                  }`}
                >
                  <RefreshCw size={11} className={reanalysing ? 'animate-spin' : ''} />
                  {reanalysing ? 'Re-analysing…' : isPoorAnalysis ? 'Re-analyse (poor result)' : 'Re-analyse'}
                </button>

                {/* Download original */}
                <button
                  onClick={downloadOriginal}
                  disabled={downloading}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    doc.storage_path
                      ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                      : 'text-gray-300 cursor-not-allowed'
                  }`}
                  title={doc.storage_path ? 'Download original file' : 'File not stored — delete and re-upload to enable'}
                >
                  <DownloadCloud size={11} />
                  {downloading ? 'Downloading…' : 'Download original'}
                </button>

                {/* View extracted text */}
                {doc.extracted_text && (
                  <button
                    onClick={() => {
                      const blob = new Blob([doc.extracted_text ?? ''], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url; a.target = '_blank'
                      document.body.appendChild(a); a.click()
                      document.body.removeChild(a)
                      setTimeout(() => URL.revokeObjectURL(url), 2000)
                    }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <Eye size={11} /> View extracted text
                  </button>
                )}
              </div>

              <div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">Delete permanently?</span>
                    <button
                      onClick={() => deleteDoc.mutate({ id: doc.id, athleteId })}
                      className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded"
                    >
                      Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  athleteId: string
  athleteName: string
  compact?: boolean  // true = used inside Case Formulation tab (no upload zone shown separately)
}

export default function AthleteDocumentsPanel({ athleteId, athleteName, compact = false }: Props) {
  const { data: documents = [], isLoading, refetch } = useAthleteDocuments(athleteId)
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | 'all'>('all')
  const [showUpload, setShowUpload] = useState(!compact)

  const filtered = filterCategory === 'all'
    ? documents
    : documents.filter(d => d.document_category === filterCategory)

  const flaggedCount = documents.filter(d => d.ai_flags?.length > 0).length
  const categoryBreakdown = documents.reduce((acc: Record<string, number>, d) => {
    acc[d.document_category] = (acc[d.document_category] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </span>
            {flaggedCount > 0 && (
              <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle size={10} /> {flaggedCount} flagged
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          <FilePlus size={13} />
          {showUpload ? 'Hide upload' : 'Upload document'}
        </button>
      </div>

      {/* Upload zone */}
      {showUpload && (
        <UploadZone
          athleteId={athleteId}
          athleteName={athleteName}
          onUploaded={() => refetch()}
        />
      )}

      {/* Category summary chips */}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCategory('all')}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              filterCategory === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({documents.length})
          </button>
          {Object.entries(categoryBreakdown).map(([cat, count]) => {
            const m = CATEGORY_META[cat as DocumentCategory] ?? CATEGORY_META.other
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as DocumentCategory)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filterCategory === cat ? m.color + ' ring-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m.icon} {m.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="md" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
            <FileText size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">
            {documents.length === 0
              ? 'No documents uploaded yet. Drop any file above to get started.'
              : 'No documents in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <DocumentCard key={doc.id} doc={doc} athleteId={athleteId} athleteName={athleteName} />
          ))}
        </div>
      )}
    </div>
  )
}
