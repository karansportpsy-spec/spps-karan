# SPPS Production Overhaul Blueprint

## Current Architecture
- Frontend: Vite + React + TypeScript with a mix of page-local Supabase queries and partial API usage.
- Backend: Express + PostgreSQL pool for newer transactional flows only.
- Auth: Supabase Auth, but runtime still carries both legacy `portal_user_id` and newer auth-backed assumptions.
- Core risk: schema drift between `supabase-schema.sql`, live migrations, frontend queries, and backend route expectations.

## Improved Architecture
- Auth source of truth: `auth.users` + `user_profiles`.
- Role surfaces: `practitioner_profiles`, `athlete_profiles`.
- Relationship model: `practitioner_athlete_relationships` with `pending`, `active`, `archived`.
- Commerce model: `token_wallets`, `token_ledger`, `payment_orders`, `payment_webhook_events`, `practitioner_payout_accounts`.
- Booking model: `practitioner_availability`, `session_booking_requests`, `session_bookings`, `video_rooms`.
- Communication model: active relationship gates write access, archived relationship preserves read-only history.

## Why This Refactor
- Dashboard and athlete flows were failing because the app relied on RPCs that were not guaranteed to exist in the live schema cache.
- Many frontend reads were still tightly coupled to old `athletes.practitioner_id` ownership rather than relationship-based access.
- Messaging, payment, booking, and token charging were not coordinated through a single transaction-safe backend layer.

## Rollout Strategy
1. Run the new migration in `supabase/migrations/20260423010000_saas_core_overhaul.sql`.
2. Keep compatibility fallbacks on existing pages while new tables are populated.
3. Migrate high-traffic reads to the new relationship- and wallet-backed services first.
4. Move session booking and paid messaging to backend APIs only.
5. Retire direct page-level Supabase writes once the new flows are live.
