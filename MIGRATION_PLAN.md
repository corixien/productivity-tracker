# Productivity Tracker Backend Migration Plan

## Status

Implemented. The backend now uses Express + PostgreSQL (Neon), bcrypt password hashing, JWT authentication, isolated GROQ service, and structured logging. Firebase, SQLite, and Supabase are removed.

## Current State

- Express backend in `backend/` with routes, controllers, models, services, middleware
- PostgreSQL via Neon; schema managed by `database/migrate.js`
- bcrypt password hashing + JWT tokens
- GROQ proxy in `backend/services/groqService.js` with request/response/error logging
- Structured Winston logging persisted to `system_logs`
- Avatars stored locally in `avatars/`
- No admin APIs or admin UI
- Legacy routes `/api/ai/rate` and `/api/ai/status` maintained

## Implemented Endpoints

| Route | Purpose |
|-------|---------|
| `/api/auth/register`, `/api/auth/login`, `/api/auth/me` | Auth |
| `/api/users/:username`, `/api/users/:username/change-username`, `/api/users/:username/avatar`, `/api/users/:username/password` | User management |
| `/api/users/friends`, `/api/users/leaderboard` | Social |
| `/api/tasks`, `/api/tasks/:id/complete` | Tasks + XP |
| `/api/goals` | Goals |
| `/api/xp`, `/api/leaderboard`, `/api/settings` | XP/settings/leaderboard |
| `/api/groq/rate`, `/api/groq/status` | AI |
| `/api/ai/rate`, `/api/ai/status` | Legacy AI |

## Neon Database Setup

1. Create a Neon project and a PostgreSQL database.
2. Copy the connection string from the Neon dashboard.
3. Set it as `DATABASE_URL` in `.env`.
4. Run `npm run migrate`.
5. Use the Neon console, DB Pro tool, or any PostgreSQL client for database administration.

## Migration Scripts

- `database/migrate.js` - applies SQL migrations idempotently
- `database/migrate-data.js` - migrates users, tasks, friends, and XP history from SQLite (requires the old SQLite DB and `SQLITE_DB_PATH` env var)

## Cleanup Completed

- Removed `server.js`, `firestore.rules`, `firestore.indexes.json`, `js/firebase.js`, backup AI services, `data.json`, `server.js`, and SQLite database files
- Removed `@supabase/supabase-js` dependency
- Replaced Supabase Storage avatar upload with local file storage
- Updated `README.md`, `PROJECT_OVERVIEW.txt`, `.env.example`, `package.json`, and this document
