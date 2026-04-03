// ── Core Domain Types ─────────────────────────────────────────

export type PractitionerRole =
  | 'sport_psychologist'
  | 'counsellor'
  | 'psychometrist'
  | 'researcher'
  | 'student_intern'
  | 'admin'

export interface Organisation {
  id: string
  name: string
  type: string
  country: string
  state_province?: string
  city?: string
  website_url?: string
}

export interface Practitioner {
  id: string
  email: string
  first_name: string
  last_name: string
  role: PractitionerRole
  avatar_url?: string
  phone?: string
  bio?: string
  organisation_id?: string
  organisation?: Organisation
  hipaa_acknowledged: boolean
  compliance_completed: boolean
  notification_email: boolean
  notification_sms: boolean
  created_at?: string
  updated_at?: string
}

export type AthleteStatus = 'active' | 'inactive' | 'on_hold'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type SportType = string

export interface Athlete {
  id: string
  practitioner_id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  sport: SportType
  team?: string
  position?: string
  status: AthleteStatus
  risk_level: RiskLevel
  avatar_url?: string
  notes?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  created_at: string
  updated_at: string
}

export type SessionType = 'individual' | 'group' | 'crisis' | 'assessment' | 'follow_up'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface Session {
  id: string
  practitioner_id: string
  athlete_id: string
  athlete?: Athlete
  session_type: SessionType
  status: SessionStatus
  scheduled_at: string
  duration_minutes: number
  location?: string
  presenting_issues?: string[]
  goals?: string
  interventions_used?: string[]
  notes?: string
  risk_assessment?: RiskLevel
  follow_up_required: boolean
  created_at: string
  updated_at: string
}

export interface CheckIn {
  id: string
  practitioner_id: string
  athlete_id: string
  athlete?: Athlete
  checked_in_at: string
  mood_score: number          // 1–10
  stress_score: number        // 1–10
  sleep_score: number         // 1–10
  motivation_score: number    // 1–10
  readiness_score: number     // 1–10
  notes?: string
  flags?: string[]
  created_at: string
}

export type AssessmentTool =
  | 'APAS'    // Athletic Pre-Competition Anxiety Scale    · 18 items
  | 'PSAS'    // Psychological Stress & Arousal Scale      · 21 items
  | 'SCES'    // Sport Confidence & Efficacy Scale         · 15 items
  | 'TRPS'    // Training & Recovery Profiling Scale       · 24 items
  | 'MFAS'    // Mental Flow & Absorption Scale            · 18 items
  | 'CFAS'    // Competition Focus & Attentional Scale     · 24 items
  | 'Custom'

export interface Assessment {
  id: string
  practitioner_id: string
  athlete_id: string
  athlete?: Athlete
  tool: AssessmentTool
  administered_at: string
  scores: Record<string, number>   // subscale → score
  total_score?: number
  interpretation?: string
  notes?: string
  created_at: string
}

export type InterventionCategory =
  | 'Cognitive Restructuring' | 'Relaxation' | 'Imagery' | 'Goal Setting'
  | 'Mindfulness' | 'Confidence Building' | 'Team Cohesion' | 'Crisis Protocol' | 'Other'

export interface Intervention {
  id: string
  practitioner_id: string
  athlete_id: string
  athlete?: Athlete
  category: InterventionCategory
  title: string
  description?: string
  protocol?: string
  session_id?: string
  rating?: number     // 1–5 effectiveness
  notes?: string
  created_at: string
  updated_at: string
}

export type ReportType = 'progress' | 'assessment_summary' | 'session_summary' | 'crisis' | 'custom'

export interface Report {
  id: string
  practitioner_id: string
  athlete_id?: string
  athlete?: Athlete
  report_type: ReportType
  title: string
  content: string       // markdown
  generated_at: string
  is_ai_generated: boolean
  created_at: string
}

// ── UI Helpers ────────────────────────────────────────────────
export type NavItem = {
  label: string
  href: string
  icon: string
  badge?: number
}
