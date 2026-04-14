// src/types/sync.ts

export interface AthleteSessionRequest {
  id: string
  athlete_id: string
  practitioner_id: string
  athlete_auth_id: string
  request_type: 'session_booking' | 'progress_review' | 'help_support'
    | 'intervention_feedback' | 'goal_update' | 'crisis'
  title: string
  description?: string
  urgency: 'low' | 'normal' | 'high' | 'crisis'
  preferred_date?: string
  preferred_time?: string
  status: 'pending' | 'seen' | 'accepted' | 'declined' | 'completed'
  practitioner_response?: string
  responded_at?: string
  linked_session_id?: string
  created_at: string
  updated_at: string
  // Joined from athletes table
  athlete?: { first_name: string; last_name: string; sport: string; uid_code: string }
}

export interface AthleteDailyLog {
  id: string
  athlete_id: string
  practitioner_id: string
  athlete_auth_id: string
  log_date: string
  // Sleep
  sleep_hours?: number
  sleep_quality?: number
  sleep_notes?: string
  // Training
  training_done: boolean
  rpe?: number
  training_type?: string
  training_minutes?: number
  training_notes?: string
  // Nutrition
  nutrition_quality?: number
  water_litres?: number
  nutrition_notes?: string
  // Five Cs (each 1-10)
  commitment?: number
  communication?: number
  concentration?: number
  confidence?: number
  control?: number
  five_cs_notes?: string
  // Wellness
  mood_score?: number
  energy_score?: number
  stress_score?: number
  readiness_score?: number
  general_notes?: string
  flags: string[]
  created_at: string
  updated_at: string
}

export interface SharedReport {
  id: string
  report_id?: string
  athlete_id: string
  practitioner_id: string
  athlete_auth_id?: string
  shared_at: string
  expires_at: string
  duration_hours: number
  is_viewed: boolean
  viewed_at?: string
  view_count: number
  report_title?: string
  report_type?: string
  report_content?: string
  report_data: Record<string, unknown>
  is_revoked: boolean
  revoked_at?: string
  created_at: string
}

// Derived UI type with computed expiry state
export interface SharedReportWithExpiry extends SharedReport {
  minutesRemaining: number
  isExpired: boolean
  expiryLabel: string
}
