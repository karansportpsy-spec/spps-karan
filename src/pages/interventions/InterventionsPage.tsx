// src/pages/InterventionsPage.tsx
// Comprehensive Interventions Hub:
//   Tab 1 — Evidence-Based Library  (12 frameworks from PDF + detail modal)
//   Tab 2 — Protocol Builder         (custom multi-session protocol per athlete)
//   Tab 3 — My Interventions         (existing log, enhanced)

import React, { useState } from 'react'
import {
  Plus, Lightbulb, Star, BookOpen, Layers, ClipboardList,
  ChevronDown, ChevronUp, CheckCircle, X, Brain, Wind,
  Target, Users, Heart, Zap, Shield, Activity, Sparkles,
  Clock, FileText, AlertTriangle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Avatar, Modal, Select, Input, Textarea, Spinner, EmptyState } from '@/components/ui'
import { useInterventions, useCreateIntervention, useUpdateIntervention } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import type { InterventionCategory, Intervention } from '@/types'
import {
  addInterventionProgress,
  assignInterventionProgram,
  getInterventionAssignments,
  type InterventionAssignment,
} from '@/services/interventionsApi'

const EVIDENCE_COLORS: Record<string, string> = {
  'Strong':       'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Moderate':     'bg-blue-100 text-blue-700 border-blue-200',
  'Limited':      'bg-amber-100 text-amber-700 border-amber-200',
  'Experimental': 'bg-rose-100 text-rose-700 border-rose-200',
}

