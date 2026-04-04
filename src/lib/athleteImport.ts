// AI-powered athlete document import
// Parses any document type and extracts structured athlete data

export interface ImportedAthleteData {
  first_name: string
  last_name: string
  date_of_birth?: string
  sport: string
  team?: string
  position?: string
  email?: string
  phone?: string
  status: 'active'
  risk_level: 'low' | 'moderate' | 'high' | 'critical'
  notes?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  // Extended extracted data
  presenting_concerns?: string
  goals?: string[]
  assessment_history?: string
  intervention_history?: string
  achievements?: string
  organization?: string
  referral_reason?: string
  coach_name?: string
}

export interface ImportResult {
  athlete: ImportedAthleteData
  sessionNote?: string
  confidence: number  // 0-100
  warnings: string[]
  rawExtract: string
}

// Read file as text (for docx, txt, md) or base64 (for pdf, images)
export async function readFileContent(file: File): Promise<{ text: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (['txt', 'md', 'csv', 'json'].includes(ext)) {
      reader.onload = () => resolve({ text: reader.result as string, type: 'text' })
      reader.readAsText(file)
    } else {
      // For DOCX, PDF, images — read as ArrayBuffer then extract text via FileReader
      reader.onload = () => {
        // Convert to base64 for API
        const base64 = btoa(
          new Uint8Array(reader.result as ArrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        resolve({ text: base64, type: ext })
      }
      reader.readAsArrayBuffer(file)
    }
  })
}

