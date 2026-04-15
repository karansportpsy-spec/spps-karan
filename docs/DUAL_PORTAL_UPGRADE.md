# SPPS Dual-Portal Upgrade Integration Guide

## 1) What Was Added
- Athlete portal activation gate before athlete login.
- CSV export for all athletes and single-athlete records.
- Transactional assessment bundle API for mental health + psychophysiology + neurocognitive saves.
- Intervention assignment/progress tracking model and APIs.
- Real-time chat (Socket.IO + persisted messages).
- Consent API save/delete flow with digital signature fields.
- Injury psychology reflection log APIs and frontend integration.
- Daily-log summary surfaced inside Case Formulation.
- Athlete portal daily reflection submit flow (`/api/daily-logs`) feeding case summaries.

## 2) Database Migration
Run:

```bash
psql "$DATABASE_URL" -f server/db/migrations/20260415_dual_portal_upgrade.sql
```

Migration file:
- `server/db/migrations/20260415_dual_portal_upgrade.sql`

## 3) Backend Setup
1. Install API dependencies:
```bash
npm --prefix server install
```
2. Copy env template:
```bash
cp server/.env.example server/.env
```
3. Set required variables in `server/.env`:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLIENT_ORIGIN`
- Optional SMTP vars for activation mail
4. Start API:
```bash
npm run dev:api
```

## 4) Frontend Setup
1. Install dependencies:
```bash
npm install
```
2. Ensure:
- `VITE_API_BASE_URL=http://localhost:4000`
3. Start frontend:
```bash
npm run dev
```

## 5) Key REST Endpoints

### Athlete portal activation
- `PATCH /api/athletes/:athleteId/portal-activation`

Example request:
```json
{
  "isPortalActivated": true,
  "sendActivationEmail": true
}
```

Example response:
```json
{
  "message": "Athlete portal activated.",
  "athlete": {
    "id": "uuid",
    "is_portal_activated": true,
    "portal_activated_at": "2026-04-15T10:10:00.000Z"
  },
  "activationEmailSent": true
}
```

### Athlete login
- `POST /api/auth/athlete/login`

Example request:
```json
{
  "email": "athlete@domain.com",
  "password": "secret123"
}
```

### CSV export
- `GET /api/athletes/export`
- `GET /api/athletes/:athleteId/export`

### Transactional assessments
- `POST /api/assessments/bundle`

Example request:
```json
{
  "athleteId": "uuid",
  "mentalHealth": {
    "tool": "MentalHealthScreening",
    "scores": {
      "AMHS": 13,
      "DEPSCR": 7
    },
    "totalScore": 20
  },
  "psychophysiology": {
    "session_context": "baseline",
    "hrv": { "rmssd": 42 },
    "vitals": { "rhr": 56 }
  },
  "neurocognitive": {
    "platform": "SENAPTEC Sensory Station",
    "senaptec_scores": { "reaction_time": 68 }
  }
}
```

### Interventions and progress
- `POST /api/interventions/assign`
- `GET /api/interventions/assignments`
- `POST /api/interventions/assignments/:assignmentId/progress`
- `GET /api/interventions/assignments/:assignmentId/progress`

### Chat
- `GET /api/messages/history?peerId=<id>&peerRole=<role>`
- `POST /api/messages`
- Socket events: `chat:send`, `chat:new`, `chat:mark-read`

### Consents
- `GET /api/consents`
- `POST /api/consents`
- `DELETE /api/consents/:consentId`

### Injury psychology logs
- `GET /api/injury-psychology-logs?athleteId=<id>`
- `POST /api/injury-psychology-logs`
- `PUT /api/injury-psychology-logs/:logId`
- `DELETE /api/injury-psychology-logs/:logId`

### Case formulation daily summary
- `POST /api/daily-logs`
- `GET /api/case-formulations/:athleteId/daily-summary`

Example daily-log request:
```json
{
  "athleteId": "uuid",
  "moodScore": 7,
  "stressScore": 4,
  "sleepHours": 7.5,
  "readinessScore": 8,
  "reflection": "Felt focused during training; recovery improved."
}
```

## 6) Frontend Route Additions
- Practitioner chat: `/chat`
- Athlete login: `/athlete/login`
- Athlete portal: `/athlete/portal`
  - includes assigned programs, progress updates, daily reflection logging, and practitioner chat

## 7) RBAC Model
- Practitioner routes use practitioner role checks.
- Athlete routes require athlete token and athlete-bound access.
- Admin bypass supported where implemented.

## 8) Verification Checklist
- Portal activation toggle in Case Formulation updates immediately.
- Athlete login blocked when portal is deactivated.
- CSV buttons download both global and single-athlete exports.
- IOC screening saves via `/api/assessments/bundle`.
- Interventions tab shows assignment progress and updates.
- Chat works bi-directionally and messages persist.
- Consent Save/Upload now hits backend API and returns feedback.
- Injury reflection log saves and appears in readiness tab.
- Athlete daily logs submitted in portal appear in Case Formulation daily reflection feed.