const FRAMEWORKS = [
  {
    id: 'pst_cbt',
    name: 'PST / Cognitive-Behavioural Skills Training',
    shortName: 'PST / CBT',
    icon: Brain,
    color: 'bg-purple-100 text-purple-700',
    accent: '#7c3aed',
    category: 'Cognitive Restructuring' as InterventionCategory,
    evidence: 'Strong',
    duration: '6–12 sessions',
    population: 'All levels (esp. youth, individual-sport athletes)',
    theory: 'Grounded in Bandura, Beck, and Ellis. Assumes changing maladaptive thought patterns leads to improved emotion regulation and performance consistency.',
    goals: [
      'Enhance self-confidence, focus, and coping',
      'Reduce anxiety and maladaptive cognitions',
      'Build mental resilience and performance consistency',
    ],
    techniques: [
      { name: 'Goal Setting', desc: 'SMART performance/process goals (Locke & Latham). Athletes set specific targets per competition and track progress.' },
      { name: 'Imagery / Visualisation', desc: 'Mental rehearsal using PETTLEP model — physical, environment, task, timing, learning, emotion, perspective.' },
      { name: 'Self-Talk', desc: 'Instructional and motivational self-cues. Replace negative internal dialogue with constructive phrases.' },
      { name: 'Relaxation / PMR', desc: 'Progressive Muscle Relaxation (Jacobson). Paired with imagery for arousal control.' },
      { name: 'Cognitive Restructuring / REBT', desc: 'Dispute irrational beliefs using Rational Emotive Behaviour Therapy framework.' },
      { name: 'Concentration Training', desc: 'Attentional drills, cueing techniques to maintain focus under pressure.' },
      { name: 'Pressure Exposure', desc: 'Simulated high-stakes practice to desensitise and build coping automaticity.' },
    ],
    delivery: 'Individual or small-group. 30–90 min sessions. Homework reinforces between-session learning. Face-to-face and telehealth formats.',
    evidence_detail: 'Meta-analyses find PST yields largest effect size for reducing competitive anxiety (SMD ≈ –1.20), outperforming CBT (–0.85) or mindfulness (–0.55). Many RCTs support benefits.',
    use_cases: 'Pre-competition anxiety, performance slumps, confidence deficits, focus problems, injury coping.',
    example: '10-session group PST with Spanish junior rowers: arousal management, concentration, goal-setting, imagery, and PMR — improved stress control and performance readiness.',
    sessionTemplate: [
      'Session 1: Psychoeducation — introducing the CBT model, link between thoughts, feelings, performance',
      'Session 2: Goal Setting — SMART goal framework, competition goals and season targets',
      'Session 3: Self-Talk — identifying negative patterns, developing personalised cue words',
      'Session 4: Imagery — PETTLEP introduction, guided skill rehearsal script',
      'Session 5: PMR — progressive muscle relaxation training, pairing with breathing',
      'Session 6: Concentration — attentional drills, focus cues for competition',
      'Session 7: Cognitive Restructuring — identifying irrational beliefs (REBT)',
      'Session 8: Pressure Exposure — simulated high-stakes practice, coping rehearsal',
      'Session 9: Pre-competition routine — integrating all skills into a personal routine',
      'Session 10: Review, maintenance planning, and transfer to independent practice',
    ],
  },
  {
    id: 'mindfulness_act',
    name: 'Mindfulness & Acceptance-Based Approaches',
    shortName: 'Mindfulness / ACT',
    icon: Wind,
    color: 'bg-teal-100 text-teal-700',
    accent: '#0d9488',
    category: 'Mindfulness' as InterventionCategory,
    evidence: 'Moderate',
    duration: '6–8 weeks',
    population: 'All levels; especially older/elite athletes and those with chronic stress',
    theory: 'Derived from MBSR (Kabat-Zinn) and third-wave CBT (ACT — Hayes et al.). Emphasises non-judgmental present-moment awareness and psychological flexibility rather than thought suppression.',
    goals: [
      'Reduce maladaptive rumination and performance anxiety',
      'Increase psychological flexibility — accept anxiety and redirect focus',
      'Enhance concentration and flow state access',
      'Improve mental health (burnout reduction, anxiety, depression)',
    ],
    techniques: [
      { name: 'Mindfulness Meditation', desc: 'Guided body scans, mindful breathing, sitting meditation (8–40 min daily).' },
      { name: 'Values Clarification (ACT)', desc: 'Identify core personal values beyond winning. Link daily actions to values.' },
      { name: 'Cognitive Defusion', desc: '"Leaves on a stream" exercise — observing thoughts without engaging.' },
      { name: 'Acceptance Exercises', desc: 'Practice noticing anxious sensations without trying to change them.' },
      { name: 'Committed Action', desc: 'Set behaviour goals in line with values. Overlap with goal-setting framework.' },
      { name: 'Mindful Skill Practice', desc: 'Perform sport skills with full sensory awareness.' },
      { name: 'Mindful Movement', desc: 'Yoga or Qigong integrated with physical training for body awareness.' },
    ],
    delivery: 'Group-based (6–8 weekly sessions, 1–2 hrs) + daily at-home practice. MAC protocol runs 7 weeks.',
    evidence_detail: 'Systematic reviews show moderate anxiety reduction (SMD ≈ –0.55). Mindfulness-Based Mental Training improved soccer players mental toughness. ACT preliminary trials indicate effective coping under pressure.',
    use_cases: 'Chronic performance anxiety, perfectionism, burnout, athlete depression, injury adaptation, pre-event centring.',
    example: '8-week MAC programme with collegiate athletes: meditation, values work, defusion exercises — reduced cognitive interference and improved competition focus.',
    sessionTemplate: [
      'Session 1: Introduction to mindfulness — psychoeducation, 5-min breathing exercise',
      'Session 2: Body scan — full 20-min body scan, discussion of sensations in sport',
      'Session 3: Mindful movement — awareness during physical warm-up',
      'Session 4: ACT — values clarification. What do you want your sport to stand for?',
      'Session 5: Cognitive defusion — "leaves on a stream," labelling thoughts without engaging',
      'Session 6: Acceptance — sitting with uncomfortable sensations; anxiety as normal',
      'Session 7: Committed action — linking values to this week\'s training behaviours',
      'Session 8: Integration — personal mindfulness routine, maintenance and independent practice',
    ],
  },
  {
    id: 'relaxation',
    name: 'Relaxation & Psychophysiological Regulation',
    shortName: 'Relaxation / PMR',
    icon: Heart,
    color: 'bg-blue-100 text-blue-700',
    accent: '#2563eb',
    category: 'Relaxation' as InterventionCategory,
    evidence: 'Moderate',
    duration: '4–8 sessions + ongoing practice',
    population: 'All athletes; especially useful for over-aroused, pre-performance anxiety',
    theory: 'Assumes regulating breathing, muscle tension, and autonomic arousal directly reduces somatic anxiety and optimises performance state. Based on Jacobson PMR and Schultz Autogenic Training.',
    goals: [
      'Reduce somatic anxiety (heart rate, muscle tension)',
      'Facilitate physiological recovery between training loads',
      'Enhance self-regulation and pre-performance readiness',
      'Develop portable calming techniques for competition',
    ],
    techniques: [
      { name: 'Progressive Muscle Relaxation (PMR)', desc: 'Systematic tensing/releasing of 16 muscle groups (Jacobson). Reduces chronic tension and improves body awareness.' },
      { name: 'Diaphragmatic Breathing', desc: '4-7-8 or box breathing protocols. Directly activates parasympathetic response.' },
      { name: 'Autogenic Training', desc: 'Self-statements focusing on warmth and heaviness. Self-hypnosis for deep relaxation.' },
      { name: 'Applied Relaxation (AR)', desc: 'Condensed PMR to a 20–30s cued response, applicable in-competition.' },
      { name: 'Cue-Controlled Relaxation', desc: 'Pair a trigger word ("calm", "release") with relaxed state through repeated pairing.' },
    ],
    delivery: 'Individual teaching followed by independent daily practice (10–20 min). Audio guides support home practice.',
    evidence_detail: 'Relaxation training reliably reduces anxiety and muscle tension with moderate effect sizes. Recognised as a core PST component.',
    use_cases: 'Pre-performance jitters, between-event recovery, pain management in injury rehab, precision sports.',
    example: 'Shooting athlete: 6-session PMR condensed to competition-ready 20-second routine triggered by keyword "settle" before each shot.',
    sessionTemplate: [
      'Session 1: Education — the relaxation response, mind-body link, arousal zones',
      'Session 2: Full PMR — 16 muscle group sequence, 20–30 min (audio guide recorded)',
      'Session 3: Shortened PMR — 8 muscle groups, 10–15 min. Adding breathing pacer',
      'Session 4: Applied relaxation — 4 muscle groups, 2–3 min. Cue word introduction',
      'Session 5: Competition simulation — practice routine in pre-performance context',
      'Session 6: Mastery and maintenance — 20–30 sec competition version. Independent schedule',
    ],
  },
  {
    id: 'imagery',
    name: 'Imagery & Visualisation',
    shortName: 'Imagery',
    icon: Sparkles,
    color: 'bg-indigo-100 text-indigo-700',
    accent: '#4f46e5',
    category: 'Imagery' as InterventionCategory,
    evidence: 'Moderate',
    duration: 'Ongoing (5–15 min daily routines)',
    population: 'All athletes; especially skill acquisition and injury rehab phases',
    theory: 'Psychoneuromuscular theory (imagined movements activate motor pathways) and symbolic learning theory (imagery encodes strategy). PETTLEP model provides structured framework.',
    goals: [
      'Enhance skill learning, automaticity and technical consistency',
      'Build confidence through mental success rehearsal',
      'Rehearse competitive scenarios and coping responses',
      'Maintain neural pathways during injury rehabilitation',
    ],
    techniques: [
      { name: 'PETTLEP Imagery', desc: 'Physical, Environment, Task, Timing, Learning, Emotion, Perspective — structured multi-sensory framework.' },
      { name: 'Guided Imagery Scripts', desc: 'Narrated multi-sensory visualisations covering sights, sounds, kinaesthetic feelings, emotions.' },
      { name: 'Coping Imagery', desc: 'Rehearse handling errors, adversity, distraction — not just perfect performance.' },
      { name: 'Motivational Imagery', desc: 'Imagine achieving goals, experiencing success to boost drive.' },
      { name: 'Healing Imagery', desc: 'For injured athletes — visualise repair process, gradual return to training.' },
      { name: 'Combination Imagery', desc: 'Mental rehearsal immediately preceding physical practice for maximum transfer.' },
    ],
    delivery: 'Taught in sessions, practised independently daily. Pre-sleep or pre-training timing. Audio scripts support self-practice.',
    evidence_detail: 'Multiple meta-analyses show positive effects on performance (especially combined with physical practice). Considered an evidence-based core technique.',
    use_cases: 'Pre-competition mental preparation, skill acquisition, returning from injury, confidence after performance failures.',
    example: 'Paralympic swimmer: daily 10-min pre-sleep PETTLEP imagery — maintained technique during lockdown with no pool access.',
    sessionTemplate: [
      'Session 1: Imagery assessment — vividness questionnaire (MIQ-R), determine primary modality',
      'Session 2: Basic imagery — relaxation induction, simple kinaesthetic imagery',
      'Session 3: PETTLEP framework — build full sport-specific script with physical object',
      'Session 4: Performance imagery — complete pre-competition routine in real time',
      'Session 5: Coping imagery — rehearse handling a mistake, distraction, poor conditions',
      'Session 6: Combination — mental rehearsal immediately before physical skill practice',
      'Session 7: Daily routine — design personal 5–10 min pre-sleep or pre-training imagery plan',
    ],
  },
  {
    id: 'goal_setting',
    name: 'Goal Setting & Motivational Interviewing',
    shortName: 'Goal Setting / MI',
    icon: Target,
    color: 'bg-emerald-100 text-emerald-700',
    accent: '#059669',
    category: 'Goal Setting' as InterventionCategory,
    evidence: 'Strong',
    duration: 'Ongoing (season-long)',
    population: 'Universal — all athletes, all levels',
    theory: 'Locke & Latham Goal-Setting Theory: specific, challenging goals increase motivation by directing effort and persistence. MI (Miller & Rollnick) elicits intrinsic motivation through autonomy-support.',
    goals: [
      'Direct and sustain effort toward performance targets',
      'Build performance and process goal hierarchies',
      'Resolve motivational ambivalence (MI)',
      'Align training behaviour with athlete values',
    ],
    techniques: [
      { name: 'SMART Goal Framework', desc: 'Specific, Measurable, Achievable, Relevant, Time-bound goals with monitoring schedule.' },
      { name: 'Goal Hierarchy', desc: 'Outcome goals → Performance goals → Process goals. Daily training focus via process goals.' },
      { name: 'Goal Monitoring Log', desc: 'Weekly review of progress. Adjust goals when circumstances change.' },
      { name: 'Motivational Interviewing (OARS)', desc: 'Open questions, Affirmations, Reflective listening, Summarising. Used when motivation has lapsed.' },
      { name: 'Vision Board / Goal Card', desc: 'Visual representation of season objectives carried as daily reminder.' },
    ],
    delivery: 'Sessions at season start, key transition points, and when motivation drops. MI: 1–4 individual sessions.',
    evidence_detail: 'Strong — meta-analyses across hundreds of studies find goal-setting reliably enhances performance. MI has strong evidence for health behaviour change.',
    use_cases: 'Season planning, motivation dips, training adherence, return from injury, career transition planning.',
    example: 'AIFF U17 pre-season: team goal-setting workshop — outcome (tournament qualification), performance (pass completion %), and process (first-touch quality) goals.',
    sessionTemplate: [
      'Session 1: Values and vision — what does success mean to this athlete beyond results?',
      'Session 2: Goal audit — review current goals, assess progress, identify gaps',
      'Session 3: SMART goal-setting — set 1 outcome, 2 performance, 3 process goals for next block',
      'Session 4: MI session — if motivational barriers present, OARS-based counselling',
      'Session 5: Monitoring system — weekly log, who reviews, how to adjust',
      'Session 6: Mid-point review — adapt goals to new information, renew commitment',
    ],
  },
  {
    id: 'self_talk',
    name: 'Self-Talk Intervention',
    shortName: 'Self-Talk',
    icon: Zap,
    color: 'bg-amber-100 text-amber-700',
    accent: '#d97706',
    category: 'Confidence Building' as InterventionCategory,
    evidence: 'Moderate',
    duration: 'Integrated into training (habit-building)',
    population: 'All athletes; especially those with distraction, confidence, or technical errors',
    theory: 'Cognitive and attentional theories. Instructional self-talk directs attention to technical cues; motivational self-talk regulates effort and confidence.',
    goals: [
      'Develop constructive internal dialogue patterns',
      'Counter automatic negative thoughts under pressure',
      'Direct attention to task-relevant technical cues',
      'Sustain effort during fatigue and adversity',
    ],
    techniques: [
      { name: 'Thought Monitoring', desc: 'Athlete logs automatic thoughts during training using thought diary. Identifies negative patterns.' },
      { name: 'Cue Word Development', desc: 'Short, personal trigger words ("smooth", "strong", "breathe"). Linked to specific technical cues.' },
      { name: 'Thought Stopping', desc: 'Physical interrupt (wristband snap, fist clench) paired with mental reset and positive replacement.' },
      { name: 'Reframing', desc: 'Transform negative self-statements: "I keep making mistakes" → "I am noticing what to adjust."' },
      { name: 'If-Then Plans', desc: '"If I feel anxious at the free-throw line, then I say \'slow breath and smooth\' before shooting."' },
    ],
    delivery: 'Taught in 2–4 sessions, practised continuously in training. Athletes self-monitor. Brief refresher at high-pressure periods.',
    evidence_detail: 'Meta-analysis (Hatzigeorgiadis et al., 2011) — strategic self-talk improves sport task performance. Instructional self-talk more effective for technique; motivational for endurance.',
    use_cases: 'Pre-competition routine, technical focus during skill execution, resilience during performance slumps, fatigue management.',
    example: 'Elite basketball player: identified "this is over" as trigger thought after missed shots. Replaced with "next play" + wristband touch. Significant reduction in post-error anxiety.',
    sessionTemplate: [
      'Session 1: Psychoeducation — thought-performance link. Athlete completes thought monitoring diary for one week',
      'Session 2: Pattern analysis — review diary, identify top 3 negative self-talk patterns',
      'Session 3: Cue word design — develop 2–3 personal cue words. Pair with technical focus points',
      'Session 4: Thought stopping — practise interrupt strategy in simulated pressure conditions',
      'Session 5: If-Then plans — write implementation intentions for top 3 trigger situations',
    ],
  },
  {
    id: 'team_cohesion',
    name: 'Team & Systemic Interventions',
    shortName: 'Team Cohesion',
    icon: Users,
    color: 'bg-orange-100 text-orange-700',
    accent: '#ea580c',
    category: 'Team Cohesion' as InterventionCategory,
    evidence: 'Moderate',
    duration: 'Single events to season-long',
    population: 'Team-sport athletes; all ages; relay squads',
    theory: "Carron's Team Cohesion Model distinguishes task cohesion (working toward common goals) and social cohesion (interpersonal bonds). Both independently predict performance.",
    goals: [
      'Improve task and social cohesion within the team',
      'Clarify roles and responsibilities',
      'Develop communication and conflict resolution skills',
      'Build collective efficacy and shared vision',
    ],
    techniques: [
      { name: 'Team Goal-Setting Workshop', desc: 'Collective outcome, performance and process goals with shared ownership.' },
      { name: 'Performance Profiling (Group)', desc: 'Each member identifies team strengths/areas for growth. Facilitates mutual support.' },
      { name: 'Role Clarification', desc: 'Each player documents their role contribution. Coach validates and acknowledges.' },
      { name: 'Communication Training', desc: 'Active listening exercises, giving/receiving feedback, in-game communication protocols.' },
      { name: 'Trust Activities', desc: 'Problem-solving tasks requiring collaboration. Off-field bonding activities.' },
      { name: 'Conflict Resolution Protocol', desc: 'Structured process for addressing interpersonal issues.' },
    ],
    delivery: 'Group workshops (half-day to multi-day). Retreats, pre-season camps. Monthly sessions throughout season.',
    evidence_detail: 'Meta-analyses show moderate improvements in team cohesion. Evidence for direct performance gains is weaker. Consensus is that team processes are foundational.',
    use_cases: 'Preseason vision-setting, post-conflict resolution, leadership development, new team formation.',
    example: 'Indian women\'s hockey team: preseason 2-day retreat — team goals, role clarification, communication drills. Followed by monthly 30-min cohesion check-ins.',
    sessionTemplate: [
      'Session 1: Team vision — where do we want to be at end of season? Values mapping exercise',
      'Session 2: Team goal-setting — collective outcome, performance, and process goals',
      'Session 3: Role clarification — each player documents their unique contribution. Group sharing',
      'Session 4: Communication workshop — feedback skills, in-game communication, conflict protocol',
      'Session 5: Trust activities — collaborative problem-solving, bonding exercise',
      'Session 6: Mid-season review — assess cohesion, address conflicts, renew commitment',
    ],
  },
  {
    id: 'biofeedback',
    name: 'Biofeedback & HRV Training',
    shortName: 'Biofeedback',
    icon: Activity,
    color: 'bg-cyan-100 text-cyan-700',
    accent: '#0891b2',
    category: 'Relaxation' as InterventionCategory,
    evidence: 'Limited',
    duration: '4–8 weeks (1–2x/week)',
    population: 'Usually elite or tech-motivated athletes; precision sports (shooting, archery)',
    theory: 'Providing real-time physiological signals (HRV, EMG, skin conductance) enables operant conditioning of autonomic self-regulation. Athletes learn to modify internal states by observing feedback.',
    goals: [
      'Train autonomic nervous system to increase HRV (parasympathetic activation)',
      'Reduce muscle tension and somatic anxiety',
      'Build self-regulation skills transferable to competition',
      'Accelerate recovery between training sessions',
    ],
    techniques: [
      { name: 'HRV Biofeedback', desc: 'Heart rate sensor + software. Practise resonance-frequency breathing (5–6 breaths/min) to maximise HRV coherence.' },
      { name: 'EMG Biofeedback', desc: 'Surface electrodes measure muscle tension. Athlete practises releasing tension guided by visual feedback.' },
      { name: 'Skin Conductance (GSR)', desc: 'Real-time stress arousal indicator. Athlete practises relaxation and watches GSR decrease.' },
      { name: 'Neurofeedback (EEG)', desc: 'Experimental — athlete trains specific brainwave patterns (alpha for relaxed focus).' },
      { name: 'HRV App Practice', desc: 'Consumer devices (HeartMath emWave, EliteHRV) for between-session practice.' },
    ],
    delivery: 'Individual sessions with specialised equipment. Home practice via consumer wearables. 30–60 min sessions.',
    evidence_detail: 'HRV biofeedback has clinical support for stress management. Small sport studies show benefits. Neurofeedback is experimental.',
    use_cases: 'Precision sports pre-performance regulation, post-training recovery optimisation, concentration enhancement.',
    example: 'Elite rifle shooter: 6-week HRV biofeedback — achieved resonance breathing within 3 sessions, coherence score improved 40%.',
    sessionTemplate: [
      'Session 1: Assessment — baseline HRV measurement, psychoeducation on autonomic nervous system',
      'Session 2: Resonance breathing — find personal resonance frequency (typically 5–6 breaths/min)',
      'Session 3: HRV coherence training — 20-min biofeedback session, practice achieving coherence',
      'Session 4: Competition simulation — biofeedback during performance-pressure scenarios',
      'Session 5: Transfer — wearable device setup, between-session practice protocol',
      'Session 6: Review — HRV trends over programme, refinements, maintenance schedule',
    ],
  },
  {
    id: 'act',
    name: 'Acceptance & Commitment Therapy (ACT)',
    shortName: 'ACT',
    icon: Shield,
    color: 'bg-rose-100 text-rose-700',
    accent: '#e11d48',
    category: 'Mindfulness' as InterventionCategory,
    evidence: 'Moderate',
    duration: '6–12 sessions',
    population: 'Athletes with chronic stress, perfectionism, or clinical anxiety/depression',
    theory: 'Third-wave CBT (Hayes et al.). Emphasises psychological flexibility — the ability to maintain effective action in the presence of difficult thoughts and feelings, based on Relational Frame Theory.',
    goals: [
      'Increase psychological flexibility under pressure',
      'Foster values-based commitment over outcome-focused performance',
      'Reduce experiential avoidance and unhelpful coping',
      'Act effectively alongside difficult thoughts rather than suppressing them',
    ],
    techniques: [
      { name: 'Values Clarification', desc: 'Identify 3–5 core values. Link daily actions explicitly to values.' },
      { name: 'Cognitive Defusion', desc: '"Leaves on a stream" — watch thoughts float past. "I notice I am having the thought…" technique.' },
      { name: 'Present-Moment Awareness', desc: 'Mindfulness exercises focused on sensory contact with the present competition environment.' },
      { name: 'Self-as-Context', desc: '"Observer self" — distinguish between the self that experiences thoughts and the thoughts themselves.' },
      { name: 'Committed Action', desc: 'Set specific values-aligned behaviour goals. Focus on what athlete CAN do.' },
      { name: 'Willingness', desc: 'Practice "opening up" to anxiety as a normal part of competing rather than fighting it.' },
    ],
    delivery: 'Individual or small-group therapy. 6–12 sessions, 50–60 min. MAC sport-specific protocol: 7 weeks.',
    evidence_detail: 'Clinical ACT evidence strong. Within sport, controlled trials show promise. Listed alongside PST as effective for athlete wellbeing in meta-reviews.',
    use_cases: 'Perfectionism, "freezing" under pressure, chronic anxiety, athlete burnout, injury adaptation, return-to-sport fear.',
    example: 'Gymnast with fear of failure after a fall: 8-session ACT — defusing from "I will fall again", values clarification, committed action. Successfully returned to competition.',
    sessionTemplate: [
      'Session 1: Creative hopelessness — explore how fighting anxiety has not worked. Introduce ACT model',
      'Session 2: Values — identify core values. "Tombstone" exercise',
      'Session 3: Defusion — "leaves on stream," "I notice I am having the thought that..."',
      'Session 4: Present-moment — mindfulness in sport context. Senses exercise at training venue',
      'Session 5: Self-as-context — observer perspective. Distinguish self from thoughts',
      'Session 6: Acceptance — willingness exercise. Practice opening up to anxiety',
      'Session 7: Committed action — values-based weekly behaviour goals',
      'Session 8: Review and maintenance — personal ACT practice plan for competition',
    ],
  },
  {
    id: 'life_skills',
    name: 'Developmental & Life Skills Interventions',
    shortName: 'Life Skills',
    icon: Lightbulb,
    color: 'bg-lime-100 text-lime-700',
    accent: '#65a30d',
    category: 'Other' as InterventionCategory,
    evidence: 'Moderate',
    duration: 'Season-long',
    population: 'Youth and adolescent athletes; career transition (retirement)',
    theory: "Positive Youth Development (PYD) theory and Danish et al.'s Life Development Intervention (LDI). Sport as a context for teaching transferable life skills.",
    goals: [
      'Develop personal and social skills transferable outside sport',
      'Build healthy athlete identity and resilience',
      'Support smooth transitions (junior-to-senior, injury, retirement)',
      'Promote responsibility, leadership, and community connection',
    ],
    techniques: [
      { name: 'Psychoeducational Workshops', desc: 'Sessions on stress management, nutrition, time management, career planning.' },
      { name: 'Mentoring & Reflection', desc: 'Structured debrief after competitions — what life skills did we practise today?' },
      { name: 'Service Projects', desc: 'Community service builds empathy, perspective, and leadership beyond sport identity.' },
      { name: 'Career Transition Planning', desc: 'For senior athletes: dual-career planning, retirement preparation, identity broadening.' },
      { name: 'Leadership Development', desc: 'Identified athletes take on leadership tasks and mentor younger teammates.' },
    ],
    delivery: 'Group workshops integrated into regular training. Season-long. Coaches, sport psychologists, or allied professionals.',
    evidence_detail: 'Systematic reviews show sport-based programmes improve youth life skills and psychosocial outcomes. Gains in cooperation, self-control, and cognitive skills.',
    use_cases: 'Youth development, elite academy pastoral care, athlete retirement/transition support.',
    example: 'SAI residential academy: weekly 45-min life skills module — time management, communication, study skills, financial literacy. 6-month programme.',
    sessionTemplate: [
      'Module 1: Self-awareness — strengths, values, how sport shapes my identity',
      'Module 2: Stress management — recognising stress, healthy coping strategies',
      'Module 3: Communication — active listening, assertiveness, conflict resolution',
      'Module 4: Goal setting for life — academic, career, relationship goals alongside sport goals',
      'Module 5: Decision making — values-based decisions, peer pressure, integrity',
      'Module 6: Leadership — what kind of leader/teammate do I want to be?',
      'Module 7: Community and service — giving back, perspective, dual identity',
      'Module 8: Transitions — planning for injury, form dips, career change, retirement',
    ],
  },
  {
    id: 'emdr',
    name: 'EMDR (Trauma-Focused)',
    shortName: 'EMDR',
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-700',
    accent: '#dc2626',
    category: 'Crisis Protocol' as InterventionCategory,
    evidence: 'Limited',
    duration: '5–10 sessions',
    population: 'Clinically indicated only — athletes with trauma or extreme performance blocks',
    theory: 'Eye Movement Desensitisation and Reprocessing (Shapiro). Bilateral stimulation while recalling a distressing memory reduces its emotional charge through Adaptive Information Processing (AIP).',
    goals: [
      'Desensitise traumatic sports memories (crashes, injuries, abuse)',
      'Reprocess distorted beliefs linked to traumatic events',
      'Remove paralyzing anxiety blocks to performance',
    ],
    techniques: [
      { name: '8-Phase EMDR Protocol', desc: 'History-taking → Preparation → Assessment → Desensitisation → Installation → Body Scan → Closure → Re-evaluation.' },
      { name: 'Bilateral Stimulation', desc: 'Eye movements, audio tones, or hand taps. Delivered by trained practitioner during memory processing.' },
      { name: 'Sport-Specific Adaptation', desc: 'Target memories of specific performance failures, injuries, or traumatic competitive experiences.' },
    ],
    delivery: 'Individual therapy. Licensed EMDR practitioner required. 60–90 min sessions. Not appropriate for performance coaching context.',
    evidence_detail: 'EMDR well-supported for PTSD and phobias. In sport, evidence is mostly anecdotal or case studies. Used only when trauma-like issues are clearly present.',
    use_cases: 'Traumatic injury history, fear of re-injury paralysis, severe performance blocks with emotional roots.',
    example: 'Gymnast with severe fear response after a fall: 6-session EMDR. Targeted the fall memory. Returned to full training within 8 weeks.',
    sessionTemplate: [
      'Session 1: History taking — identify target memories, assess trauma history, EMDR suitability',
      'Session 2: Preparation — safe place exercise, bilateral stimulation introduction, informed consent',
      'Session 3: Assessment — target memory, negative cognition, emotions, body sensation',
      'Sessions 4–7: Desensitisation — bilateral stimulation with target memory until distress reduces',
      'Session 8: Installation — strengthen positive cognition. Body scan for residual tension',
      'Session 9: Re-evaluation — assess gains, address remaining targets, generalisation plan',
    ],
  },
  {
    id: 'crisis',
    name: 'Crisis Protocol & Mental Health Referral',
    shortName: 'Crisis Protocol',
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-700',
    accent: '#b91c1c',
    category: 'Crisis Protocol' as InterventionCategory,
    evidence: 'Strong',
    duration: 'Immediate response',
    population: 'Any athlete presenting with acute risk indicators',
    theory: "Crisis intervention theory (Roberts' 7-stage model). Immediate stabilisation, safety assessment, and connection to appropriate professional support.",
    goals: [
      'Ensure immediate safety of athlete',
      'Provide initial stabilisation and containment',
      'Connect athlete with appropriate mental health services',
      'Document and follow duty-of-care obligations',
    ],
    techniques: [
      { name: 'Safety Assessment', desc: 'Structured risk assessment covering suicidal ideation (frequency, intent, plan, means). Use validated screener (CSSRS).' },
      { name: 'Active Listening / De-escalation', desc: 'Non-judgmental presence, validation of distress. Do not leave athlete alone.' },
      { name: 'Safety Planning', desc: 'Collaborative safety plan: warning signs, coping strategies, contacts, professional support list.' },
      { name: 'Mandatory Reporting', desc: 'Understand jurisdiction-specific duty-to-warn obligations. Document all disclosures and actions.' },
      { name: 'Referral Pathway', desc: 'Warm handover to clinical psychologist, psychiatrist, or emergency services as indicated by risk level.' },
    ],
    delivery: 'Immediate, in-person. Not delegated to coaches or non-clinical staff. Practitioner stays with athlete until safe handover.',
    evidence_detail: 'Crisis intervention protocols are well-established in clinical practice. The IOC Mental Health Toolkit provides sport-specific guidance. Documentation is essential for professional protection.',
    use_cases: 'Disclosure of suicidal ideation, active self-harm, psychotic symptoms, acute trauma response, disclosure of abuse.',
    example: 'Athlete discloses passive suicidal ideation during session. Practitioner: safety assessment, safety plan, team doctor contacted, same-day referral to clinical psychologist. All steps documented.',
    sessionTemplate: [
      'Step 1: Immediate — ensure privacy, calm environment, stay with athlete',
      'Step 2: Active listening — validate distress, no minimising, open questions',
      'Step 3: Safety assessment — use structured tool (CSSRS). Assess ideation, intent, plan, means',
      'Step 4: Safety planning — collaborative plan with warning signs, coping, contacts',
      'Step 5: Notification — contact relevant parties per duty-of-care obligations',
      'Step 6: Referral — warm handover to appropriate clinical service. Do not leave athlete alone',
      'Step 7: Documentation — full record of disclosure, assessment, actions, referral made',
      'Step 8: Follow-up — check in next day, coordinate with clinical team, ongoing welfare monitoring',
    ],
  },
]

