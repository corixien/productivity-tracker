# Productivity Tracker

A web app for competing with friends on productivity. Log tasks (describe them and an AI rates them, or enter them manually), complete them to earn XP, keep a daily streak, climb ranks and compare on an all-time or weekly leaderboard. English and German, dark and light theme, installable as a PWA.

Backend: Express, PostgreSQL (Neon), bcrypt, JWT, Winston, Helmet. Frontend: vanilla JS modules and CSS, no build step.

## Setup

1. Create a Neon project (or any PostgreSQL database) and copy its connection string.
2. `cp .env.example .env` and fill in `DATABASE_URL` and a fresh `JWT_SECRET` (`openssl rand -hex 32`).
3. `npm install`
4. `npm run migrate`
5. `npm run dev` (or `npm start`, which migrates first)

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `JWT_SECRET` | JWT signing secret (required) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` for Neon in production / on Render |
| `JWT_EXPIRES_IN` | token lifetime, default `7d` |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` | optional AI task rating (without a key the app falls back to manual entry) |
| `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` | logging; DB logs older than 30 days (default) are purged |
| `CLIENT_ORIGIN`, `DATABASE_POOL_MAX`, `PORT`, `NODE_ENV` | optional |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server with `--watch` (does not migrate) |
| `npm start` | migrate, then start (what Render runs) |
| `npm run migrate` | apply new `database/migrations/*.sql` (idempotent) |
| `npm run check` | syntax-check all first-party JS (backend, frontend, service worker, tests) |
| `npm test` | unit and static frontend tests; integration tests run when `TEST_DATABASE_URL` is set |

Integration tests need a throwaway local database, for example:

```
podman run -d --name pt-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=pt -p 54329:5432 docker.io/library/postgres:16-alpine
export TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/pt
DATABASE_URL=$TEST_DATABASE_URL JWT_SECRET=x npm run migrate
npm run test:integration
```

CI (`.github/workflows/ci.yml`) runs check, migrate and the full test suite against a Postgres service.

## Deploying to Render

1. Connect the repo as a **Web Service** (free tier). `render.yaml` sets build `npm install`, start `npm start`, health check `/api/health`.
2. Set `DATABASE_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED=false`, `JWT_SECRET` and `NODE_ENV=production` in the Render dashboard. Never commit secrets.

The free tier spins down when idle, which also keeps Neon compute usage low. The first request afterwards can take up to a minute; the client retries automatically and shows a "server is waking up" banner.

## Features

- **Tasks and XP**: XP is computed on the server (`productivity x difficulty + duration/5 + bonus`) and recorded in the immutable `xp_history` table. Tasks can be completed, un-completed, edited (XP is re-priced) and deleted.
- **Ranks**: Newcomer, Bronze, Silver, Gold, Platinum, Diamond, Master, with badge artwork.
- **Multiplier**: a catch-up mechanic among friends: the friend with the least XP earns up to 1.5x, the leader 0.7x, further reduced by rank.
- **Streaks and daily goal**: consecutive days with a completed task, plus a configurable daily XP goal shown as a progress ring.
- **Leaderboard**: you and your friends, all-time or this week, with a podium for the top three.
- **Templates and recurring tasks**: save tasks as templates, add them with one click, or let daily/weekly templates add themselves.
- **Activity**: full XP history with day grouping and pagination.
- **PWA**: installable, app shell works offline, completing a task offline is queued and synced when you are back.
- **Security**: strict CSP (Helmet), per-route rate limits, tokens revoked on password change, current password required to change it, avatars resized client-side and capped server-side.
- **Accessibility**: semantic landmarks, native `<dialog>` focus handling, keyboard support, `prefers-reduced-motion`, audited with axe in both themes.

## API

All routes except register, login, `/api/meta`, `/api/health` and `/api/ai/status` need `Authorization: Bearer <token>`. The client sends `X-Timezone` so streaks and "today" follow the user's local day. Errors look like `{ "success": false, "error": "...", "code": "..." }`.

| Route | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | auth |
| `GET /api/users/:username` | own profile, or public fields of someone else |
| `PUT /api/users/:username` | update language and goals |
| `POST /api/users/:username/password` | change password (needs `currentPassword`, returns a new token) |
| `POST /api/users/:username/avatar`, `POST /api/users/:username/change-username` | avatar (max 512 KB), username |
| `GET/POST/DELETE /api/users/friends` | friends |
| `GET /api/users/quick-tasks`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /:id/use`, `POST /spawn-recurring` | templates and recurring tasks |
| `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`, `POST /api/tasks/:id/complete` | tasks (`PUT` edits fields and/or toggles `completed`) |
| `GET /api/xp`, `GET /api/xp/stats` | XP history (paginated), streak / today / week / daily goal |
| `GET /api/leaderboard?period=all\|week` | leaderboard |
| `GET/PUT /api/settings` | language, goals, daily XP goal |
| `GET/POST/PUT/DELETE /api/goals` | long-term goals |
| `POST /api/groq/rate`, `GET /api/groq/status` | AI task rating (legacy `/api/ai/*` kept) |
| `GET /api/meta` | rank thresholds and multipliers |
| `GET /api/health` | health check |

## Project structure

```
index.html, sw.js, offline.html, manifest.json
css/        tokens (themes), base, components, layout, views
js/         app.js, core/ (api, auth, state, i18n, dom, ui, ranks, theme, pwa, data), features/ (one module per view)
backend/    index.js, routes/, controllers/, models/, services/, middleware/, utils/
database/   migrate.js, migrations/, migrate-data.js (one-time SQLite import)
scripts/    check.js
test/       unit, frontend static checks, integration
Badges/     rank badge images
```

`AGENTS.md` has the detailed architecture, invariants and conventions.

## Known limitations

- Rate limits and the multiplier audit are per process (in memory); fine for a single instance.
- Avatars live in the database as small JPEG data URLs; use object storage if the user base grows large.
- Only completing an existing task is queued offline; creating or editing tasks needs a connection.
- No push notifications (they would need a push service and VAPID keys); feedback is in-app.

## Credits

Built with Kilo Code and Claude. Deployed on Render. Database: Neon. Main contributor: Mateo Rettenberger.