// Extract text from any file format — uses mammoth for DOCX, native ZIP/XML for XLSX/XLS
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const MAX = 12000

  if (['txt', 'md', 'csv', 'json'].includes(ext)) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).slice(0, MAX))
      reader.readAsText(file)
    })
  }

  // DOCX — mammoth for reliable ZIP/XML extraction
  if (['docx', 'doc'].includes(ext)) {
    try {
      const mammoth = await import('mammoth')
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      const text = result.value.replace(/\s+/g, ' ').trim()
      if (text.length > 100) return text.slice(0, MAX)
    } catch { /* fall through */ }

    // Backup: binary XML scan
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const str = new TextDecoder('latin1').decode(new Uint8Array(reader.result as ArrayBuffer))
          const matches = str.match(/<w:t(?:[^>]*)?>([^<]+)<\/w:t>/g) ?? []
          const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim()
          resolve(text.slice(0, MAX) || str.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{3,}/g, ' ').slice(0, 6000))
        } catch { resolve(`[DOCX: ${file.name}]`) }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // PDF — multi-strategy text extraction
  if (ext === 'pdf') {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const raw = new TextDecoder('latin1').decode(new Uint8Array(reader.result as ArrayBuffer))
          const chunks: string[] = []
          const blocks = raw.match(/BT[\s\S]*?ET/g) ?? []
          for (const b of blocks) {
            const parts = b.match(/\(([^)]{1,200})\)\s*T[Jj]/g) ?? []
            const arrs = b.match(/\[([^\]]+)\]\s*TJ/g) ?? []
            for (const p of parts) chunks.push(p.replace(/\(([^)]*)\)\s*T[Jj]/, '$1'))
            for (const a of arrs) {
              const inner = a.match(/\(([^)]+)\)/g) ?? []
              chunks.push(inner.map((i: string) => i.slice(1, -1)).join(''))
            }
          }
          if (chunks.join('').replace(/\s/g, '').length < 50) {
            const plain = raw.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{4,}/g, ' ')
            const words = plain.match(/[a-zA-Z][a-zA-Z0-9\s,.:;()\/\-]{8,}/g) ?? []
            chunks.push(words.join(' '))
          }
          resolve(chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX) || `[PDF: ${file.name}]`)
        } catch { resolve(`[PDF: ${file.name}]`) }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // XLSX / XLS — zero-dependency native extraction
  // xlsx files are ZIP archives containing XML sheets. We unzip them in the
  // browser using the DecompressionStream API (available in all modern browsers)
  // and parse the shared-strings + sheet XML directly — no vulnerable library needed.
  if (['xlsx', 'xls'].includes(ext)) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)

      // Locate ZIP local file headers (PK\x03\x04) and extract XML entries
      const decoder = new TextDecoder('utf-8')
      const results: string[] = []
      let i = 0

      // Parse ZIP entries to find xl/sharedStrings.xml and xl/worksheets/sheet*.xml
      const entries: Record<string, string> = {}
      while (i < uint8.length - 4) {
        // Local file header signature
        if (uint8[i] === 0x50 && uint8[i+1] === 0x4B && uint8[i+2] === 0x03 && uint8[i+3] === 0x04) {
          const compMethod  = uint8[i+8]  | (uint8[i+9]  << 8)
          const compSize    = uint8[i+18] | (uint8[i+19] << 8) | (uint8[i+20] << 16) | (uint8[i+21] << 24)
          const uncompSize  = uint8[i+22] | (uint8[i+23] << 8) | (uint8[i+24] << 16) | (uint8[i+25] << 24)
          const fnLen       = uint8[i+26] | (uint8[i+27] << 8)
          const extraLen    = uint8[i+28] | (uint8[i+29] << 8)
          const fnStart     = i + 30
          const dataStart   = fnStart + fnLen + extraLen
          const fileName    = decoder.decode(uint8.slice(fnStart, fnStart + fnLen))

          if (fileName.includes('sharedStrings') || fileName.match(/xl\/worksheets\/sheet\d/)) {
            const compData = uint8.slice(dataStart, dataStart + compSize)
            if (compMethod === 0) {
              // Stored (no compression)
              entries[fileName] = decoder.decode(compData)
            } else if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
              // Deflate — use native DecompressionStream
              try {
                const ds = new DecompressionStream('deflate-raw')
                const writer = ds.writable.getWriter()
                writer.write(compData)
                writer.close()
                const chunks: Uint8Array[] = []
                const reader2 = ds.readable.getReader()
                let done = false
                while (!done) {
                  const { value, done: d } = await reader2.read()
                  if (value) chunks.push(value)
                  done = d
                }
                const total = chunks.reduce((acc, c) => acc + c.length, 0)
                const merged = new Uint8Array(total)
                let offset = 0
                for (const c of chunks) { merged.set(c, offset); offset += c.length }
                entries[fileName] = decoder.decode(merged)
              } catch { /* skip this entry */ }
            }
          }
          i = dataStart + compSize
        } else {
          i++
        }
      }

      // Build shared strings lookup
      const sharedStrings: string[] = []
      const ssXml = Object.entries(entries).find(([k]) => k.includes('sharedStrings'))?.[1] ?? ''
      const siMatches = ssXml.match(/<si>[\s\S]*?<\/si>/g) ?? []
      for (const si of siMatches) {
        const tMatches = si.match(/<t[^>]*>([^<]*)<\/t>/g) ?? []
        sharedStrings.push(tMatches.map(t => t.replace(/<[^>]+>/g, '')).join(''))
      }

      // Parse each worksheet into CSV rows
      const sheetEntries = Object.entries(entries)
        .filter(([k]) => k.match(/xl\/worksheets\/sheet\d/))
        .slice(0, 5)

      for (const [sheetName, sheetXml] of sheetEntries) {
        const rows: string[][] = []
        const rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []
        for (const row of rowMatches) {
          const cells: string[] = []
          const cellMatches = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) ?? []
          for (const cell of cellMatches) {
            const typeMatch  = cell.match(/t="([^"]*)"/)
            const vMatch     = cell.match(/<v>([^<]*)<\/v>/)
            const isMatch    = cell.match(/<is>[\s\S]*?<\/is>/)
            let val = ''
            if (isMatch) {
              val = (isMatch[0].match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? '').trim()
            } else if (typeMatch?.[1] === 's' && vMatch) {
              val = sharedStrings[parseInt(vMatch[1])] ?? ''
            } else if (vMatch) {
              val = vMatch[1]
            }
            cells.push(val.includes(',') ? `"${val}"` : val)
          }
          if (cells.some(c => c)) rows.push(cells)
        }
        const label = sheetName.match(/sheet(\d+)/)?.[1] ?? sheetName
        results.push(`=== Sheet ${label} ===\n${rows.map(r => r.join(',')).join('\n').slice(0, 3000)}`)
      }

      if (results.length) return results.join('\n\n').slice(0, MAX)
      return `[XLSX: ${file.name} — could not extract text. Try saving as CSV before importing.]`
    } catch {
      return `[XLSX: ${file.name} — could not extract text. Try saving as CSV before importing.]`
    }
  }

  return `[File: ${file.name} — ${file.type}. Extract any athlete information visible in this document.]`
}

