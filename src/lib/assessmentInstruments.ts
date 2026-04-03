// SPPS Proprietary Assessment Instruments
// ABTP MindLab · Internal v1.0 · March 2026
// No external licensing required

export interface QuestionItem {
  id: number
  text: string
  reversed?: boolean
}

export interface Subscale {
  name: string
  items: number[]   // 1-indexed item numbers
  range: [number, number]
  interpretation: 'high_bad' | 'high_good' | 'mixed'
  note?: string
}

export interface ScoreRange {
  min: number
  max: number
  level: string
  interpretation: string
  color: 'green' | 'amber' | 'red'
}

export interface AssessmentInstrument {
  code: string
  name: string
  domain: string
  items: number
  adminTime: string
  version: string
  instructions: string
  ratingScale: string[]
  questions: QuestionItem[]
  subscales: Subscale[]
  totalRange: [number, number]
  scoreRanges: ScoreRange[]
  clinicianNotes: string[]
  timing: string   // when to administer
  anonymousDataFields: string[]  // fields sent anonymously for norms
}

export const INSTRUMENTS: Record<string, AssessmentInstrument> = {

  APAS: {
    code: 'APAS',
    name: 'Athletic Pre-Competition Anxiety Scale',
    domain: 'Anxiety',
    items: 18,
    adminTime: '~6 min',
    version: 'SPPS Internal v1.0',
    timing: 'Within 60 minutes of competition start',
    instructions: 'Please read each statement carefully and choose the option that best describes how you feel RIGHT NOW, just before competition. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'I feel nervous about how I will perform in this competition.' },
      { id: 2,  text: 'My body feels tense and tight before competing.' },
      { id: 3,  text: 'I am confident I can meet the challenge of this competition.', reversed: true },
      { id: 4,  text: 'I worry about making mistakes during the competition.' },
      { id: 5,  text: 'My heart is racing as I think about competing.' },
      { id: 6,  text: 'I feel uncertain about whether I will perform well.' },
      { id: 7,  text: 'My muscles feel uptight and rigid.' },
      { id: 8,  text: 'I am concerned about performing up to my potential.' },
      { id: 9,  text: 'I feel queasy thinking about the competition.' },
      { id: 10, text: 'I believe I can handle the pressure of this event.', reversed: true },
      { id: 11, text: 'I am worried about what others will think of my performance.' },
      { id: 12, text: 'My hands feel sweaty and my breathing feels fast.' },
      { id: 13, text: 'I feel mentally ready to give my best today.', reversed: true },
      { id: 14, text: 'I keep thinking about what could go wrong.' },
      { id: 15, text: 'My stomach is unsettled before competing.' },
      { id: 16, text: 'I doubt my ability to perform well in this competition.', reversed: true },
      { id: 17, text: 'I feel shaky and physically on edge.' },
      { id: 18, text: 'I am focused and ready to compete at my best.', reversed: true },
    ],
    subscales: [
      { name: 'Pre-Competition Worry', items: [1,4,6,8,11,14], range: [6,24], interpretation: 'high_bad', note: 'High = greater cognitive anxiety' },
      { name: 'Physical Tension',      items: [2,5,7,9,12,15,17], range: [7,28], interpretation: 'high_bad', note: 'High = greater somatic anxiety' },
      { name: 'Performance Confidence', items: [3,10,13,16,18], range: [5,20], interpretation: 'high_good', note: 'High = greater confidence (desirable)' },
    ],
    totalRange: [18, 72],
    scoreRanges: [
      { min: 6,  max: 12, level: 'Low',      interpretation: 'Low anxiety / high confidence. Athlete appears optimally primed. Monitor for under-arousal.', color: 'green' },
      { min: 13, max: 18, level: 'Moderate', interpretation: 'Moderate anxiety. May facilitate performance. Review with athlete; identify stressors.', color: 'amber' },
      { min: 19, max: 24, level: 'High',     interpretation: 'High anxiety. Likely to impair performance. Implement anxiety regulation strategies urgently.', color: 'red' },
    ],
    clinicianNotes: [
      'Administer within 60 minutes of competition start.',
      'Compare with athlete\'s own baseline — intra-individual change is clinically more meaningful than normative comparison.',
      'Confidence sub-scale scores are inversely related to anxiety sub-scales; low confidence + high anxiety = highest risk profile.',
    ],
    anonymousDataFields: ['sport', 'competition_level', 'age_group', 'scores'],
  },

  PSAS: {
    code: 'PSAS',
    name: 'Psychological Stress & Arousal Scale',
    domain: 'Stress',
    items: 21,
    adminTime: '~7 min',
    version: 'SPPS Internal v1.0',
    timing: 'Pre-competition or weekly during training block',
    instructions: 'Please read each statement carefully and choose the option that best describes how you feel RIGHT NOW, just before competition / in relation to your training. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'I feel overwhelmed by the demands placed on me.' },
      { id: 2,  text: 'I am experiencing high levels of mental pressure.' },
      { id: 3,  text: 'I feel alert and mentally activated for performance.' },
      { id: 4,  text: 'My stress levels are affecting my ability to concentrate.' },
      { id: 5,  text: 'I feel psychologically fatigued.' },
      { id: 6,  text: 'I am energised and ready to perform.' },
      { id: 7,  text: 'I feel mentally drained from recent training and competition demands.' },
      { id: 8,  text: 'My arousal level feels just right for competing.' },
      { id: 9,  text: 'I am preoccupied with things that could go wrong.' },
      { id: 10, text: 'I feel charged up and ready to perform.' },
      { id: 11, text: 'I am struggling to cope with the mental load of competing.' },
      { id: 12, text: 'My mind feels sharp and switched on.' },
      { id: 13, text: 'I feel emotionally exhausted from the pressures of sport.' },
      { id: 14, text: 'I feel psychologically prepared for today\'s competition.' },
      { id: 15, text: 'I am having difficulty managing the stress of training.' },
      { id: 16, text: 'I feel a healthy level of excitement before competing.' },
      { id: 17, text: 'I feel that the demands on me are too high.' },
      { id: 18, text: 'I feel motivated and mentally engaged.' },
      { id: 19, text: 'I am struggling to recover psychologically between sessions.' },
      { id: 20, text: 'I feel a sense of mental readiness to compete.' },
      { id: 21, text: 'I am experiencing burnout-like symptoms from ongoing pressure.' },
    ],
    subscales: [
      { name: 'Perceived Stress',   items: [1,2,4,5,7,9,11,13,15,17,21], range: [11,44], interpretation: 'high_bad', note: 'High = greater perceived stress load' },
      { name: 'Cognitive Arousal',  items: [3,6,8,10,12,14,16,18,20],    range: [9,36],  interpretation: 'high_good', note: 'High = mentally activated/ready' },
      { name: 'Recovery Demand',    items: [5,7,9,11,13,15,17,19,21],    range: [9,36],  interpretation: 'high_bad', note: 'High = recovery deficit' },
    ],
    totalRange: [21, 84],
    scoreRanges: [
      { min: 11, max: 20, level: 'Low Stress',      interpretation: 'Within healthy stress range. Maintain current training and recovery balance.', color: 'green' },
      { min: 21, max: 30, level: 'Moderate Stress', interpretation: 'Approaching threshold. Review training loads and psychological support strategies.', color: 'amber' },
      { min: 31, max: 44, level: 'High Stress',     interpretation: 'Elevated stress. Consider load reduction, psychological support, and recovery intervention.', color: 'red' },
    ],
    clinicianNotes: [
      'Distinguish between facilitative arousal (positive) and debilitative stress (negative) in interpretation.',
      'Track across time points (weekly) to detect trends in stress accumulation.',
      'High stress + low arousal = burnout risk profile; refer for structured intervention.',
    ],
    anonymousDataFields: ['sport', 'training_phase', 'age_group', 'scores'],
  },

  SCES: {
    code: 'SCES',
    name: 'Sport Confidence & Efficacy Scale',
    domain: 'Confidence',
    items: 15,
    adminTime: '~5 min',
    version: 'SPPS Internal v1.0',
    timing: 'Pre-competition, within 2 hours of event',
    instructions: 'Please read each statement carefully and choose the option that best describes how you feel RIGHT NOW, just before competition / in relation to your training. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'I am confident in my ability to execute key skills under pressure.' },
      { id: 2,  text: 'I believe I have what it takes to succeed in this competition.' },
      { id: 3,  text: 'I trust my training and preparation for this event.' },
      { id: 4,  text: 'I feel capable of performing at the level required today.' },
      { id: 5,  text: 'I am confident in my decision-making during competition.' },
      { id: 6,  text: 'I believe I can overcome setbacks and challenges during this event.' },
      { id: 7,  text: 'I feel assured in my tactical awareness and game sense.' },
      { id: 8,  text: 'I am confident I can maintain my performance when things get tough.' },
      { id: 9,  text: 'I believe my physical preparation has been sufficient for this event.' },
      { id: 10, text: 'I feel certain I can control my emotions during competition.' },
      { id: 11, text: 'I am confident in my ability to adapt my performance when needed.' },
      { id: 12, text: 'I believe I belong at this level of competition.' },
      { id: 13, text: 'I feel mentally strong enough to compete successfully today.' },
      { id: 14, text: 'I am confident that my technique will hold up under pressure.' },
      { id: 15, text: 'I believe I will perform to the best of my ability today.' },
    ],
    subscales: [
      { name: 'Skill Execution Confidence',    items: [1,4,9,14],    range: [4,16],  interpretation: 'high_good' },
      { name: 'Cognitive/Decision Confidence', items: [5,7,11,13],   range: [4,16],  interpretation: 'high_good' },
      { name: 'Resilience & Adversity',        items: [6,8,10,12],   range: [4,16],  interpretation: 'high_good' },
      { name: 'General Self-Belief',           items: [2,3,15],      range: [3,12],  interpretation: 'high_good' },
    ],
    totalRange: [15, 60],
    scoreRanges: [
      { min: 15, max: 30, level: 'Low Confidence',      interpretation: 'Poor confidence profile. Prioritise confidence-building interventions and self-efficacy work.', color: 'red' },
      { min: 31, max: 45, level: 'Moderate Confidence', interpretation: 'Developing confidence. Reinforce strengths and address specific efficacy gaps.', color: 'amber' },
      { min: 46, max: 60, level: 'High Confidence',     interpretation: 'Robust confidence. Maintain and protect. Monitor for over-confidence in high-risk events.', color: 'green' },
    ],
    clinicianNotes: [
      'Best interpreted alongside anxiety scores — high confidence moderates competitive anxiety.',
      'Use qualitative follow-up (e.g., \'What drives your confidence today?\') to supplement quantitative scoring.',
    ],
    anonymousDataFields: ['sport', 'competition_level', 'age_group', 'scores'],
  },

  TRPS: {
    code: 'TRPS',
    name: 'Training & Recovery Profiling Scale',
    domain: 'Recovery',
    items: 24,
    adminTime: '~8 min',
    version: 'SPPS Internal v1.0',
    timing: 'Weekly during training block, same day/time each week',
    instructions: 'Please read each statement carefully and choose the option that best describes how you feel RIGHT NOW, just before competition / in relation to your training. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'My training sessions have felt productive this week.' },
      { id: 2,  text: 'I have been able to complete my training without excessive fatigue.' },
      { id: 3,  text: 'I feel physically recovered from previous training loads.' },
      { id: 4,  text: 'My sleep quality has been adequate for recovery.' },
      { id: 5,  text: 'I have felt motivated to train in recent sessions.' },
      { id: 6,  text: 'I have experienced muscle soreness beyond what is expected.' },
      { id: 7,  text: 'I feel mentally fresh and ready to train hard.' },
      { id: 8,  text: 'My nutrition has supported my training and recovery needs.' },
      { id: 9,  text: 'I have noticed a decline in my usual training performance.' },
      { id: 10, text: 'I feel physically robust and able to handle the training demands.' },
      { id: 11, text: 'I have felt emotionally flat or disengaged during training.' },
      { id: 12, text: 'My hydration levels have been well-maintained.' },
      { id: 13, text: 'I have been managing training stress effectively.' },
      { id: 14, text: 'I have felt heavy-legged or sluggish during recent sessions.' },
      { id: 15, text: 'My recovery strategies (e.g., sleep, nutrition) have been consistent.' },
      { id: 16, text: 'I have been able to sustain effort and intensity throughout sessions.' },
      { id: 17, text: 'I have felt an increased desire to skip training sessions.' },
      { id: 18, text: 'My body feels responsive and ready for high-intensity work.' },
      { id: 19, text: 'I have managed life stressors alongside training demands well.' },
      { id: 20, text: 'I have experienced unexplained drops in my performance.' },
      { id: 21, text: 'My overall energy levels during the day have been good.' },
      { id: 22, text: 'I have felt irritable or moody as a result of training demands.' },
      { id: 23, text: 'I feel confident that my body is adapting positively to training.' },
      { id: 24, text: 'I have required more rest than usual to feel recovered.' },
    ],
    subscales: [
      { name: 'Training Quality',        items: [1,2,5,7,10,16],           range: [6,24],  interpretation: 'high_good', note: 'High = good training quality' },
      { name: 'Physical Recovery',       items: [3,6,8,12,15,18,23],       range: [7,28],  interpretation: 'high_good', note: 'High = well-recovered' },
      { name: 'Psychological Fatigue',   items: [4,11,13,17,19,21,22],     range: [7,28],  interpretation: 'high_bad',  note: 'High = greater psych fatigue' },
      { name: 'Overtraining Indicators', items: [9,14,20,24],              range: [4,16],  interpretation: 'high_bad',  note: 'High = overtraining risk ⚠' },
    ],
    totalRange: [24, 96],
    scoreRanges: [
      { min: 4,  max: 8,  level: 'Low Risk',      interpretation: 'No overtraining indicators. Continue current periodisation plan.', color: 'green' },
      { min: 9,  max: 12, level: 'Moderate Risk', interpretation: 'Emerging overtraining signals. Review load, recovery, and wellbeing protocols.', color: 'amber' },
      { min: 13, max: 16, level: 'High Risk',     interpretation: 'Significant overtraining risk. Implement immediate load reduction and medical review.', color: 'red' },
    ],
    clinicianNotes: [
      'Administer weekly for longitudinal tracking; compare within-athlete trends.',
      'Cross-reference Psychological Fatigue sub-scale with PSAS Perceived Stress score for holistic wellbeing picture.',
      'Flagged items 9, 14, 20, 24 are specific overtraining sentinel indicators — any score of 3–4 on these warrants follow-up.',
    ],
    anonymousDataFields: ['sport', 'training_phase', 'weekly_load', 'age_group', 'scores'],
  },

  MFAS: {
    code: 'MFAS',
    name: 'Mental Flow & Absorption Scale',
    domain: 'Flow',
    items: 18,
    adminTime: '~6 min',
    version: 'SPPS Internal v1.0',
    timing: 'Within 30 minutes post-performance for most accurate recall',
    instructions: 'Please read each statement carefully and choose the option that best describes how you felt DURING your recent competition or training session. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'I was completely absorbed in what I was doing.' },
      { id: 2,  text: 'My mind was clear and focused throughout the performance.' },
      { id: 3,  text: 'I lost track of time because I was so focused on competing.' },
      { id: 4,  text: 'Everything felt automatic and effortless during performance.' },
      { id: 5,  text: 'I felt in total control of my actions.' },
      { id: 6,  text: 'I was fully aware of what I needed to do and did it instinctively.' },
      { id: 7,  text: 'My attention was completely on the task in front of me.' },
      { id: 8,  text: 'I felt a sense of personal satisfaction from performing.' },
      { id: 9,  text: 'I was free from distracting thoughts during my performance.' },
      { id: 10, text: 'My performance felt smooth and seamless.' },
      { id: 11, text: 'I had a clear sense of purpose in what I was doing.' },
      { id: 12, text: 'The challenge of the task matched my skill level perfectly.' },
      { id: 13, text: 'I felt energised and engaged throughout the performance.' },
      { id: 14, text: 'I was performing without consciously thinking about each action.' },
      { id: 15, text: 'I experienced a sense of unity between my mind and body.' },
      { id: 16, text: 'I felt intrinsically motivated during the performance.' },
      { id: 17, text: 'I was fully present in the moment of competing.' },
      { id: 18, text: 'I felt that I was performing at the peak of my abilities.' },
    ],
    subscales: [
      { name: 'Absorption & Immersion',      items: [1,3,7,9,17],    range: [5,20], interpretation: 'high_good' },
      { name: 'Automaticity & Effortlessness', items: [4,6,10,14,15], range: [5,20], interpretation: 'high_good' },
      { name: 'Intrinsic Motivation',        items: [8,11,13,16],    range: [4,16], interpretation: 'high_good' },
      { name: 'Challenge-Skill Balance',     items: [2,5,12,18],     range: [4,16], interpretation: 'high_good' },
    ],
    totalRange: [18, 72],
    scoreRanges: [
      { min: 18, max: 36, level: 'Low Flow',      interpretation: 'Minimal flow state. Athlete likely experiencing self-consciousness, distraction, or skill-challenge mismatch.', color: 'red' },
      { min: 37, max: 54, level: 'Moderate Flow', interpretation: 'Partial flow experience. Some elements present. Identify which sub-scales are low and target those.', color: 'amber' },
      { min: 55, max: 72, level: 'High Flow',     interpretation: 'Strong flow state reported. Reinforce conditions that facilitated this experience.', color: 'green' },
    ],
    clinicianNotes: [
      'Administer immediately post-performance (within 30 minutes) for most accurate recall.',
      'Flow is state-dependent; compare within-athlete across competitions rather than between athletes.',
      'Use results to identify environmental and psychological conditions associated with high flow for the individual athlete.',
    ],
    anonymousDataFields: ['sport', 'competition_level', 'performance_outcome', 'age_group', 'scores'],
  },

  CFAS: {
    code: 'CFAS',
    name: 'Competition Focus & Attentional Scale',
    domain: 'Focus',
    items: 24,
    adminTime: '~8 min',
    version: 'SPPS Internal v1.0',
    timing: 'Post-competition debriefing within 1 hour of event',
    instructions: 'Please read each statement carefully and choose the option that best describes how you FELT DURING your recent competition. There are no right or wrong answers. Please respond honestly to each item.',
    ratingScale: ['Not at all', 'Somewhat', 'Moderately so', 'Very much so'],
    questions: [
      { id: 1,  text: 'I was able to keep my attention on relevant cues during competition.' },
      { id: 2,  text: 'I found it easy to block out irrelevant distractions.' },
      { id: 3,  text: 'My focus remained sharp throughout the competition.' },
      { id: 4,  text: 'I was easily distracted by things happening around me.', reversed: true },
      { id: 5,  text: 'I was able to quickly refocus after a mistake.' },
      { id: 6,  text: 'I concentrated on the present moment rather than past or future events.' },
      { id: 7,  text: 'My attention shifted away from the task at key moments.', reversed: true },
      { id: 8,  text: 'I focused on what I could control during the competition.' },
      { id: 9,  text: 'I was mentally present throughout the entire competition.' },
      { id: 10, text: 'I became overly focused on the outcome rather than the process.', reversed: true },
      { id: 11, text: 'I was able to maintain concentration during high-pressure moments.' },
      { id: 12, text: 'My mind wandered during important phases of the competition.', reversed: true },
      { id: 13, text: 'I used effective focusing strategies during the event.' },
      { id: 14, text: 'I felt \'zoned in\' and locked onto the task.' },
      { id: 15, text: 'I lost focus at critical moments in the competition.', reversed: true },
      { id: 16, text: 'I was aware of my attentional focus throughout the competition.' },
      { id: 17, text: 'I directed my attention effectively to improve performance.' },
      { id: 18, text: 'I noticed when my focus slipped and corrected it quickly.' },
      { id: 19, text: 'I was distracted by thoughts about the competition result.', reversed: true },
      { id: 20, text: 'I concentrated on technical and tactical cues during performance.' },
      { id: 21, text: 'I was mentally sharp and alert throughout the event.' },
      { id: 22, text: 'I found it difficult to switch my attentional focus when needed.', reversed: true },
      { id: 23, text: 'I was fully engaged and switched on during the competition.' },
      { id: 24, text: 'I experienced lapses in concentration that affected my performance.', reversed: true },
    ],
    subscales: [
      { name: 'Attentional Control',   items: [1,2,3,5,6,8,11,13],  range: [8,32],  interpretation: 'high_good', note: 'High = better control' },
      { name: 'Distractibility',       items: [4,7,10,12,15,19,22,24], range: [8,32], interpretation: 'high_bad', note: 'Reverse-scored items; High = more distractible' },
      { name: 'Refocusing Ability',    items: [5,16,18],             range: [3,12],  interpretation: 'high_good', note: 'High = quick refocus' },
      { name: 'Process Focus',         items: [6,8,14,17,20],        range: [5,20],  interpretation: 'high_good', note: 'High = process-oriented' },
    ],
    totalRange: [24, 96],
    scoreRanges: [
      { min: 24, max: 48, level: 'Poor Focus',     interpretation: 'Significant attentional difficulties. Implement focus training and pre-competition routines.', color: 'red' },
      { min: 49, max: 72, level: 'Adequate Focus', interpretation: 'Moderate attentional control. Identify specific sub-scales for targeted intervention.', color: 'amber' },
      { min: 73, max: 96, level: 'Strong Focus',   interpretation: 'High attentional control reported. Maintain routines and reinforce effective strategies.', color: 'green' },
    ],
    clinicianNotes: [
      'Distractibility sub-scale items are reverse-scored before inclusion in the total; high raw score = high distraction = negative indicator.',
      'Particularly useful for post-competition debriefing — helps athlete understand where focus broke down.',
      'Combine with qualitative debrief to identify specific distractors (crowd, internal thoughts, fatigue, etc.).',
    ],
    anonymousDataFields: ['sport', 'competition_level', 'competition_result', 'age_group', 'scores'],
  },

}

