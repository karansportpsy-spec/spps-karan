# SPPS — Sport Psychology Practitioner Suite

> HIPAA-compliant practice management for elite sport psychologists.

---

## What is SPPS?

SPPS is a full-stack web application for sport psychology practitioners to manage athletes, log sessions, administer proprietary psychological assessments, track wellbeing check-ins, log interventions, and generate AI-assisted clinical reports — all within a HIPAA and GDPR-aligned compliance framework.

The suite also includes advanced modules for neurocognitive profiling (Senaptec), psychophysiology data entry (EEG · EMG · HRV), a Mental Performance Lab supporting 8 gold-standard technologies (eego sports · NIRSport2 · tDCS · Rezzil VR · CANTAB · EyeLink · OptiTrack), sport injury psychology with OSIICS classification and psychological readiness tracking, IOC Mental Health Screening, custom assessment builder, and AI-generated case formulation reports — making SPPS one of the most comprehensive digital tools available for elite sport psychology practice.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 · TypeScript · Vite |
| Styling | Tailwind CSS · DM Sans · Playfair Display |
| Routing | React Router v6 (auth + compliance guards) |
| State | TanStack Query v5 |
| Backend | Supabase (PostgreSQL · Auth · Row Level Security) |
| AI | Groq API (AI Assistant + report generation) |
| Charts | Recharts |
| Icons | Lucide React |

---

## Features

**Core Practice Management**
- 3-step practitioner signup with role and organisation details
- 4-gate compliance onboarding — HIPAA BAA · User Agreement · Terms · Data Privacy
- Athlete management — 6-step intake with consent + parental release for under-15
- Session logging — pre/post mood ratings, outcome scoring, linked interventions
- Daily check-ins — 10 wellbeing metrics with auto-flagging and trend charts
- Interventions log — type, frequency, duration, outcome tracking
- PHI audit log — HIPAA §164.508 compliant disclosure tracking
- Mobile responsive — bottom tab nav, touch-optimised controls

**Assessments**
- 6 SPPS proprietary assessments — APAS · PSAS · SCES · TRPS · MFAS · CFAS
- IOC Mental Health Screening — 10-item validated tool with domain scoring
- Custom Assessment Builder — import any third-party or in-house tool with flexible scale entry

**Advanced Clinical Modules**
- Case Formulation — AI-generated reports with integrated session, assessment, and check-in data across radar, line, and bar charts
- Neurocognitive Profiling — Senaptec 10-skill visual · processing · reaction radar profiling
- Psychophysiology — EMG (22 muscle groups) · EEG brainwave band entry · HRV · Galvanic Skin Response logging
- Mental Performance Lab — structured data entry for 8 technologies: eego sports EEG · NIRSport2/Brite23 fNIRS · Soterix tDCS · Rezzil VR · CANTAB · EyeLink eye tracking · OptiTrack motion capture
- Injury Psychology — injury log · OSIICS classifier · psychological readiness tracking · surveillance reports

**AI & Reporting**
- AI Assistant — Groq-powered clinical guidance and session planning
- Reports — AI-generated markdown clinical reports
- Case Formulation Reports — downloadable, printable, anonymised athlete summaries

---

## Assessment Library

All instruments are SPPS proprietary tools (SPPS Internal v1.0):

| Code | Full Name | Items | Domain |
|------|-----------|-------|--------|
| APAS | Athletic Pre-Competition Anxiety Scale | 18 | Anxiety |
| PSAS | Psychological Stress & Arousal Scale | 21 | Stress |
| SCES | Sport Confidence & Efficacy Scale | 15 | Confidence |
| TRPS | Training & Recovery Profiling Scale | 24 | Recovery |
| MFAS | Mental Flow & Absorption Scale | 18 | Flow |
| CFAS | Competition Focus & Attentional Scale | 24 | Focus |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/karansportpsy-spec/spps-karan.git
cd spps-karan
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GROQ_API_KEY=your-groq-key-here
```

### 4. Set up the database

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full contents of `supabase-schema.sql`
3. Copy your **Project URL** and **anon public key** from Settings → API into `.env`

### 5. Run the app

```bash
npm run dev
```

App runs at `http://localhost:5173`

---

## Project Structure

```
spps-karan/
├── supabase-schema.sql        Complete PostgreSQL schema (run once in Supabase)
├── .env.example               Environment variable template
│
└── src/
    ├── main.tsx               App entry point
    ├── router.tsx             Auth + compliance guards
    ├── index.css              Tailwind + gradient utilities
    ├── types/index.ts         All domain types
    │
    ├── lib/
    │   ├── supabase.ts        Supabase client
    │   ├── groq.ts            Groq API helper
    │   └── utils.ts           cn, fmtDate, scoreColor…
    │
    ├── contexts/
    │   └── AuthContext.tsx    Auth state
    │
    ├── hooks/
    │   ├── useAthletes.ts     Athlete CRUD
    │   └── useData.ts         Sessions · CheckIns · Assessments · Interventions
    │
    ├── components/
    │   ├── ErrorBoundary.tsx
    │   ├── layout/AppShell.tsx
    │   └── ui/index.tsx       Button · Input · Modal · ScoreRing · Avatar…
    │
    └── pages/
        ├── Landing.tsx
        ├── Dashboard.tsx
        ├── auth/AuthPages.tsx
        ├── compliance/CompliancePages.tsx
        ├── athletes/
        │   ├── AthletesPage.tsx
        │   └── CaseFormulation.tsx
        ├── sessions/SessionsPage.tsx
        ├── checkins/CheckInsPage.tsx
        ├── assessments/
        │   ├── AssessmentsPage.tsx
        │   ├── CustomAssessmentPage.tsx
        │   └── IOCMentalHealthPage.tsx
        ├── neurocognitive/NeurocognitivePage.tsx
        ├── psychophysiology/PsychophysiologyPage.tsx
        ├── lab/MentalPerformanceLabPage.tsx
        ├── injury/InjuryPsychologyPage.tsx
        ├── interventions/InterventionsPage.tsx
        ├── ai/AIAssistantPage.tsx
        ├── reports/ReportsPage.tsx
        └── settings/SettingsPage.tsx
```

---

## Database Schema

14 tables with Row Level Security — each practitioner sees only their own data:

`organisations` · `practitioners` · `athletes` · `athlete_consent_forms` · `parental_guardian_releases` · `sessions` · `check_ins` · `assessments` · `assessment_items` · `assessment_responses` · `interventions` · `reports` · `phi_audit_log` · `notifications`

---

## Environment Variables

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `VITE_GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |

> **Never commit `.env`** — it is in `.gitignore`. Only `.env.example` is tracked.

---

## Scripts

```bash
npm run dev        # Development server at localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run type-check # TypeScript check only
```

---

## Compliance

- **HIPAA** — BAA at onboarding, AES-256 at rest, TLS 1.3 in transit, PHI audit log
- **GDPR** — Consent-based processing, right to deletion, 7-year session data retention
- **POCSO / GDPR Art. 8** — Parental release mandatory for athletes under 15
- **Indian IT Act 2000** — Supplemental data protection obligations

---

## Developed by

**Dr. Karanbir Singh, Ph.D.**

SPPS — Sport Psychology Practitioner Suite · v2.0 · [github.com/karansportpsy-spec/spps-karan](https://github.com/karansportpsy-spec/spps-karan)