# Swish QA System

Professional call-quality management platform for Swish — call audits, agent
coaching, escalation workflows and performance analytics in one app.

Built with **React 19 + Vite + Tailwind v4** on the frontend, **Express + PostgreSQL**
on the backend, and **Google Gemini** for the in-app AI assistant.

---

## Features

- 📞 **Call audits** — QA team scores calls across 5 sections (Communication,
  Process Adherence, Problem Solving, Empathy, Efficiency) using weighted
  criteria that supervisors configure from the UI.
- 🔁 **Multi-stage workflow** — every evaluation routes through review stages
  (QA → Team Lead → Agent) with inline escalation, override and full history.
- 🎯 **Coaching sessions** — Team Leaders schedule coaching for agents, log
  weaknesses, notes and improvement plans.
- 📊 **Analytics dashboards** — team performance, LOB reporting, drop-point
  daily metrics, top/bottom performers, trends by brand/call-type, pain-point
  analysis. Powered by Recharts.
- 🔒 **Activity audit log** — every state-changing request is recorded with
  user, IP, user-agent, action and status. Supervisor-only clear/delete.
- 🛎️ **Notifications** — in-app notifications when an evaluation is created,
  escalated, responded to, or a coaching session is scheduled.
- 🤖 **AI Assistant** — Gemini-powered helper (optional — enabled when
  `GEMINI_API_KEY` is set).
- 🌐 **Bilingual** — all evaluation criteria can be authored in English and
  Arabic side by side.

## Tech stack

| Layer    | Stack |
|----------|-------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind v4, react-router 7, recharts, lucide-react, motion |
| Backend  | Express 4, jsonwebtoken, bcryptjs, cors |
| Database | PostgreSQL via `pg` (adapter in [`db.ts`](db.ts) emulates the better-sqlite3 sync API) |
| AI       | `@google/genai` (Gemini) |
| Build    | Vite for the SPA, esbuild for a single CJS server bundle |

## Quick start

### Prerequisites

- Node.js **18+**
- A PostgreSQL database (local Postgres, Docker, Railway, Neon, Supabase, …)
- _(Optional)_ Google Gemini API key for the AI assistant

### 1. Install

```bash
git clone https://github.com/swish-code/Swish_QA_System.git
cd Swish_QA_System
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/swish_qa
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
GEMINI_API_KEY=          # optional
ADMIN_PASSWORD=          # optional — bootstrap password for the first supervisor
```

See [`.env.example`](.env.example) for every supported variable.

### 3. Run

```bash
# Development (hot reload, Vite dev middleware)
npm run dev

# Production build + run
npm run build
npm start
```

The app serves on **http://localhost:3000** (both API and SPA).

On the first boot the server creates the database schema and seeds a single
supervisor account:

| Username | Password                                       |
|----------|------------------------------------------------|
| `admin`  | `ADMIN_PASSWORD` env var, or `admin123` if unset |

> ⚠️ **Change the admin password immediately after first login.**

## npm scripts

| Script        | Purpose |
|---------------|---------|
| `npm run dev` | Run the Express + Vite dev server (`tsx server.ts`) on :3000. |
| `npm run build` | Build the SPA (`vite build` → `dist/`) and bundle the server (`esbuild` → `dist/server.cjs`). |
| `npm start`   | Run the production bundle (`node dist/server.cjs`). Requires `build` first. |
| `npm run lint` | TypeScript type check only (`tsc --noEmit`). |
| `npm run clean` | Remove `dist/`. |

## Deploy on Railway

This repo ships with [`railway.json`](railway.json) — one-click deploy:

1. Create a new Railway project from this GitHub repo.
2. Add a **PostgreSQL** plugin to the project.
3. On the web service, set the env vars:
   - `DATABASE_URL` → reference the Postgres plugin: `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` → a long random string
   - `GEMINI_API_KEY` → optional
   - `ADMIN_PASSWORD` → optional (bootstrap password for the first supervisor)
   - `NODE_ENV` → `production`
4. Deploy. Railway runs `npm ci && npm run build` then `node dist/server.cjs`.
   Health check: `GET /api/health`.

## Project layout