// Scoring engine
export function scoreAssessment(
  instrument: AssessmentInstrument,
  responses: Record<number, number>  // itemId → raw response (1-4)
): { subscaleScores: Record<string, number>; totalScore: number; interpretation: ScoreRange | null } {

  // Apply reverse scoring
  const scored: Record<number, number> = {}
  instrument.questions.forEach(q => {
    const raw = responses[q.id] ?? 0
    scored[q.id] = q.reversed ? (5 - raw) : raw
  })

  // Calculate subscale scores
  const subscaleScores: Record<string, number> = {}
  instrument.subscales.forEach(sub => {
    subscaleScores[sub.name] = sub.items.reduce((sum, itemId) => sum + (scored[itemId] ?? 0), 0)
  })

  // Total score
  const totalScore = Object.values(subscaleScores).reduce((a, b) => a + b, 0)

  // Find interpretation based on total score or overtraining subscale for TRPS
  const scoreToMatch = instrument.code === 'TRPS'
    ? subscaleScores['Overtraining Indicators']
    : totalScore

  const interpretation = instrument.scoreRanges.find(r => scoreToMatch >= r.min && scoreToMatch <= r.max) ?? null

  return { subscaleScores, totalScore, interpretation }
}

// Anonymous data payload for platform norms building
export function buildAnonymousPayload(
  instrumentCode: string,
  scores: Record<string, number>,
  athleteMeta: { sport: string; age?: number; competition_level?: string }
) {
  const ageGroup = athleteMeta.age
    ? athleteMeta.age < 18 ? 'U18' : athleteMeta.age < 25 ? '18-24' : athleteMeta.age < 35 ? '25-34' : '35+'
    : 'unknown'

  return {
    instrument: instrumentCode,
    sport: athleteMeta.sport,
    age_group: ageGroup,
    competition_level: athleteMeta.competition_level ?? 'unknown',
    scores,    // subscale scores only, no identifying info
    platform_version: 'SPPS v2.0',
    timestamp: new Date().toISOString(),
  }
}
