# Productivity Tracker Backend Migration Plan

## Status

Implemented. The backend now uses Express + PostgreSQL/Supabase, bcrypt password hashing, JWT authentication, isolated GROQ service, and structured logging. The old Firebase/SQLite/Express monolith has been removed.

## Current State

- Express backend in `backend/` with routes, controllers, models, services, middleware
- PostgreSQL through Supabase; schema managed by `database/migrate.js`
- bcrypt password hashing + JWT tokens
- GROQ proxy in `backend/services/groqService.js` with request/response/error logging
- Structured Winston logging persisted to `system_logs`
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

## Remaining User Steps

1. Create Supabase project and set `.env` variables from `.env.example`
2. Run `npm run migrate`
3. (Optional) Run `node database/migrate-data.js` before deleting `data/app.db`
4. Configure Supabase Storage bucket `avatars` as public for avatar URLs
5. Set `GROQ_API_KEY` in `.env` for AI features
6. Deploy to Render using `render.yaml`

## Database Schema

- `users` - user accounts with bcrypt hashes
- `profiles` - goals and preferences
- `tasks` - task records with XP fields
- `xp_history` - immutable XP audit trail
- `friends` - friend relationships
- `goals` - long-term goals
- `groq_logs` - AI request/response logs
- `system_logs` - application logs

## Migration Scripts

- `database/migrate.js` - applies SQL migrations idempotently
- `database/migrate-data.js` - migrates users, tasks, friends, and XP history from SQLite

## Cleanup Completed

- Removed `server.js`, `firestore.rules`, `firestore.indexes.json`, `js/firebase.js`, backup AI services, `data.json`, and SQLite database files
- Updated `README.md`, `PROJECT_OVERVIEW.txt`, `.env.example`, `package.json`, and this document
