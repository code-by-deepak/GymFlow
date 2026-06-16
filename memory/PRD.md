# GymFlow — Gym Membership & Renewal SaaS

A multi-tenant mobile SaaS for **gym owners** (not members) to manage memberships, automate WhatsApp renewal reminders, and reduce churn. Built with Expo (React Native + TypeScript) + FastAPI + MongoDB.

## Stack

- **Frontend**: Expo SDK 54, expo-router (file-based), React Native, TypeScript, `react-native-gifted-charts`, `expo-notifications`.
- **Backend**: FastAPI + Motor (async MongoDB), JWT auth (bcrypt + python-jose), httpx for upstream push relay.
- **Auth**: Custom JWT (signup/login/forgot/reset). Multi-tenant scoping via `gym_id` claim.
- **Push**: Emergent-managed push (relay via `EMERGENT_PUSH_KEY`, populated at deploy time).
- **WhatsApp**: **MOCKED** sender (random delivered/sent/failed). Real WhatsApp Cloud API credentials are stored in Settings but not yet used to deliver.

## Multi-tenant architecture

- Every record (members, plans, payments, renewals, reminders, settings, gyms) carries a `gym_id`.
- `get_current_user` extracts `gym_id` from JWT and EVERY route filters by it.
- New signup auto-creates: gym + owner user + default settings + 4 default plans.

## Features

### Auth
- Signup (gym_name, owner_name, mobile, email, password) → creates gym + owner + seeds plans.
- Login (email/password) → JWT (24h).
- Forgot password → reset token (logged in dev). Reset endpoint accepts token + new password.

### Onboarding (4 steps)
1. Gym info (name, address, phone)
2. Create first custom plan
3. Add first member
4. Toggle WhatsApp reminders

### Dashboard
- 6 metric cards: total / active / expiring_soon / expired / renewals this month / monthly revenue.
- 3 charts (gifted-charts): membership growth (6mo bar), revenue trend (6mo area line), expiry trend (next 4 weeks bar).
- Quick actions: Add member, View expiring, Run reminders, New plan.

### Members
- List with search (name/phone), filter chips (All/Active/Expiring/Expired).
- Detail screen: profile + membership + personal info + payment history + reminder history.
- Add/Edit/Delete. Auto-calculated `expiry_date = start_date + plan.duration_days`.
- Auto status: `active` / `expiring_soon` (≤7d) / `expired` (past).

### Plans
- CRUD. Cannot delete if members are subscribed.
- Default seeds: Monthly (30d), Quarterly (90d), Half Yearly (180d), Annual (365d).

### Renewal
- Bottom-sheet flow: choose plan → confirm amount → confirm new expiry → renew.
- Smart start: extends from current expiry if still active, else today.
- Logs renewal + payment record. Fires push notification.

### Reminders
- Schedule: `[7, 2, 1, 0, -3]` days from expiry (configurable in Settings).
- `POST /api/reminders/run` scans members, sends due reminders via MOCKED WhatsApp.
- Logs every reminder with status (delivered/sent/failed) — idempotent per day.
- Manual send from member detail.

### Expiring Members screen
- Three sections: Expiring Today / Next 7 days / Expired. Quick renew.

### Settings
- Gym profile (name/address/phone).
- WhatsApp Cloud API credentials (saved but MOCKED for now).
- Reminder templates (upcoming/today/expired) with `{member_name}, {expiry_date}, {gym_name}` variables.
- Enable/disable reminders.
- Logout.

## API surface (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/signup | New gym + owner |
| POST | /auth/login | Issue JWT |
| POST | /auth/forgot-password | Issue reset token |
| POST | /auth/reset-password | Set new password |
| GET  | /auth/me | Current user + gym |
| PATCH| /gym | Update gym profile |
| GET/PATCH | /settings | Read/update gym settings |
| GET/POST/PATCH/DELETE | /plans, /plans/{id} | Plans CRUD |
| GET/POST | /members, /members?status_filter= | List/Create member |
| GET/PATCH/DELETE | /members/{id} | Member detail + edit + delete |
| POST | /members/{id}/renew | Renew membership |
| GET  | /expiring | Today / 7d / expired buckets |
| GET  | /dashboard | Metrics + charts |
| GET  | /reminders | Reminder logs |
| POST | /reminders/send | Send single reminder |
| POST | /reminders/run | Scan & send all due |
| POST | /register-push | Register device with Emergent push |
| GET  | /health | Health check |

## Known limitations

- WhatsApp sender is **MOCKED**. Plug real WhatsApp Cloud API in `_mock_whatsapp_send` once user has Meta credentials.
- Push notifications work only after **deploy + generate build** (not Expo Go).
- Background scheduler isn't wired — owner taps "Run now" to trigger reminders (can be cron-replaced later).
- No real email delivery for forgot password — token printed in backend logs (dev mode).