```
.
├── server.ts               # Express server: routes, auth, audit logging, DB seed
├── db.ts                   # PostgreSQL adapter (better-sqlite3-compatible API)
├── index.html              # Vite SPA entry
├── src/                    # React app
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/              # Route components
│   ├── components/         # Shared UI
│   └── context/            # AuthContext, ThemeContext
├── public/                 # Static assets
├── vite.config.ts
├── tsconfig.json
├── railway.json            # Railway deploy config
├── .env.example            # All supported env vars
└── package.json
```

## API surface

All endpoints are under `/api/*` and return JSON. Authenticated routes expect
`Authorization: Bearer <JWT>` issued by `POST /api/login`.

| Resource | Endpoints |
|----------|-----------|
| **Health / Auth** | `GET /health`, `POST /login` |
| **Users**         | `GET /users`, `POST /users` |
| **Forms (legacy)**| `GET /forms`, `POST /forms` |
| **Form settings (dynamic criteria)** | `GET /settings/form`, `POST /settings/form`, `DELETE /settings/form/:id` |
| **Evaluations**   | `GET /evaluations` (paginated, filterable), `POST /evaluations`, `PUT /evaluations/:id` |
| **Workflow**      | `POST /evaluations/:id/tl-action`, `POST /evaluations/:id/qa-action`, `POST /evaluations/:id/escalation-respond`, `GET /evaluations/:id/escalation-history` |
| **Coaching**      | `GET /coaching`, `POST /coaching` |
| **Notifications** | `GET /notifications?user_id=…`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| **Escalations**   | `GET /escalations/history` |
| **Audit logs**    | `GET /audit-logs`, `POST /audit-logs/clear`, `DELETE /audit-logs/:id` _(supervisor only)_ |
| **Analytics**     | `GET /stats/team`, `GET /stats/lob`, `GET /stats/drop-point`, `GET /stats/dashboard`, `GET /stats/analysis` |

## Database schema

Created automatically on first server boot (`CREATE TABLE IF NOT EXISTS …`).

| Table | Purpose |
|-------|---------|
| `users`              | Accounts. Roles: `supervisor` / `qa` / `tl` / `agent`. `tl_id` builds the reporting tree. |
| `form_settings`      | Dynamic, bilingual evaluation criteria (brands, call types, sections, weighted questions). |
| `form_config`        | Legacy form field definitions (kept for backwards compatibility). |
| `evaluations`        | Submitted call audits — score, status, brand, call type, JSONB payload with responses. |
| `coaching_sessions`  | TL-scheduled coaching for agents. |
| `escalation_logs`    | Full chain of every escalation/override on an evaluation. |
| `notifications`      | Per-user in-app notifications. |
| `audit_logs`         | Activity audit trail of every state-changing request. |

> **No migration framework** is used — schema lives as raw `CREATE TABLE …`
> statements at the top of [`server.ts`](server.ts). For schema changes in
> production, write an explicit `ALTER TABLE` migration before deploying.

## Environment variables

See [`.env.example`](.env.example) for the authoritative list. Summary:

| Variable          | Required | Default      | Purpose |
|-------------------|----------|--------------|---------|
| `DATABASE_URL`    | yes      | —            | PostgreSQL connection string. |
| `JWT_SECRET`      | recommended | dev fallback | Signing secret for JWT auth tokens. |
| `GEMINI_API_KEY`  | no       | —            | Enables the in-app AI assistant. |
| `ADMIN_PASSWORD`  | no       | `admin123`   | Bootstrap password for the auto-seeded supervisor account. |
| `NODE_ENV`        | no       | `development`| Set to `production` on hosted deploys. |
| `DISABLE_HMR`     | no       | —            | Set to `true` if Vite's HMR websocket can't reach the client. |

## Security checklist for production

- [ ] `JWT_SECRET` set to a long random string (never the dev fallback).
- [ ] `ADMIN_PASSWORD` set (or the first supervisor password changed from the UI immediately).
- [ ] `DATABASE_URL` uses TLS (`sslmode=require` or trusted by `pg` via `rejectUnauthorized: false` — the adapter handles this automatically for any non-localhost host).
- [ ] `NODE_ENV=production` so Vite dev middleware is skipped.
- [ ] `.env*` files are never committed (covered by `.gitignore`).

## License

Proprietary — © Swish. All rights reserved.
