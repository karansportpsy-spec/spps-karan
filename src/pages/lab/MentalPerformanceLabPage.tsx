// src/pages/lab/MentalPerformanceLabPage.tsx
// High-Performance Mental Performance Lab
// Supports data entry from 8 gold-standard technologies:
// EEG (eego sports), fNIRS (NIRSport2 / Brite23), tDCS (Soterix),
// VR (Rezzil), CANTAB, Eye Tracking (EyeLink), Motion Capture (OptiTrack)

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Activity, Zap, Eye, Cpu, Move, FlaskConical,
  Plus, ChevronDown, ChevronUp, TrendingUp, Clock,
  CheckCircle, AlertCircle, BarChart2, Layers, Target,
  Radio, MonitorPlay, Crosshair, Glasses,
  Upload, FileText, ShieldCheck, ShieldX, TrendingDown,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Modal, Input, Select, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LabTechnology =
  | 'eeg_eego'
  | 'fnirs_nirsport'
  | 'fnirs_brite23'
  | 'tdcs_soterix'
  | 'vr_rezzil'
  | 'eye_eyelink'
  | 'motion_optitrack'
  | 'gps_catapult'
  | 'cognitive_neurotracker'

export interface LabSession {
  id: string
  practitioner_id: string
  athlete_id: string
  technology: LabTechnology
  session_date: string
  duration_minutes?: number
  protocol?: string
  scores: Record<string, number | string>
  notes?: string
  flags: string[]
  consent_given: boolean
  import_source?: string
  created_at: string
}

// ── Technology Definitions ────────────────────────────────────────────────────

interface TechDef {
  id: LabTechnology
  label: string
  vendor: string
  icon: React.ElementType
  color: string
  colorDim: string
  category: string
  description: string
  fields: FieldDef[]
  radarKeys?: string[]
  trendKey?: string
}

interface FieldDef {
  key: string
  label: string
  unit?: string
  min?: number
  max?: number
  step?: number
  type: 'number' | 'select' | 'text'
  options?: string[]
  group?: string
  description?: string
}

