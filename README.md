# SPPS — WinMindPerform Sport Psychology Practitioner Suite

Dual-portal sport psychology SaaS for practitioners and athletes, built with Vite + React + TypeScript, Supabase Auth/Postgres/RLS, and a Node/Express API deployed through Vercel serverless routing.

## Current Architecture

- Frontend: React 18, TypeScript, Vite, React Router v6, TanStack Query, Tailwind CSS
- Backend API: Express in `server/src/`
- Database/Auth: Supabase Postgres + Auth + RLS + Realtime
- Payments: Stripe + Razorpay
- AI: Groq-backed assistant/reporting flows
- Deployment target: Vercel SPA + `/api/*` serverless bridge

## Portals

- Practitioner portal: `/`, `/auth/login`, `/dashboard`
- Athlete portal: `/athlete/login`, `/athlete/signup`, `/athlete/dashboard`

## Repository Layout

```text
src/                    Frontend app
server/src/             Express API
api/[...path].js        Vercel serverless entrypoint
supabase/migrations/    SQL migrations
scripts/                Validation / smoke scripts
.github/workflows/      CI
```

## Local Setup

### 1. Install dependencies

```bash
npm install
npm --prefix server install
```

### 2. Configure environment variables

Copy the template and fill the values:

```bash
cp .env.example .env
```

Required local variables are documented in [`.env.example`](C:\Users\mindl\Downloads\spps-karan\.env.example).

### 3. Apply Supabase migrations

Run these in Supabase SQL Editor, in order:

1. `supabase/migrations/20260423010000_saas_core_overhaul.sql`
2. `supabase/migrations/20260423023000_athlete_onboarding_intake.sql`
3. `supabase/migrations/20260424010000_clinical_module.sql`
4. `supabase/migrations/20260424032000_practitioner_self_policy_repair.sql`
5. `supabase/migrations/20260426_handle_new_user_trigger.sql`
6. `supabase/migrations/20260426_payment_tables.sql`

If your database is older or mixed-schema, repair `user_roles` / `current_app_role()` first, then apply the migrations above.

### 4. Run the app

Frontend:

```bash
npm run dev
```

API:

```bash
npm run dev:api
```

Default local URLs:

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000/api](http://localhost:4000/api)

## Build and Validation

Recommended gates before every push:

```bash
npm run type-check
npm run lint
npm run build
npm run verify:server
npm run smoke
```

Or run the full bundle:

```bash
npm run build:full
```

## Important Runtime Notes

### Chat

The practitioner chat UI is designed for Vercel deployment using Supabase Realtime subscriptions on the `messages` table. This avoids depending on persistent WebSocket infrastructure from Vercel serverless functions.

### Athlete Signup Provisioning

New auth users must be provisioned into the public profile tables via:

- `supabase/migrations/20260426_handle_new_user_trigger.sql`

Without that trigger, athlete/practitioner profiles may appear to work temporarily in the client but fail on refresh.

### Billing / Booking

Billing and session-booking routes depend on:

- `supabase/migrations/20260426_payment_tables.sql`

If that migration is missing, checkout, wallet, payout, and booking flows will fail at runtime.

## Vercel Deployment

### Required environment variables

Frontend-safe:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
VITE_GROQ_API_KEY=
```

Server-only:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
PORT=
API_BASE_PATH=
CLIENT_ORIGIN=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
CLINICAL_AUDIT_SALT=
```

Never expose service secrets with a `VITE_` prefix.

## SQL Files Added For This Pass

- [20260426_handle_new_user_trigger.sql](C:\Users\mindl\Downloads\spps-karan\supabase\migrations\20260426_handle_new_user_trigger.sql)
- [20260426_payment_tables.sql](C:\Users\mindl\Downloads\spps-karan\supabase\migrations\20260426_payment_tables.sql)

## CI

GitHub Actions runs from:

- `.github/workflows/ci.yml`

The intended baseline is:

- type-check
- lint
- production build
- backend syntax / smoke checks

## Security

- Keep `.env` local only
- Store all deployment secrets in Vercel / provider dashboards
- Rotate any previously leaked keys before production rollout
- Do not store copyrighted DSM text in clinical records

## Next Recommended QA

- Practitioner login and dashboard load
- Athlete signup creates persistent DB profile
- Add athlete and link athlete flows
- Chat send/receive with Realtime updates
- Consent/onboarding submission
- Sessions save and reopen
- Clinical record CRUD
- Billing checkout with test provider keys