const CATEGORY_COLORS: Record<string, string> = {
  'Cognitive Restructuring': 'bg-purple-100 text-purple-700',
  'Relaxation':              'bg-blue-100 text-blue-700',
  'Imagery':                 'bg-indigo-100 text-indigo-700',
  'Goal Setting':            'bg-emerald-100 text-emerald-700',
  'Mindfulness':             'bg-teal-100 text-teal-700',
  'Confidence Building':     'bg-amber-100 text-amber-700',
  'Team Cohesion':           'bg-orange-100 text-orange-700',
  'Crisis Protocol':         'bg-red-100 text-red-700',
  'Other':                   'bg-gray-100 text-gray-600',
}

const CATEGORIES = Object.keys(CATEGORY_COLORS) as InterventionCategory[]

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Star size={18} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
        </button>
      ))}
    </div>
  )
}

function FrameworkModal({ fw, onClose, onBuildProtocol }: {
  fw: typeof FRAMEWORKS[0]; onClose: () => void; onBuildProtocol: (fw: typeof FRAMEWORKS[0]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>('techniques')
  const Icon = fw.icon
  const toggle = (s: string) => setExpanded(p => p === s ? null : s)

  function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700">
          {label}
          {expanded === id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expanded === id && <div className="px-4 py-3 text-sm text-gray-600">{children}</div>}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl mb-8">
        <div className="flex items-start gap-4 p-6 border-b">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: fw.accent + '22' }}>
            <Icon size={22} style={{ color: fw.accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-lg leading-tight">{fw.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${EVIDENCE_COLORS[fw.evidence]}`}>Evidence: {fw.evidence}</span>
              <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={10} /> {fw.duration}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-3">
          <Section id="theory" label="Theoretical Basis"><p>{fw.theory}</p></Section>
          <Section id="goals" label="Intervention Goals">
            <ul className="space-y-1">
              {fw.goals.map((g, i) => <li key={i} className="flex items-start gap-2"><CheckCircle size={13} className="mt-0.5 shrink-0 text-emerald-500" />{g}</li>)}
            </ul>
          </Section>
          <Section id="techniques" label="Techniques & Components">
            <div className="space-y-3">
              {fw.techniques.map(t => (
                <div key={t.name} className="pl-3 border-l-2" style={{ borderColor: fw.accent + '66' }}>
                  <p className="font-semibold text-gray-800 text-xs">{t.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{t.desc}</p>
                </div>
              ))}
            </div>
          </Section>
          <Section id="delivery" label="Delivery Format"><p>{fw.delivery}</p></Section>
          <Section id="evidence" label="Evidence Base"><p>{fw.evidence_detail}</p></Section>
          <Section id="use" label="Use Cases & Example">
            <p className="mb-2"><span className="font-semibold">When to use: </span>{fw.use_cases}</p>
            <p className="italic text-gray-500">Example: {fw.example}</p>
          </Section>
          <Section id="template" label="Session Template">
            <ol className="space-y-1 list-decimal list-inside">
              {fw.sessionTemplate.map((s, i) => <li key={i} className="text-xs">{s}</li>)}
            </ol>
            <p className="mt-3 text-xs text-blue-600 font-medium">Use "Build Protocol" to customise these sessions for a specific athlete</p>
          </Section>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
            <Button onClick={() => { onClose(); onBuildProtocol(fw) }} className="flex-1">
              <Layers size={14} /> Build Protocol for Athlete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProtocolBuilder({ athletes, initialFramework, onCreate, onCancel }: {
  athletes: any[]; initialFramework: typeof FRAMEWORKS[0] | null;
  onCreate: (payload: any) => Promise<void>; onCancel: () => void
}) {
  const [fw, setFw] = useState<typeof FRAMEWORKS[0] | null>(initialFramework)
  const [athleteId, setAthleteId] = useState('')
  const [title, setTitle] = useState(initialFramework ? initialFramework.shortName + ' Programme' : '')
  const [sessions, setSessions] = useState<string[]>(initialFramework?.sessionTemplate ?? [])
  const [goals, setGoals] = useState('')
  const [frequency, setFrequency] = useState('Weekly')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function selectFramework(f: typeof FRAMEWORKS[0]) {
    setFw(f); setTitle(f.shortName + ' Programme'); setSessions([...f.sessionTemplate])
  }

  function updateSession(i: number, val: string) { setSessions(s => s.map((x, idx) => idx === i ? val : x)) }
  function addSession() { setSessions(s => [...s, 'Session ' + (s.length + 1) + ': ']) }
  function removeSession(i: number) { setSessions(s => s.filter((_, idx) => idx !== i)) }

  async function handleCreate() {
    if (!athleteId || !fw || !title) return
    setSaving(true); setSaveError('')
    try {
      const protocol = [
        'Framework: ' + fw.name,
        'Evidence Level: ' + fw.evidence,
        'Frequency: ' + frequency + ' · ' + sessions.length + ' sessions total',
        '',
        'GOALS:',
        goals || fw.goals.join('\n'),
        '',
        'SESSION PLAN:',
        ...sessions.map((s, i) => (i + 1) + '. ' + s),
        notes ? '\nNOTES:\n' + notes : '',
      ].filter(Boolean).join('\n')
      await onCreate({ athlete_id: athleteId, category: fw.category, title, description: fw.theory.slice(0, 200), protocol, notes })
    } catch (err: any) {
      setSaveError('Save failed: ' + (err?.message ?? 'unknown error')); setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-700">← Back to Library</button>
        <h2 className="font-bold text-gray-900 text-lg">Protocol Builder</h2>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1 · Select Framework</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FRAMEWORKS.map(f => {
            const FIcon = f.icon
            return (
              <button key={f.id} onClick={() => selectFramework(f)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all text-xs font-medium ${fw?.id === f.id ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-100 hover:border-gray-200 text-gray-600'}`}>
                <FIcon size={14} style={{ color: fw?.id === f.id ? '#2563eb' : f.accent }} />
                <span className="leading-tight">{f.shortName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {fw && (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">2 · Assign to Athlete</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Athlete *</label>
                <select value={athleteId} onChange={e => setAthleteId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— Select —</option>
                  {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Protocol Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">3 · Programme Parameters</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Frequency</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {['Twice weekly','Weekly','Fortnightly','Monthly','As needed'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Total Sessions</label>
                <input type="number" min={1} max={30} value={sessions.length} readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50" />
              </div>
            </div>
            <label className="text-xs text-gray-500 block mb-1">Specific Goals for this Athlete (optional)</label>
            <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={2}
              placeholder={fw.goals.slice(0, 2).join('\n')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">4 · Edit Session Plan</p>
              <button onClick={addSession} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus size={12} /> Add session
              </button>
            </div>
            <div className="space-y-2">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-gray-400 w-6 mt-2.5 shrink-0 text-right">{i+1}</span>
                  <input value={s} onChange={e => updateSession(i, e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder={'Session ' + (i+1) + ' content…'} />
                  <button onClick={() => removeSession(i)} className="text-gray-300 hover:text-red-500 mt-2"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Clinical Notes / Adaptations</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Rationale for this athlete, contraindications, adaptations…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!athleteId || !title} className="flex-1">
              <CheckCircle size={14} /> Save Protocol to My Interventions
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

type MainTab = 'library' | 'builder' | 'my'

export default function InterventionsPage() {
  const queryClient = useQueryClient()
  const { data: interventions = [], isLoading } = useInterventions()
  const { data: athletes = [] } = useAthletes()
  const createIntervention = useCreateIntervention()
  const updateIntervention = useUpdateIntervention()

  const [tab, setTab] = useState<MainTab>('library')
  const [detailFw, setDetailFw] = useState<typeof FRAMEWORKS[0] | null>(null)
  const [builderFw, setBuilderFw] = useState<typeof FRAMEWORKS[0] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [evidenceFilter, setEvidenceFilter] = useState<string>('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Intervention | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [assigningInterventionId, setAssigningInterventionId] = useState<string | null>(null)
  const [progressDrafts, setProgressDrafts] = useState<
    Record<string, { progressPercentage: number; status: 'in_progress' | 'completed' | 'blocked'; progressNote: string }>
  >({})
  const [form, setForm] = useState({
    athlete_id: '', category: 'Cognitive Restructuring' as InterventionCategory,
    title: '', description: '', protocol: '', rating: 0, notes: '',
  })

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['intervention_assignments'],
    queryFn: () => getInterventionAssignments(),
  })

  const progressMutation = useMutation({
    mutationFn: ({
      assignmentId,
      payload,
    }: {
      assignmentId: string
      payload: { progressPercentage: number; status: 'in_progress' | 'completed' | 'blocked'; progressNote?: string }
    }) => addInterventionProgress(assignmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intervention_assignments'] })
    },
  })

  function openCreate() {
    setEditing(null)
    setForm({ athlete_id: '', category: 'Cognitive Restructuring', title: '', description: '', protocol: '', rating: 0, notes: '' })
    setModalOpen(true)
  }
  function openEdit(i: Intervention) {
    setEditing(i)
    setForm({ athlete_id: i.athlete_id, category: i.category, title: i.title, description: i.description ?? '', protocol: i.protocol ?? '', rating: i.rating ?? 0, notes: i.notes ?? '' })
    setModalOpen(true)
  }
  function set(k: string) { return (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value })) }

  function getProgressDraft(assignment: InterventionAssignment) {
    return (
      progressDrafts[assignment.id] ?? {
        progressPercentage: Number(assignment.completion_percentage || 0),
        status: assignment.status === 'completed' ? 'completed' : 'in_progress',
        progressNote: '',
      }
    )
  }

  function patchProgressDraft(
    assignmentId: string,
    patch: Partial<{ progressPercentage: number; status: 'in_progress' | 'completed' | 'blocked'; progressNote: string }>
  ) {
    setProgressDrafts((prev) => {
      const current = prev[assignmentId] ?? { progressPercentage: 0, status: 'in_progress', progressNote: '' }
      return {
        ...prev,
        [assignmentId]: { ...current, ...patch },
      }
    })
  }

  async function handleAssignInterventionProgram(intervention: Intervention) {
    try {
      setAssigningInterventionId(intervention.id)
      await assignInterventionProgram({
        athleteId: intervention.athlete_id,
        title: intervention.title,
        description: intervention.description || intervention.protocol || '',
        milestones: intervention.protocol
          ? intervention.protocol
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 8)
          : [],
      })
      queryClient.invalidateQueries({ queryKey: ['intervention_assignments'] })
    } catch (err: any) {
      alert(err?.message ?? 'Failed to assign intervention program.')
    } finally {
      setAssigningInterventionId(null)
    }
  }

  async function handleUpdateProgress(assignment: InterventionAssignment) {
    const draft = getProgressDraft(assignment)
    try {
      await progressMutation.mutateAsync({
        assignmentId: assignment.id,
        payload: {
          progressPercentage: Number(draft.progressPercentage),
          status: draft.status,
          progressNote: draft.progressNote || undefined,
        },
      })
      patchProgressDraft(assignment.id, { progressNote: '' })
    } catch (err: any) {
      alert(err?.message ?? 'Failed to update progress.')
    }
  }

  async function handleSave() {
    setSaving(true); setSaveError('')
    try {
      const payload = { ...form, rating: form.rating > 0 ? form.rating : undefined }
      if (editing) await updateIntervention.mutateAsync({ id: editing.id, ...payload })
      else await createIntervention.mutateAsync(payload)
      setModalOpen(false)
    } catch (err: any) {
      setSaveError('Save failed: ' + (err?.message ?? 'unknown error'))
    } finally { setSaving(false) }
  }

  async function handleProtocolCreate(payload: any) {
    await createIntervention.mutateAsync({
      ...payload,
      rating: typeof payload?.rating === 'number' && payload.rating > 0 ? payload.rating : undefined,
    })
    setBuilderFw(null); setTab('my')
  }

  const filteredFW = FRAMEWORKS.filter(fw => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || fw.name.toLowerCase().includes(q) || fw.techniques.some(t => t.name.toLowerCase().includes(q)) || fw.use_cases.toLowerCase().includes(q)
    const matchEvidence = !evidenceFilter || fw.evidence === evidenceFilter
    return matchSearch && matchEvidence
  })

  const athleteOptions = [{ value: '', label: '— Select athlete —' }, ...athletes.map(a => ({ value: a.id, label: a.first_name + ' ' + a.last_name }))]

  const TABS_CONFIG = [
    { id: 'library' as MainTab, label: 'Evidence Library', icon: BookOpen },
    { id: 'builder' as MainTab, label: 'Protocol Builder', icon: Layers },
    { id: 'my' as MainTab, label: 'My Interventions (' + interventions.length + ')', icon: ClipboardList },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Interventions"
        subtitle="Evidence-based library · Protocol builder · Intervention log"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setBuilderFw(null); setTab('builder') }}>
              <Layers size={14} /> Protocol Builder
            </Button>
            <Button onClick={openCreate}><Plus size={14} /> Log Intervention</Button>
          </div>
        }
      />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS_CONFIG.map(t => {
          const TIcon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <TIcon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'library' && (
        <div>
          <div className="flex gap-3 mb-5 flex-wrap">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search frameworks, techniques, use cases…"
              className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <select value={evidenceFilter} onChange={e => setEvidenceFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">All Evidence Levels</option>
              {['Strong','Moderate','Limited','Experimental'].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFW.map(fw => {
              const FIcon = fw.icon
              return (
                <Card key={fw.id} className="p-5 hover:shadow-md transition-all cursor-pointer" onClick={() => setDetailFw(fw)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: fw.accent + '18' }}>
                      <FIcon size={20} style={{ color: fw.accent }} />
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${EVIDENCE_COLORS[fw.evidence]}`}>{fw.evidence}</span>
                  </div>
                  <p className="font-bold text-gray-900 text-sm leading-tight mb-1">{fw.name}</p>
                  <p className="text-xs text-gray-400 mb-3 flex items-center gap-1"><Clock size={10} /> {fw.duration} · {fw.population.split(';')[0]}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {fw.techniques.slice(0, 3).map(t => (
                      <span key={t.name} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.name}</span>
                    ))}
                    {fw.techniques.length > 3 && <span className="text-xs text-gray-400">+{fw.techniques.length - 3} more</span>}
                  </div>
                  <div className="flex gap-2 mt-auto pt-2 border-t border-gray-50">
                    <button onClick={e => { e.stopPropagation(); setDetailFw(fw) }}
                      className="flex-1 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-1">
                      <FileText size={11} /> View Detail
                    </button>
                    <button onClick={e => { e.stopPropagation(); setBuilderFw(fw); setTab('builder') }}
                      className="flex-1 text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center justify-center gap-1 border-l pl-2">
                      <Layers size={11} /> Build Protocol
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>

          {filteredFW.length === 0 && (
            <EmptyState icon={<BookOpen size={40} />} title="No frameworks match your search" description="Try different keywords or clear the evidence filter" />
          )}

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evidence Key</p>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(EVIDENCE_COLORS).map(([level, cls]) => (
                <span key={level} className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>{level}</span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Evidence levels from Frontiers in Psychology meta-analysis (2025), JAASP systematic reviews, and ACSM sport psychology guidelines.
            </p>
          </div>
        </div>
      )}

      {tab === 'builder' && (
        <Card className="p-6 max-w-3xl">
          <ProtocolBuilder athletes={athletes} initialFramework={builderFw}
            onCreate={handleProtocolCreate} onCancel={() => { setBuilderFw(null); setTab('library') }} />
        </Card>
      )}

      {tab === 'my' && (
        <>
          <div className="mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">Assigned Programs & Progress</p>
                  <p className="text-xs text-gray-500">Athletes can view these in their portal. Update progress here in real time.</p>
                </div>
                <Badge label={`${assignments.length} active`} className="bg-blue-100 text-blue-700" />
              </div>

              {assignmentsLoading ? (
                <div className="flex justify-center py-6"><Spinner size="md" /></div>
              ) : assignments.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No assigned programs yet. Use “Assign Program” on an intervention card below.
                </p>
              ) : (
                <div className="space-y-3">
                  {assignments.slice(0, 12).map((assignment) => {
                    const draft = getProgressDraft(assignment)
                    return (
                      <div key={assignment.id} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{assignment.title}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {assignment.athlete_first_name || ''} {assignment.athlete_last_name || ''} · Assigned {fmtDate(assignment.assigned_at)}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-gray-600">
                            {Math.round(Number(assignment.completion_percentage || 0))}%
                          </span>
                        </div>

                        <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                          <div
                            className="h-2 bg-blue-500"
                            style={{ width: `${Math.max(0, Math.min(100, Number(assignment.completion_percentage || 0)))}%` }}
                          />
                        </div>

                        <div className="grid sm:grid-cols-4 gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={draft.progressPercentage}
                            onChange={(e) =>
                              patchProgressDraft(assignment.id, {
                                progressPercentage: Math.max(0, Math.min(100, Number(e.target.value || 0))),
                              })
                            }
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                            placeholder="%"
                          />
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              patchProgressDraft(assignment.id, {
                                status: e.target.value as 'in_progress' | 'completed' | 'blocked',
                              })
                            }
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                          >
                            <option value="in_progress">In progress</option>
                            <option value="completed">Completed</option>
                            <option value="blocked">Blocked</option>
                          </select>
                          <input
                            value={draft.progressNote}
                            onChange={(e) => patchProgressDraft(assignment.id, { progressNote: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 sm:col-span-2"
                            placeholder="Progress note"
                          />
                        </div>

                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleUpdateProgress(assignment)}
                            loading={progressMutation.isPending}
                          >
                            Update Progress
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
           : interventions.length === 0
             ? <EmptyState icon={<Lightbulb size={48} />} title="No interventions logged yet"
                 description="Browse the Evidence Library to build a protocol, or log an intervention directly."
                 action={<div className="flex gap-2">
                   <Button variant="secondary" onClick={() => setTab('library')}><BookOpen size={14} /> Browse Library</Button>
                   <Button onClick={openCreate}><Plus size={14} /> Log Intervention</Button>
                 </div>} />
             : (
               <div className="grid sm:grid-cols-2 gap-4">
                 {interventions.map(i => (
                   <Card key={i.id} onClick={() => openEdit(i)} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
                     <div className="flex items-start gap-3 mb-2">
                       {i.athlete && <Avatar firstName={i.athlete.first_name} lastName={i.athlete.last_name} size="sm" />}
                       <div className="flex-1 min-w-0">
                         <p className="font-medium text-gray-900 truncate">{i.title}</p>
                         <p className="text-xs text-gray-400">
                           {i.athlete ? i.athlete.first_name + ' ' + i.athlete.last_name : ''} · {fmtDate(i.created_at)}
                         </p>
                       </div>
                     </div>
                     <div className="flex items-center justify-between">
                       <Badge label={i.category} className={CATEGORY_COLORS[i.category] ?? 'bg-gray-100 text-gray-600'} />
                       {i.rating ? (
                         <div className="flex gap-0.5">
                           {[1,2,3,4,5].map(n => <Star key={n} size={12} className={n <= i.rating! ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />)}
                         </div>
                       ) : null}
                     </div>
                     {i.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{i.description}</p>}
                     {i.protocol && <p className="text-xs text-blue-400 mt-1 flex items-center gap-1"><ClipboardList size={10} /> Protocol attached</p>}
                     <div className="mt-2">
                       <button
                         type="button"
                         onClick={(e) => {
                           e.stopPropagation()
                           handleAssignInterventionProgram(i)
                         }}
                         disabled={assigningInterventionId === i.id}
                         className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 disabled:opacity-60"
                       >
                         {assigningInterventionId === i.id ? 'Assigning...' : 'Assign Program'}
                       </button>
                     </div>
                   </Card>
                 ))}
               </div>
             )}
        </>
      )}

      {detailFw && (
        <FrameworkModal fw={detailFw} onClose={() => setDetailFw(null)}
          onBuildProtocol={fw => { setBuilderFw(fw); setTab('builder') }} />
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setSaveError('') }}
        title={editing ? 'Edit Intervention' : 'Log Intervention'} maxWidth="max-w-xl">
        <div className="space-y-4">
          <Select label="Athlete" value={form.athlete_id} onChange={set('athlete_id') as any} options={athleteOptions} />
          <Select label="Category" value={form.category} onChange={set('category') as any} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
          <Input label="Title" value={form.title} onChange={set('title')} required />
          <Textarea label="Description / Rationale" value={form.description} onChange={set('description') as any} rows={2} />
          <Textarea label="Protocol / Session Steps" value={form.protocol} onChange={set('protocol') as any} rows={4} placeholder="Session-by-session steps…" />
          <Textarea label="Clinical Notes" value={form.notes} onChange={set('notes') as any} rows={2} />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Effectiveness Rating</p>
            <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); setSaveError('') }}>Cancel</Button>
            <div className="flex items-center gap-3">
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id || !form.title}>
                {editing ? 'Update' : 'Save'} Intervention
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