// Main AI extraction function
export async function extractAthleteFromDocument(
  fileText: string,
  fileName: string,
  groqKey: string
): Promise<ImportResult> {

  const prompt = `You are an expert sport psychology data extraction assistant. Extract structured athlete information from the following document.

Document filename: ${fileName}
Content:
${fileText.slice(0, 8000)}

DOCUMENT TYPES YOU MAY ENCOUNTER (extract accordingly):
- AIFF/FIFA/SAI/national federation PST reports: look for "Athlete: Name | Age: X | Position: Y", "Total Sessions: N", "Primary Focus Area: X"
- Senaptec sensory reports: look for Visual Clarity, Contrast Sensitivity, Reaction Time, Peripheral Reaction, Go/No-Go percentile scores
- OCEAN personality profiles: Extraversion, Agreeableness, Conscientiousness, Neuroticism, Openness scores
- POMS mood profiles: Tension, Depression, Anger, Vigour, Fatigue, Confusion scores
- Mental skills assessments: Goal Setting, Commitment, Imagery, Confidence, Focus, Stress Control, Fear Control, Relaxation scores
- GEQ cohesion assessments: Social Integration, Task Integration, Group Attraction scores  
- SIQ imagery assessments: Skill, Strategy, Mastery, Goal, Affect imagery scores
- Handover/case reports: presenting concerns, intervention history, goals, recommendations
- Psychological profiles from sports science centres (ABTP, SAI, NSNIS, etc.)
- Individual athlete case files with assessment results

ATHLETE NAME DETECTION — try all of these patterns:
- "Athlete: [Name]", "Name/Code: [Name]", "Subject: [Name]"
- Header line like "Karanbir Singh | Football | India"
- File name itself (e.g. "Arpita_Priyadarshini.docx" → Arpita Priyadarshini)
- First bold heading in the document

Extract and return ONLY valid JSON (no markdown, no backticks):
{
  "first_name": "string or null — use filename as fallback",
  "last_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "sport": "string (Football, Tennis, Swimming, Athletics, etc.) or null",
  "team": "string (AIFF, SAI, club name, federation) or null",
  "position": "string (GK, MF, DEF, LW, event, etc.) or null",
  "email": "string or null",
  "phone": "string or null",
  "risk_level": "low | moderate | high | critical — based on psychological flags, emotional instability scores, or presenting concerns",
  "achievements": "string — competition results, selections, performance highlights or null",
  "presenting_concerns": "string — psychological concerns, performance issues, behavioural patterns noted in document or null",
  "goals": ["array of specific intervention/performance goals mentioned"],
  "assessment_history": "string — list ALL assessments used: OCEAN, POMS, GEQ, SIQ, Senaptec, ACL-RSI, TSK, PST, etc. with key scores where available",
  "intervention_history": "string — sessions count, session types (PST, Counselling, Senaptec), primary focus areas, interventions delivered",
  "organization": "string — AIFF, SAI, NSNIS, club, federation, sports science centre or null",
  "referral_reason": "string or null",
  "coach_name": "string or null",
  "session_note": "Detailed 3-4 paragraph clinical note: (1) Athlete background and context, (2) Key assessment findings with scores, (3) Psychological strengths and development areas, (4) Recommendations for ongoing support",
  "confidence": number 0-100 — 80+ if name + sport + assessment data found, 60-80 if partial profile, 40-60 if general psych report without individual data, below 40 only if truly no athlete data,
  "warnings": ["specific missing critical fields like DOB, contact details, or incomplete assessment data"]
}

Return ONLY the JSON object.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    throw new Error(`AI extraction failed: ${response.status}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content ?? '{}'

  // Parse JSON safely
  let parsed: any = {}
  try {
    const clean = text.replace(/```json\n?|```/g, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new Error('AI returned invalid JSON — could not parse athlete data')
  }

  // Build ImportedAthleteData
  const nameParts = parsed.first_name ? [] : (parsed.name ?? '').split(' ')
  const athlete: ImportedAthleteData = {
    first_name: parsed.first_name ?? nameParts[0] ?? 'Unknown',
    last_name: parsed.last_name ?? nameParts.slice(1).join(' ') ?? '',
    date_of_birth: parsed.date_of_birth ?? undefined,
    sport: parsed.sport ?? 'Unknown',
    team: parsed.team ?? parsed.organization ?? undefined,
    position: parsed.position ?? undefined,
    email: parsed.email ?? undefined,
    phone: parsed.phone ?? undefined,
    status: 'active',
    risk_level: parsed.risk_level ?? 'low',
    notes: [parsed.presenting_concerns, parsed.referral_reason].filter(Boolean).join('\n\n') || undefined,
    presenting_concerns: parsed.presenting_concerns ?? undefined,
    goals: parsed.goals ?? [],
    assessment_history: parsed.assessment_history ?? undefined,
    intervention_history: parsed.intervention_history ?? undefined,
    achievements: parsed.achievements ?? undefined,
    organization: parsed.organization ?? undefined,
    referral_reason: parsed.referral_reason ?? undefined,
    coach_name: parsed.coach_name ?? undefined,
  }

  return {
    athlete,
    sessionNote: parsed.session_note,
    confidence: parsed.confidence ?? 50,
    warnings: parsed.warnings ?? [],
    rawExtract: fileText.slice(0, 500),
  }
}