const TECHNOLOGIES: TechDef[] = [
  {
    id: 'eeg_eego',
    label: 'eego sports EEG',
    vendor: 'ANT Neuro',
    icon: Radio,
    color: '#6366f1',
    colorDim: '#eef2ff',
    category: 'Psychophysiology',
    description: 'Mobile 24-bit EEG/EMG for attention, fatigue & cognitive load under exertion',
    radarKeys: ['Alpha Power', 'Beta Power', 'Theta Power', 'Attention Index', 'Fatigue Index'],
    trendKey: 'Attention Index',
    fields: [
      { key: 'alpha_power', label: 'Alpha Power', unit: 'μV²', min: 0, max: 100, step: 0.1, type: 'number', group: 'Band Power', description: 'Resting/relaxed state indicator (8–12 Hz)' },
      { key: 'beta_power', label: 'Beta Power', unit: 'μV²', min: 0, max: 100, step: 0.1, type: 'number', group: 'Band Power', description: 'Active thinking & focus (13–30 Hz)' },
      { key: 'theta_power', label: 'Theta Power', unit: 'μV²', min: 0, max: 100, step: 0.1, type: 'number', group: 'Band Power', description: 'Memory encoding, drowsiness (4–8 Hz)' },
      { key: 'gamma_power', label: 'Gamma Power', unit: 'μV²', min: 0, max: 100, step: 0.1, type: 'number', group: 'Band Power', description: 'Cognitive processing (>30 Hz)' },
      { key: 'attention_index', label: 'Attention Index', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Derived Metrics' },
      { key: 'fatigue_index', label: 'Fatigue Index', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Derived Metrics' },
      { key: 'cognitive_load', label: 'Cognitive Load', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Derived Metrics' },
      { key: 'task_condition', label: 'Task Condition', type: 'select', options: ['Rest', 'Low Exertion', 'Moderate Exertion', 'High Exertion', 'Dual Task', 'Sport-Specific'], group: 'Protocol' },
      { key: 'electrode_config', label: 'Electrode Configuration', type: 'select', options: ['32-channel', '64-channel', 'Custom Montage'], group: 'Protocol' },
    ],
  },
  {
    id: 'fnirs_nirsport',
    label: 'NIRSport2 fNIRS',
    vendor: 'NIRx',
    icon: Brain,
    color: '#ec4899',
    colorDim: '#fdf2f8',
    category: 'Psychophysiology',
    description: 'Wearable fNIRS for cortical oxygenation during decision-making & sport tasks',
    radarKeys: ['PFC Activation', 'Motor Cortex', 'Parietal Activation', 'oxyHb Change', 'deoxyHb Change'],
    trendKey: 'PFC Activation',
    fields: [
      { key: 'oxy_hb_pfc', label: 'OxyHb — Prefrontal Cortex', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation', description: 'Increase = greater PFC activation' },
      { key: 'deoxy_hb_pfc', label: 'DeoxyHb — Prefrontal Cortex', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'oxy_hb_motor', label: 'OxyHb — Motor Cortex', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'deoxy_hb_motor', label: 'DeoxyHb — Motor Cortex', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'oxy_hb_parietal', label: 'OxyHb — Parietal Cortex', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'mental_workload_index', label: 'Mental Workload Index', unit: 'a.u.', min: 0, max: 100, step: 1, type: 'number', group: 'Derived' },
      { key: 'task_type', label: 'Task Type', type: 'select', options: ['Resting State', 'Decision Making', 'Sport-Specific Skill', 'Dual Task', 'Go/No-Go', 'Stroop', 'Working Memory'], group: 'Protocol' },
    ],
  },
  {
    id: 'fnirs_brite23',
    label: 'Brite23 fNIRS',
    vendor: 'Artinis',
    icon: Layers,
    color: '#f97316',
    colorDim: '#fff7ed',
    category: 'Psychophysiology',
    description: 'Portable 23-channel fNIRS with accelerometer — dual-task & skill execution',
    radarKeys: ['OxyHb PFC', 'OxyHb Motor', 'OxyHb Temporal', 'Movement Load', 'Bilateral Symmetry'],
    trendKey: 'OxyHb PFC',
    fields: [
      { key: 'oxy_hb_mean', label: 'Mean OxyHb Change', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'deoxy_hb_mean', label: 'Mean DeoxyHb Change', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'total_hb_mean', label: 'Total Hb Change', unit: 'μM', min: -10, max: 10, step: 0.01, type: 'number', group: 'Oxygenation' },
      { key: 'channels_active', label: 'Active Channels', unit: '/23', min: 0, max: 23, step: 1, type: 'number', group: 'Signal Quality' },
      { key: 'signal_quality', label: 'Signal Quality Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Signal Quality' },
      { key: 'accel_movement_rms', label: 'Accelerometer RMS (movement)', unit: 'g', min: 0, max: 5, step: 0.01, type: 'number', group: 'Movement' },
      { key: 'task_condition', label: 'Task Condition', type: 'select', options: ['Single Task', 'Dual Task', 'Field Sport Drill', 'Lab Protocol', 'Resting Baseline'], group: 'Protocol' },
    ],
  },
  {
    id: 'tdcs_soterix',
    label: 'Soterix tDCS',
    vendor: 'Soterix Medical',
    icon: Zap,
    color: '#eab308',
    colorDim: '#fefce8',
    category: 'Neurostimulation',
    description: 'Single-channel transcranial DC stimulation for motor learning & cognitive enhancement',
    radarKeys: ['Current Intensity', 'Session Duration', 'Electrode Impedance', 'Protocol Adherence', 'Post-Session Score'],
    trendKey: 'Post-Session Score',
    fields: [
      { key: 'current_intensity', label: 'Current Intensity', unit: 'mA', min: 0.5, max: 2.0, step: 0.1, type: 'number', group: 'Stimulation Protocol', description: 'Typical range: 1–2 mA' },
      { key: 'session_duration_min', label: 'Stimulation Duration', unit: 'min', min: 5, max: 30, step: 1, type: 'number', group: 'Stimulation Protocol' },
      { key: 'anode_placement', label: 'Anode Placement', type: 'select', options: ['F3 (left DLPFC)', 'F4 (right DLPFC)', 'M1 left', 'M1 right', 'Cz', 'Oz', 'Custom'], group: 'Stimulation Protocol' },
      { key: 'cathode_placement', label: 'Cathode Placement', type: 'select', options: ['Supraorbital (right)', 'Supraorbital (left)', 'Shoulder (right)', 'Shoulder (left)', 'Custom'], group: 'Stimulation Protocol' },
      { key: 'electrode_impedance', label: 'Electrode Impedance', unit: 'kΩ', min: 0, max: 30, step: 0.1, type: 'number', group: 'Signal Quality', description: 'Target <10 kΩ for good contact' },
      { key: 'pre_task_score', label: 'Pre-Session Performance Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Performance' },
      { key: 'post_task_score', label: 'Post-Session Performance Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Performance' },
      { key: 'adverse_effects', label: 'Adverse Effects Reported', type: 'select', options: ['None', 'Tingling (mild)', 'Itching (mild)', 'Headache (mild)', 'Discontinued'], group: 'Safety' },
      { key: 'target_application', label: 'Target Application', type: 'select', options: ['Motor Learning', 'Working Memory', 'Attention', 'Cognitive Enhancement', 'Recovery/Fatigue', 'Anxiety Reduction'], group: 'Protocol' },
    ],
  },
  {
    id: 'vr_rezzil',
    label: 'Rezzil VR Platform',
    vendor: 'Rezzil',
    icon: Glasses,
    color: '#10b981',
    colorDim: '#ecfdf5',
    category: 'Cognitive Training',
    description: 'Immersive VR decision-making & reaction speed drills with sport-specific scenarios',
    radarKeys: ['Decision Accuracy', 'Reaction Speed', 'Spatial Awareness', 'Under Pressure', 'Drill Completion'],
    trendKey: 'Decision Accuracy',
    fields: [
      { key: 'overall_score', label: 'Overall Session Score', unit: 'pts', min: 0, max: 1000, step: 1, type: 'number', group: 'Performance' },
      { key: 'decision_accuracy', label: 'Decision Accuracy', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Performance' },
      { key: 'reaction_time_ms', label: 'Mean Reaction Time', unit: 'ms', min: 100, max: 1500, step: 1, type: 'number', group: 'Performance', description: 'Lower = faster' },
      { key: 'spatial_awareness_score', label: 'Spatial Awareness Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Performance' },
      { key: 'pressure_performance', label: 'Under-Pressure Performance', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Performance', description: 'Score on time-critical trials' },
      { key: 'drills_completed', label: 'Drills Completed', unit: '', min: 0, max: 50, step: 1, type: 'number', group: 'Volume' },
      { key: 'drill_type', label: 'Primary Drill Type', type: 'select', options: ['Decision Making', '1v1 Defending', 'Finishing', 'Goalkeeper', 'Passing Lanes', 'Reaction Speed', 'Scanning', 'Pressing'], group: 'Protocol' },
      { key: 'sport_mode', label: 'Sport Mode', type: 'select', options: ['Football', 'Rugby', 'Cricket', 'Tennis', 'Basketball', 'Hockey', 'Custom'], group: 'Protocol' },
      { key: 'difficulty_level', label: 'Difficulty Level', type: 'select', options: ['Beginner', 'Intermediate', 'Advanced', 'Elite'], group: 'Protocol' },
    ],
  },
    {
    id: 'eye_eyelink',
    label: 'EyeLink Eye Tracker',
    vendor: 'SR Research',
    icon: Eye,
    color: '#8b5cf6',
    colorDim: '#f5f3ff',
    category: 'Behavioural Tracking',
    description: '2000 Hz binocular eye tracking for gaze, fixation, saccades & anticipatory scanning',
    radarKeys: ['Fixation Duration', 'Saccade Amplitude', 'Smooth Pursuit', 'Anticipatory Gaze', 'Search Strategy'],
    trendKey: 'Anticipatory Gaze',
    fields: [
      { key: 'mean_fixation_duration', label: 'Mean Fixation Duration', unit: 'ms', min: 50, max: 500, step: 1, type: 'number', group: 'Fixation', description: 'Shorter = more efficient gaze' },
      { key: 'fixation_count', label: 'Fixation Count', unit: '', min: 0, max: 200, step: 1, type: 'number', group: 'Fixation' },
      { key: 'mean_saccade_amplitude', label: 'Mean Saccade Amplitude', unit: '°', min: 0, max: 30, step: 0.1, type: 'number', group: 'Saccades' },
      { key: 'saccade_count', label: 'Saccade Count', unit: '', min: 0, max: 300, step: 1, type: 'number', group: 'Saccades' },
      { key: 'smooth_pursuit_gain', label: 'Smooth Pursuit Gain', unit: '', min: 0, max: 1.5, step: 0.01, type: 'number', group: 'Pursuit', description: 'Ideal ≈ 1.0' },
      { key: 'anticipatory_gaze_pct', label: 'Anticipatory Gaze %', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Anticipation', description: 'Fixation on target before event' },
      { key: 'gaze_entropy', label: 'Gaze Entropy (search efficiency)', unit: 'bits', min: 0, max: 5, step: 0.01, type: 'number', group: 'Search Strategy', description: 'Lower = more focused search' },
      { key: 'blink_rate', label: 'Blink Rate', unit: '/min', min: 0, max: 30, step: 0.5, type: 'number', group: 'Arousal Indicators' },
      { key: 'sampling_rate', label: 'Sampling Rate Used', type: 'select', options: ['500 Hz', '1000 Hz', '2000 Hz'], group: 'Protocol' },
      { key: 'task_scenario', label: 'Task Scenario', type: 'select', options: ['Penalty Kick', 'Free Throw', 'Serve/Return', 'Tactical Decision', 'Threat Detection', 'Reading the Game', 'Lab Paradigm', 'Custom'], group: 'Protocol' },
    ],
  },
  {
    id: 'motion_optitrack',
    label: 'OptiTrack Motion',
    vendor: 'NaturalPoint',
    icon: Move,
    color: '#14b8a6',
    colorDim: '#f0fdfa',
    category: 'Behavioural Tracking',
    description: '3D motion capture with force plate integration for biomechanics & movement quality',
    radarKeys: ['Movement Efficiency', 'Joint Coordination', 'Balance Index', 'Velocity Profile', 'Symmetry Score'],
    trendKey: 'Movement Efficiency',
    fields: [
      { key: 'capture_rate', label: 'Capture Rate', type: 'select', options: ['100 fps', '120 fps', '200 fps', '240 fps', '300 fps'], group: 'Protocol' },
      { key: 'markers_used', label: 'Markers Used', unit: '', min: 1, max: 64, step: 1, type: 'number', group: 'Protocol' },
      { key: 'movement_efficiency_score', label: 'Movement Efficiency Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Kinematics', description: 'Overall economy of movement' },
      { key: 'peak_velocity', label: 'Peak Velocity', unit: 'm/s', min: 0, max: 15, step: 0.01, type: 'number', group: 'Kinematics' },
      { key: 'joint_angle_symmetry', label: 'Joint Angle Symmetry Index', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Kinematics', description: '100% = perfect bilateral symmetry' },
      { key: 'grf_peak_n', label: 'Peak Ground Reaction Force', unit: 'N', min: 0, max: 5000, step: 10, type: 'number', group: 'Force Plate', description: 'From integrated force plate' },
      { key: 'grf_symmetry', label: 'GRF Bilateral Symmetry', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Force Plate' },
      { key: 'balance_cop_range_ml', label: 'CoP Range (ML)', unit: 'cm', min: 0, max: 15, step: 0.1, type: 'number', group: 'Balance', description: 'Centre of Pressure mediolateral sway' },
      { key: 'balance_cop_range_ap', label: 'CoP Range (AP)', unit: 'cm', min: 0, max: 20, step: 0.1, type: 'number', group: 'Balance' },
      { key: 'sport_movement', label: 'Movement Assessed', type: 'select', options: ['Running Gait', 'Jump/Landing', 'Change of Direction', 'Throwing/Kicking', 'Serve/Swing', 'Sport-Specific Skill', 'Balance Protocol', 'Custom'], group: 'Protocol' },
    ],
  },
  {
    id: 'gps_catapult',
    label: 'Catapult GPS',
    vendor: 'Catapult Sports',
    icon: Activity,
    color: '#f59e0b',
    colorDim: '#fffbeb',
    category: 'Behavioural Tracking',
    description: 'GPS-based external training load monitoring — player load, distance, speed zones & acceleration events linked to psychological readiness',
    radarKeys: ['Player Load', 'HSR Distance', 'Sprint Distance', 'Accel Load', 'Session RPE'],
    trendKey: 'Player Load',
    fields: [
      { key: 'player_load', label: 'Player Load', unit: 'AU', min: 0, max: 1000, step: 1, type: 'number', group: 'Load Metrics', description: 'Catapult proprietary composite load unit (higher = greater physical demand)' },
      { key: 'total_distance_km', label: 'Total Distance', unit: 'km', min: 0, max: 20, step: 0.01, type: 'number', group: 'Load Metrics' },
      { key: 'hsr_distance_m', label: 'High Speed Running Distance', unit: 'm', min: 0, max: 5000, step: 1, type: 'number', group: 'Load Metrics', description: '>5.5 m/s threshold' },
      { key: 'sprint_distance_m', label: 'Sprint Distance', unit: 'm', min: 0, max: 2000, step: 1, type: 'number', group: 'Load Metrics', description: '>7.0 m/s threshold' },
      { key: 'max_speed_ms', label: 'Max Speed', unit: 'm/s', min: 0, max: 12, step: 0.01, type: 'number', group: 'Load Metrics' },
      { key: 'accel_high_count', label: 'High Accelerations (>3 m/s²)', unit: 'count', min: 0, max: 200, step: 1, type: 'number', group: 'Acceleration Events' },
      { key: 'decel_high_count', label: 'High Decelerations (>3 m/s²)', unit: 'count', min: 0, max: 200, step: 1, type: 'number', group: 'Acceleration Events' },
      { key: 'session_rpe', label: 'Session RPE (Borg CR10)', unit: '/10', min: 0, max: 10, step: 0.5, type: 'number', group: 'Psychological Link', description: 'Athlete perceived effort — bridge between external & internal load' },
      { key: 'mental_readiness_pre', label: 'Mental Readiness (Pre-session)', unit: '/10', min: 0, max: 10, step: 1, type: 'number', group: 'Psychological Link', description: 'Athlete self-rated psychological readiness before session' },
      { key: 'mental_readiness_post', label: 'Mental Readiness (Post-session)', unit: '/10', min: 0, max: 10, step: 1, type: 'number', group: 'Psychological Link' },
      { key: 'acwr', label: 'Acute:Chronic Workload Ratio', unit: '', min: 0, max: 3, step: 0.01, type: 'number', group: 'Load Management', description: 'Target 0.8–1.3 for optimal readiness. >1.5 = elevated injury risk' },
      { key: 'session_type', label: 'Session Type', type: 'select', options: ['Match', 'Full Training', 'Tactical Session', 'Technical Session', 'Fitness Session', 'Recovery Session', 'Pre-season', 'Rehabilitation'], group: 'Protocol' },
    ],
  },
  {
    id: 'cognitive_neurotracker',
    label: 'NeuroTracker 3D-MOT',
    vendor: 'CogniSens Athletics',
    icon: Target,
    color: '#0ea5e9',
    colorDim: '#f0f9ff',
    category: 'Cognitive Training',
    description: '3D multiple object tracking — measures & trains divided attention, visual processing speed & cognitive performance under load',
    radarKeys: ['Threshold Speed', 'Tracking Score', 'Correct Trials %', 'Dual Task Score', 'Session Gain'],
    trendKey: 'Threshold Speed',
    fields: [
      { key: 'threshold_speed', label: 'Threshold Speed', unit: 'THz', min: 0, max: 3, step: 0.01, type: 'number', group: 'Core Metrics', description: 'Speed at which athlete correctly tracks all targets — primary output. Higher = better. Norm: 1.0–1.5 THz for athletes' },
      { key: 'tracking_score_pct', label: 'Tracking Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Core Metrics', description: 'Overall session tracking accuracy' },
      { key: 'correct_trials', label: 'Correct Trials', unit: '', min: 0, max: 60, step: 1, type: 'number', group: 'Core Metrics' },
      { key: 'total_trials', label: 'Total Trials', unit: '', min: 0, max: 60, step: 1, type: 'number', group: 'Core Metrics' },
      { key: 'num_targets', label: 'Number of Targets', type: 'select', options: ['4 targets', '6 targets', '8 targets'], group: 'Protocol' },
      { key: 'dual_task_score_pct', label: 'Dual Task Performance Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Dual Task', description: 'Tracking accuracy while performing a secondary cognitive or motor task' },
      { key: 'dual_task_type', label: 'Dual Task Type', type: 'select', options: ['None (tracking only)', 'Verbal response', 'Decision making', 'Sport-specific skill', 'Arithmetic', 'Custom'], group: 'Dual Task' },
      { key: 'session_gain', label: 'Session Gain vs Baseline', unit: 'THz', min: -1, max: 1, step: 0.01, type: 'number', group: 'Progress', description: 'Change in threshold speed vs athlete personal baseline' },
      { key: 'fatigue_sensitivity', label: 'Fatigue Sensitivity Score', unit: '%', min: 0, max: 100, step: 1, type: 'number', group: 'Progress', description: 'Performance drop under cognitive fatigue — compare to rested baseline' },
      { key: 'session_mode', label: 'Session Mode', type: 'select', options: ['Standardised Assessment', 'Training Protocol', 'Dual Task Assessment', 'Post-Training Fatigue Check', 'Return-to-Sport Clearance'], group: 'Protocol' },
      { key: 'condition', label: 'Physical Condition', type: 'select', options: ['Rested', 'Post light training', 'Post moderate training', 'Post heavy training', 'Match day', 'Fatigued'], group: 'Protocol', description: 'Allows load-corrected interpretation of threshold speed' },
    ],
  },
]

const TECH_CATEGORIES = ['All', 'Psychophysiology', 'Neurostimulation', 'Cognitive Training', 'Neurocognition', 'Behavioural Tracking']

// ── Supabase hooks ─────────────────────────────────────────────────────────────

function useLabSessions(athleteId?: string, technology?: LabTechnology) {
  const { user } = useAuth()
  return useQuery<LabSession[]>({
    queryKey: ['lab_sessions', user?.id, athleteId, technology],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('lab_sessions')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('session_date', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      if (technology) q = q.eq('technology', technology)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LabSession[]
    },
  })
}

function useCreateLabSession() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<LabSession, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('lab_sessions')
        .insert({ ...payload, practitioner_id: user!.id, consent_given: payload.consent_given ?? false })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab_sessions'] }),
  })
}

// ── Score helpers ──────────────────────────────────────────────────────────────

function getScoreColor(value: number, field: FieldDef): string {
  if (field.min == null || field.max == null) return 'text-gray-700'
  const pct = ((value - field.min) / (field.max - field.min)) * 100
  // For "lower = better" fields we invert
  const lowerBetter = ['swm_errors', 'pal_errors', 'ied_errors', 'mean_fixation_duration', 'gaze_entropy', 'balance_cop_range_ml', 'balance_cop_range_ap', 'rtc_mean_rt', 'reaction_time_ms', 'fatigue_index', 'blink_rate', 'accel_high_count', 'decel_high_count', 'fatigue_sensitivity']
  const effective = lowerBetter.includes(field.key) ? 100 - pct : pct
  if (effective >= 70) return 'text-emerald-600'
  if (effective >= 40) return 'text-amber-600'
  return 'text-red-600'
}

function buildRadarData(sessions: LabSession[], tech: TechDef): object[] {
  if (!tech.radarKeys || sessions.length === 0) return []
  const latest = sessions[0]
  return tech.radarKeys.map(key => {
    const fieldKey = key.toLowerCase().replace(/[\s\-()%]/g, '_').replace(/_+/g, '_')
    const val = typeof latest.scores[fieldKey] === 'number' ? latest.scores[fieldKey] as number : 0
    // Normalise to 0–100 for radar
    const field = tech.fields.find(f => f.key === fieldKey)
    let normalised = val
    if (field?.min != null && field?.max != null && field.max !== field.min) {
      normalised = Math.round(((val - field.min) / (field.max - field.min)) * 100)
    }
    return { subject: key, value: Math.max(0, Math.min(100, normalised)) }
  })
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MentalPerformanceLabPage() {
  const { data: athletes = [] } = useAthletes()
  const [activeTech, setActiveTech] = useState<LabTechnology>('eeg_eego')
  const [filterAthlete, setFilterAthlete] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const tech = TECHNOLOGIES.find(t => t.id === activeTech)!
  const { data: sessions = [], isLoading } = useLabSessions(filterAthlete || undefined, activeTech)
  const filteredTechs = filterCategory === 'All' ? TECHNOLOGIES : TECHNOLOGIES.filter(t => t.category === filterCategory)

  const trendData = sessions
    .slice().reverse().slice(-12)
    .map(s => ({
      date: fmtDate(s.session_date),
      ...(tech.trendKey ? {
        [tech.trendKey]: typeof s.scores[tech.trendKey.toLowerCase().replace(/[\s\-()%]/g, '_')] === 'number'
          ? s.scores[tech.trendKey.toLowerCase().replace(/[\s\-()%]/g, '_')]
          : 0
      } : {}),
    }))

  return (
    <AppShell>
      <PageHeader
        title="Mental Performance Lab"
        subtitle={`${TECHNOLOGIES.length} gold-standard technologies · ${sessions.length} sessions recorded`}
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Log Session
          </Button>
        }
      />

      <div className="flex gap-5">
        {/* ── Technology Sidebar ──────────────────────────────────────────── */}
        <aside className={`shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-60'}`}>
          <div className="sticky top-0 space-y-1">
            {/* Category filter */}
            {!sidebarCollapsed && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1">
                  {TECH_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setFilterCategory(cat)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                        filterCategory === cat ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {cat === 'All' ? 'All' : cat.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredTechs.map(t => {
              const Icon = t.icon
              const isActive = activeTech === t.id
              return (
                <button key={t.id} onClick={() => setActiveTech(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive ? 'shadow-sm' : 'hover:bg-gray-100'
                  }`}
                  style={isActive ? { background: t.colorDim, color: t.color } : { color: '#374151' }}
                  title={sidebarCollapsed ? t.label : undefined}
                >
                  <Icon size={16} className="shrink-0" style={isActive ? { color: t.color } : {}} />
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{t.label}</p>
                      <p className="text-xs text-gray-400 truncate">{t.vendor}</p>
                    </div>
                  )}
                </button>
              )
            })}

            {/* Cross-link to Neurocognitive page for CANTAB / Senaptec */}
            <div className="mx-2 mb-2 mt-1 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-700 mb-0.5 flex items-center gap-1">
                <Brain size={10} /> Cognitive &amp; Senaptec Testing
              </p>
              <p className="text-xs text-blue-500 leading-snug">
                CANTAB, Senaptec &amp; neurocognitive assessments are logged under{' '}
                <a href="/neurocognitive" className="underline font-medium">Neurocognitive</a> in the sidebar.
              </p>
            </div>

            <button onClick={() => setSidebarCollapsed(v => !v)}
              className="w-full flex items-center justify-center gap-1 mt-1 text-xs text-gray-400 hover:text-gray-600 py-1">
              {sidebarCollapsed ? '→' : '← Collapse'}
            </button>
          </div>
        </aside>

        {/* ── Main Content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Tech Header */}
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: tech.colorDim }}>
                <tech.icon size={22} style={{ color: tech.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-gray-900">{tech.label}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                    {tech.vendor}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: tech.colorDim, color: tech.color }}>
                    {tech.category}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{tech.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
                <p className="text-xs text-gray-400">sessions</p>
              </div>
            </div>

            {/* Athlete filter */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
              <select value={filterAthlete} onChange={e => setFilterAthlete(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">All athletes</option>
                {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
              </select>
            </div>
          </Card>

          {/* Charts row */}
          {sessions.length >= 2 && (
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Radar — latest session profile */}
              {tech.radarKeys && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Target size={14} /> Latest Session Profile
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={buildRadarData(sessions, tech)} margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <Radar dataKey="value" stroke={tech.color} fill={tech.color} fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Trend line */}
              {tech.trendKey && trendData.length >= 2 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={14} /> {tech.trendKey} Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trendData} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey={tech.trendKey} stroke={tech.color} strokeWidth={2} dot={{ r: 3, fill: tech.color }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}

          {/* Session log */}
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<tech.icon size={48} />}
              title={`No ${tech.label} sessions yet`}
              action={<Button onClick={() => setModalOpen(true)}><Plus size={15} /> Log First Session</Button>}
            />
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <SessionCard key={session.id} session={session} tech={tech} athletes={athletes} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log Session Modal */}
      <LogSessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tech={tech}
        athletes={athletes}
        allTechs={TECHNOLOGIES}
        activeTech={activeTech}
        onTechChange={setActiveTech}
      />
    </AppShell>
  )
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session, tech, athletes }: {
  session: LabSession
  tech: TechDef
  athletes: any[]
}) {
  const [expanded, setExpanded] = useState(false)
  const athlete = athletes.find(a => a.id === session.athlete_id)
  const hasFlags = session.flags?.length > 0

  // Group fields by group
  const groups = tech.fields.reduce((acc: Record<string, FieldDef[]>, f) => {
    const g = f.group ?? 'Metrics'
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})

  return (
    <Card className={`overflow-hidden ${hasFlags ? 'border-amber-200' : ''}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: tech.colorDim }}>
          <tech.icon size={15} style={{ color: tech.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Unknown Athlete'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(session.session_date)}
            {session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
            {session.protocol ? ` · ${session.protocol}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasFlags && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle size={10} /> {session.flags.length} flag{session.flags.length > 1 ? 's' : ''}
            </span>
          )}
          {/* Show key metric */}
          {tech.trendKey && (() => {
            const key = tech.trendKey.toLowerCase().replace(/[\s\-()%]/g, '_').replace(/_+/g, '_')
            const val = session.scores[key]
            if (typeof val === 'number') {
              const field = tech.fields.find(f => f.key === key)
              return (
                <span className={`text-sm font-bold ${field ? getScoreColor(val, field) : 'text-gray-700'}`}>
                  {val}{field?.unit || ''}
                </span>
              )
            }
            return null
          })()}
          {'consent_given' in session && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${session.consent_given ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
              title={session.consent_given ? 'Consent confirmed' : 'No consent recorded'}>
              {session.consent_given ? '✓' : '!'}
            </span>
          )}
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-4">
          {Object.entries(groups).map(([groupName, fields]) => {
            const hasData = fields.some(f => session.scores[f.key] != null)
            if (!hasData) return null
            return (
              <div key={groupName}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{groupName}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {fields.map(field => {
                    const val = session.scores[field.key]
                    if (val == null) return null
                    return (
                      <div key={field.key} className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-500 truncate">{field.label}</p>
                        <p className={`text-sm font-bold ${typeof val === 'number' ? getScoreColor(val, field) : 'text-gray-700'}`}>
                          {typeof val === 'number' ? val : val as string}
                          {typeof val === 'number' && field.unit ? <span className="text-xs font-normal text-gray-400 ml-0.5">{field.unit}</span> : null}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {session.flags?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                <AlertCircle size={11} /> Clinical Flags
              </p>
              {session.flags.map((f, i) => (
                <p key={i} className="text-sm text-amber-800">⚠ {f}</p>
              ))}
            </div>
          )}

          {session.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Practitioner Notes</p>
              <p className="text-sm text-gray-700 italic">{session.notes}</p>
            </div>
          )}

          {/* ── Auto Results Summary ──────────────────────────────────── */}
          {Object.keys(session.scores ?? {}).length > 0 && (() => {
            const numericScores = Object.entries(session.scores as Record<string, any>)
              .filter(([, v]) => typeof v === 'number') as [string, number][]
            const textScores = Object.entries(session.scores as Record<string, any>)
              .filter(([, v]) => typeof v === 'string' && v.length > 0) as [string, string][]
            const highlights = tech.radarKeys ?? []
            const highlightEntries = highlights
              .map(key => {
                const fkey = key.toLowerCase().replace(/[\s\-()%]/g, '_').replace(/_+/g, '_')
                const val = (session.scores as Record<string, any>)[fkey]
                const field = tech.fields.find(f => f.key === fkey)
                return val != null ? { label: key, val, field } : null
              })
              .filter(Boolean) as { label: string; val: number | string; field?: FieldDef }[]
            if (highlightEntries.length === 0 && numericScores.length === 0) return null
            return (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <BarChart2 size={11} /> Results Summary
                </p>
                {highlightEntries.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {highlightEntries.map(({ label, val, field }) => (
                      <div key={label} className="text-center bg-gray-50 rounded-lg px-2 py-2">
                        <p className={`text-base font-black ${field && typeof val === 'number' ? getScoreColor(val, field) : 'text-gray-800'}`}>
                          {typeof val === 'number' ? val : val}
                          {field?.unit && <span className="text-xs font-normal text-gray-400 ml-0.5">{field.unit}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {textScores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {textScores.map(([k, v]) => (
                      <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {k.replace(/_/g, ' ')}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-400">
                  <span>{numericScores.length} numeric metrics · {textScores.length} categorical</span>
                  {session.consent_given
                    ? <span className="text-green-600 font-medium">✓ Consent on file</span>
                    : <span className="text-amber-600">⚠ No consent recorded</span>}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </Card>
  )
}

// ── Log Session Modal ─────────────────────────────────────────────────────────

function LogSessionModal({ open, onClose, tech, athletes, allTechs, activeTech, onTechChange }: {
  open: boolean
  onClose: () => void
  tech: TechDef
  athletes: any[]
  allTechs: TechDef[]
  activeTech: LabTechnology
  onTechChange: (t: LabTechnology) => void
}) {
  const createSession = useCreateLabSession()
  const [saving, setSaving] = useState(false)
  const [athleteId, setAthleteId] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState('')
  const [protocol, setProtocol] = useState('')
  const [notes, setNotes] = useState('')
  const [scores, setScores] = useState<Record<string, number | string>>({})
  const [flags, setFlags] = useState<string[]>([])
  const [flagInput, setFlagInput] = useState('')
  const [saveError, setSaveError] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const [importMode, setImportMode] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')

  // Reset scores when technology changes
  function handleTechChange(id: LabTechnology) {
    onTechChange(id)
    setScores({})
  }

  function setScore(key: string, val: number | string) {
    setScores(s => ({ ...s, [key]: val }))
  }

  function addFlag() {
    if (flagInput.trim()) {
      setFlags(f => [...f, flagInput.trim()])
      setFlagInput('')
    }
  }

  async function handleSave() {
    if (!athleteId) return
    setSaving(true)
    try {
      await createSession.mutateAsync({
        athlete_id: athleteId,
        technology: activeTech,
        session_date: sessionDate,
        duration_minutes: duration ? parseInt(duration) : undefined,
        protocol: protocol || undefined,
        scores,
        notes: notes || undefined,
        flags,
        consent_given: consentGiven,
      })
      // Reset
      setAthleteId(''); setScores({}); setNotes(''); setProtocol(''); setDuration('')
      setFlags([]); setConsentGiven(false); setImportMode(false); setImportText('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Group fields
  const currentTech = allTechs.find(t => t.id === activeTech)!
  const groups = currentTech.fields.reduce((acc: Record<string, FieldDef[]>, f) => {
    const g = f.group ?? 'Metrics'
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})

  return (
    <Modal open={open} onClose={onClose} title="Log Lab Session" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Technology selector */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Technology</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {allTechs.map(t => {
              const Icon = t.icon
              const isActive = activeTech === t.id
              return (
                <button key={t.id} onClick={() => handleTechChange(t.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 text-left transition-all ${
                    isActive ? 'shadow-sm' : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={isActive ? { borderColor: t.color, background: t.colorDim } : {}}>
                  <Icon size={14} style={isActive ? { color: t.color } : { color: '#6b7280' }} />
                  <span className={`text-xs font-medium truncate ${isActive ? '' : 'text-gray-600'}`}
                    style={isActive ? { color: t.color } : {}}>
                    {t.label.split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Basics */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Athlete *</label>
            <select value={athleteId} onChange={e => setAthleteId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Select athlete —</option>
              {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
            </select>
          </div>
          <Input label="Session Date" type="date" value={sessionDate}
            onChange={e => setSessionDate((e.target as HTMLInputElement).value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Duration (min)" type="number" value={duration}
            onChange={e => setDuration((e.target as HTMLInputElement).value)} placeholder="e.g. 30" />
          <Input label="Protocol / Task Name" value={protocol}
            onChange={e => setProtocol((e.target as HTMLInputElement).value)}
            placeholder={`e.g. ${currentTech.fields.find(f => f.type === 'select')?.options?.[0] ?? 'Protocol name'}`} />
        </div>

        {/* Scores by group */}
        <div className="max-h-72 overflow-y-auto space-y-4 pr-1 border border-gray-100 rounded-xl p-4">
          {Object.entries(groups).map(([groupName, fields]) => (
            <div key={groupName}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{groupName}</p>
              <div className="grid grid-cols-2 gap-2">
                {fields.map(field => (
                  <div key={field.key}>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      {field.label}
                      {field.unit && <span className="text-gray-400 ml-1">({field.unit})</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={(scores[field.key] as string) ?? ''}
                        onChange={e => setScore(field.key, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">— Select —</option>
                        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={(scores[field.key] as number) ?? ''}
                        onChange={e => setScore(field.key, parseFloat(e.target.value) || 0)}
                        placeholder={field.description ?? `${field.min ?? ''}–${field.max ?? ''}`}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    )}
                    {field.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{field.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Clinical flags */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Clinical Flags</label>
          <div className="flex gap-2">
            <input value={flagInput} onChange={e => setFlagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFlag()}
              placeholder="Type a concern and press Enter…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <Button variant="secondary" onClick={addFlag} className="shrink-0">Add</Button>
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {flags.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  ⚠ {f}
                  <button onClick={() => setFlags(fl => fl.filter((_, j) => j !== i))} className="text-amber-500 hover:text-amber-800">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Practitioner Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Observations, context, interpretation…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        {/* ── Consent ───────────────────────────────────────────────── */}
        <div className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${consentGiven ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <button
            onClick={() => setConsentGiven(v => !v)}
            className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${consentGiven ? 'bg-green-500 border-green-500' : 'border-amber-400 bg-white'}`}
          >
            {consentGiven && <CheckCircle size={11} className="text-white" />}
          </button>
          <div>
            <p className={`text-xs font-semibold mb-0.5 ${consentGiven ? 'text-green-700' : 'text-amber-700'}`}>
              {consentGiven ? '✓ Athlete consent confirmed for this technology'
                           : '⚠ Consent not yet confirmed — required before administering'}
            </p>
            <p className={`text-xs leading-snug ${consentGiven ? 'text-green-600' : 'text-amber-600'}`}>
              Athlete has been informed about {currentTech.label}, its purpose, data use, and their right to withdraw.
            </p>
          </div>
        </div>

        {/* ── Import from platform export ────────────────────────────── */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setImportMode(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Upload size={14} className="text-gray-400" />
              Import from {currentTech.vendor} export
            </span>
            <span className="text-xs text-gray-400">{importMode ? '▲ Hide' : '▼ Paste data'}</span>
          </button>
          {importMode && (
            <div className="p-4 space-y-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 leading-relaxed">
                Paste exported data from <strong>{currentTech.vendor}</strong>. Accepts CSV (field,value per line) or JSON. Field names are matched automatically.
              </p>
              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportError('') }}
                rows={5}
                placeholder={`CSV example:\nalpha_power,45.2\nbeta_power,23.1\nattention_index,72\n\nJSON example:\n{ "alpha_power": 45.2, "beta_power": 23.1 }`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {importError && <p className="text-xs text-red-600">{importError}</p>}
              <Button variant="secondary" onClick={() => {
                try {
                  let parsed: Record<string, string | number> = {}
                  const t = importText.trim()
                  if (t.startsWith('{')) {
                    parsed = JSON.parse(t)
                  } else {
                    t.split('\n').forEach(line => {
                      const parts = line.split(',')
                      if (parts.length >= 2) {
                        const key = parts[0].trim().toLowerCase().replace(/[\s\-\/]+/g, '_')
                        const num = parseFloat(parts[1].trim())
                        parsed[key] = isNaN(num) ? parts[1].trim() : num
                      }
                    })
                  }
                  const validKeys = new Set(currentTech.fields.map(f => f.key))
                  const matched: string[] = []
                  const ns = { ...scores }
                  Object.entries(parsed).forEach(([k, v]) => { if (validKeys.has(k)) { ns[k] = v; matched.push(k) } })
                  setScores(ns)
                  if (matched.length > 0) { setImportMode(false); setImportError('') }
                  else setImportError('No matching fields found. Check field names match this technology definition.')
                } catch { setImportError('Parse error — use CSV (field,value) or valid JSON.') }
              }} className="w-full">
                <FileText size={13} /> Parse & Import Fields
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!athleteId}
            style={{ background: currentTech.color }}>
            <CheckCircle size={14} /> Save Session
          </Button>
        </div>
      </div>
    </Modal>
  )
}
