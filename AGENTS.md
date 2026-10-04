# AGENTS.md

Project guide for agents. Complements `/home/mateo/AGENTS.md` (workspace-level rules: subagent model, secrets, Neon IDs) — read both.

## What it is

Web app for friend groups competing on productivity. Users register/login (username + password), log tasks (natural language, optionally AI-rated), complete them to earn XP, climb ranks (Newcomer, Bronze, Silver, Gold, Platinum, Diamond, Master), keep streaks and a daily XP goal, compare on an all-time/weekly leaderboard, reuse tasks as templates. UI languages: English and German. Installable PWA. Admin area for the owner.

## Stack

- Frontend: vanilla JS ES modules, single `index.html`, plain CSS split by concern, Lexend Deca font self-hosted in `fonts/`. Visual style: calm blue "liquid glass" with bright blue only as accent (translucent gradients, heavy backdrop blur, bright top edge, spring hover/press animations (buttons and boxes zoom slightly on hover; tab buttons do not), a gliding glass lens behind the active nav item and the active option of every segmented control/tab strip via `core/segmented.js`) driven by `--glass-*` and `--blur` tokens in `css/tokens.css`. No framework, no bundler, no build step.
- Backend: Node >=18 (CI uses 22), Express 4, `pg` pool, bcrypt, JWT, Winston, Helmet.
- DB: PostgreSQL on Neon. Deploy: Render free tier (`render.yaml`). The service is allowed to spin down; do not add keep-alive pings.
- AI: Groq API proxied via backend (key never reaches the browser). A 404 on the model makes `groqService` pick a usable chat model from Groq's `/models` and remember it. Env values must not contain `<>` placeholders.

## Layout

```
index.html                  SPA shell: static markup + <dialog>s (no inline script/style: strict CSP)
sw.js, offline.html         service worker (app-shell cache, API never cached) + offline page
manifest.json               PWA manifest
css/                        fonts -> tokens (themes) -> base -> components -> layout -> views
js/
  app.js                    bootstrap and wiring
  theme-boot.js             classic script in <head>: applies saved theme before first paint
  core/                     api (fetch, retry, offline queue), auth, state (store + event bus), data (loaders), live (SSE client),
                            i18n (EN/DE), dom (h(), icons, formatters), ui (toasts, banners, dialogs), ranks, theme, pwa, glass (pointer highlight + ripple for the liquid-glass buttons), segmented (gliding lens for tab strips)
  features/                 nav (hash routing), auth-view, dashboard (hero + task list), task-dialog (add/edit),
                            templates, activity, streak (streak card, charts, calendar), leaderboard, settings, stats, charts (SVG), shared, admin/ (database, logs, analytics)
backend/
  index.js                  Express entry (exports app; listens only when run directly)
  config.js                 env readers
  routes/                   thin route tables
  controllers/              handlers wrapped in asyncHandler, throw AppError
  models/                   SQL: User, Task, QuickTask (templates)
  services/                 rankService (thresholds, XP formula, multipliers, meta), groqService, avatarService,
                            loggingService (logActivity: compact log + admin feed), retentionService, adminService,
                            activityTracker (user_activity/last_seen), uptimeService (minute samples)
  middleware/               auth, validation, rateLimiter (factory + presets), security (Helmet CSP), timezone, errorHandler
  utils/                    database, jwt, password, logger, validation, errors (AppError, asyncHandler, warnOnError), events (SSE hub)
database/                   migrate.js, migrations/NNN_*.sql (next = 019), migrate-data.js (one-time SQLite import)
scripts/check.js            syntax-checks every first-party JS file
test/                       node:test suites (unit, frontend static checks, integration)
Badges/ icons/ LOGO.png     static assets (Badges: one PNG per rank, Platinum reuses silver with a tint; icons/logo.svg is the logo source, PNG icons and LOGO.png are rendered from it)
```

## Commands (run from this directory)

- `npm run check` — syntax check of backend, database, scripts, tests, frontend, `sw.js`.
- `npm test` — unit + frontend static checks; the integration suite is skipped unless `TEST_DATABASE_URL` is set.
- Integration tests: start a throwaway Postgres (`podman run -d -e POSTGRES_PASSWORD=test -e POSTGRES_DB=pt -p 54329:5432 docker.io/library/postgres:16-alpine`), then `DATABASE_URL=<url> npm run migrate` and `TEST_DATABASE_URL=<url> npm run test:integration`. The suite refuses non-localhost URLs. Never point tests or migrations at the Neon production DB (`.env` holds it; shell-provided `DATABASE_URL` takes precedence over `.env`).
- `npm run dev` / `npm start` (migrate + server, what Render runs) / `npm run migrate` / `npm run migrate:data`.
- CI: `.github/workflows/ci.yml` (Postgres service, check, migrate, test).
- Git: the owner wants every change committed and pushed to `main` right away (pushing deploys to Render and runs migrations). `origin` has an expired token embedded; push through the `gh` login: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/corixien/productivity-tracker.git main`.
- `FEATURES.md` lists and explains every feature (read it before changing behavior); keep it in sync when a feature changes.

## Request flow

`routes/X.js` -> middleware (authenticate, rate limiters, validation) -> `controllers/X.js` -> `models/X.js` -> `utils/database.query|transaction`. `/api/*` is `no-store`, rate-limited per IP (300/min), and gets `req.tz` from the `X-Timezone` header (the client always sends it). Errors: `{ success: false, error, code }`; throw `AppError` (or helpers `notFound`, `conflict`, ...) inside `asyncHandler`; only 5xx are persisted to `system_logs`.

Public: `GET /api/health`, `GET /api/meta` (rank thresholds/multipliers), `GET /api/ai/status` and `/api/groq/status`, register/login. Everything else requires a Bearer token.

## API surface

`/api/auth` (register, login, me) · `/api/users` (me, friends, leaderboard alias, `monitor-multipliers`, quick-tasks incl. `:id/use`, then `:username` get/put/password/avatar/change-username) · `/api/tasks` (CRUD, `PUT` edits fields and/or toggles `completed`, `:id/complete`) · `/api/xp` (history, paginated) and `/api/xp/stats` (streak, today, week, daily goal) · `/api/leaderboard?period=all|week` · `/api/settings` · `/api/events` (SSE) · `/api/admin/*` (tables with filters/sort/cell values, logs, analytics) · `/api/groq` (`/`, `/rate`, `/status`) · legacy `/api/ai/rate`, `/api/ai/status` (kept on purpose) · `/api/meta` · `/api/health`. Templates keep the API path `/api/users/quick-tasks` although the table is `templates`. Full list: README.md.

## Database

Tables: `users`, `tasks`, `xp_history` (audit log), `friends` (directional), `templates` (task templates, renamed from quick_tasks in migration 012), `groq_logs`, `system_logs` (activity log: `user_id, username, action, message, metadata`), `user_activity` (user x hour, analytics), `uptime_samples` (minute samples, analytics), `schema_migrations` (filename + SHA-256), view `v_user_integrity`. `users` carries `xp, level, rank, goals, multiplier, last_multiplier_check, tasks_completed, token_version, daily_goal_xp, is_admin, last_seen_at`. Avatars are small JPEG data URLs in `users.avatar_url` (client resizes to 256 px, server caps at 512 KB). Migrations are the schema source of truth.

Links enforced in the database (`users_sync_progress`, `users_audit_xp` triggers, migration 011): `rank` and `level` always follow `xp`; changing `rank` moves `xp` into that rank's range; lowering `tasks_completed` deletes the oldest completed tasks and takes their XP back (0 removes all completed tasks, raising it is capped at the real count); a direct change of `xp` that `xp_history` does not explain is booked as an `admin_adjust` row; `tasks.completed` and `completed_at` must agree (CHECK). SQL rank thresholds (`rank_for_xp`) must match `rankService` (integration test). Migration 014 adds: unique `lower(username)`, CHECKs on `users.language`/`rank`, a covering index on `xp_history (user_id, created_at DESC) INCLUDE (xp_amount)`, and the view `v_user_integrity` (should be empty; lists users whose `xp`/`tasks_completed` drift). `migrate.js` stores a SHA-256 per applied migration and refuses to run if an applied file was edited.

## Game mechanics

- Task XP: `(12 + productivity * difficulty) * effectiveMinutes / 60` + bonus capped at 10%; effective minutes = 120 full, next 240 at half weight, rest at a quarter; under 30 min rounds down; 0 if productivity is 0 (`rankService.calculateXpFromTask`, constants `XP_FORMULA` also served via `/api/meta`; the frontend mirrors it for previews in `core/ranks.js`, server wins). Do not reintroduce a duration-independent term (it made tiny tasks farmable).
- Completing: awards `round(xp_awarded * multiplier)` as an `xp_history` row (`task`). Uncomplete (`task_uncomplete`) and deleting a completed task (`task_delete`) subtract what was actually awarded (`SUM(xp_history)` for that task). Editing a completed task books the difference as `task_edit`, keeping the multiplier used at completion.
- `users.xp = SUM(xp_history.xp_amount)`; `level = floor(xp/100)`; rank from thresholds 0/360/1080/2160/4320/8640/18000 (migration 015; Master = about one year at the 50 XP daily goal, change them together in `rankService`, `js/core/ranks.js` fallback and the SQL functions `rank_for_xp`/`rank_min_xp`/`rank_max_xp` via a new migration).
- Multiplier (catch-up mechanic) = `clamp(((avg friend XP + 150) / (own XP + 150)) ^ 0.4, 0.85, 1.3)`, no friends = 1.0, no rank penalty (`rankService.computePositionMultiplier`, constants `MULTIPLIER`). Recomputed inside every XP transaction; `User.monitorMultipliersThrottled` audits stale users opportunistically (leaderboard requests, at most every 5 min) because the server sleeps. Existing completed tasks keep their stored `xp_awarded`; only new and edited tasks use the formula.
- Concurrency: every XP-changing transaction in `Task` (`setCompleted`, `update`, `delete`) first takes `lockUser` (`SELECT ... FROM users FOR UPDATE`), then the task row, so one user's XP transactions run one after another. Without it, parallel completions used stale task counts and the `users_sync_progress` trigger deleted completed tasks (fixed together with migration 017: a count refresh that also sets `last_multiplier_check` only heals the counter, only admin edits of `tasks_completed` delete tasks). Keep this lock order.
- Daily goal bonus: reaching `daily_goal_xp` task XP in a local day pays `round(goal x 0.1)` (min 1, max 100) as an `xp_history` row `daily_goal` (`rankService.calculateGoalBonus`, `GOAL_BONUS`). `bonusService.reconcileDailyGoal` runs in every transaction that changes task XP (complete, uncomplete, delete, edit of a completed task) and when the goal is edited; it books a delta row, so a day that falls below the goal gets a negative row that takes the bonus back. Goal progress, weekly XP, the trophy ranking and the first-place streaks read the view `v_task_xp` (migration 018): task XP stamped with `tasks.completed_at`, so undoing or editing an old task never changes today's or another week's total, and bonuses and trophies never count. The bonus row uses `clock_timestamp()` so it lists right above the task that reached the goal.
- First place streaks (`firstPlaceService`, `GET /api/xp/first-place`, Activity page): rebuilt from `xp_history` for you plus your friends as they are today. All time = consecutive days ranked first by total XP, weekly = consecutive Monday-Sunday weeks ranked first by task XP (needs 2+ members and score above 0; ties by name like the leaderboard). The open day/week keeps the finished streak alive until it is lost; record = longest run.
- AI language: `/api/groq` takes `language` (`en`|`de`, the UI language; saved user language as fallback) and the prompt makes the task name come back in that language.
- Weekly trophy: the player with the most task XP in the finished week (Monday-Sunday in `TROPHY_TIMEZONE`, default Europe/Berlin) among all users gets 75 XP (`xp_history` source `weekly_trophy`), nobody else. Needs 50+ week XP and a second player with XP. Settled lazily by `bonusService.awardWeeklyTrophies` (called from `/api/xp/stats` and the leaderboard; the server sleeps, so no timer), once per week via `weekly_trophies` (migration 016), looking back at most 4 weeks, never before 2026-09-28 (`TROPHY_FIRST_WEEK` overrides, tests use it). Trophy and bonus XP do not count as weekly XP or goal progress.
- Streak: consecutive local days (client timezone) with at least one completed task; today never counts as missed. Ice streaks (`Task.computeStreaks`): +1 on every 7th streak day (max 3), one is spent per missed day, no ice left resets the streak. Derived from completion history on every `/api/xp/stats` call (no stored state); the response also carries `days` (last 35 days) for the charts.

## Invariants and gotchas

- Never write `users.xp` directly from app code: do it inside a transaction via `Task.syncUserTotals` (insert `xp_history`, re-sum, update `xp` only; rank and level come from the trigger, then recalc the multiplier).
- Auth: JWT carries `tv` (= `users.token_version`). Changing the password bumps it, revoking all older tokens; the response returns the new token. `authenticate` only loads `id, username, token_version, is_admin`.
- Password change requires the current password. `PUT /api/users/:username` only accepts `language` and `goals`; other users get public fields only from `GET /api/users/:username`.
- In `routes/users.js`, fixed paths must stay above `/:username`.
- CSP is strict (`script-src 'self'`, `style-src 'self'`): no inline scripts, `style=` attributes, `on*=` handlers. Set styles through CSSOM (`el.style.x`, `--var`). `test/frontend.test.js` enforces this.
- Every new CSS/JS file must be added to the `SHELL` list in `sw.js` (the test fails otherwise); bump `VERSION` there when shell files change in a way that must invalidate caches.
- New UI text needs both `en` and `de` in `js/core/i18n.js` (test enforces key parity and usage).
- Rate limiters are in-memory (per process, reset on restart).
- Admin: `users.is_admin` (set from `ADMIN_USERNAMES` for existing accounts at boot, editable in the admin database page). `requireAdmin` answers 404 to everyone else. The route prefix is `ADMIN_PREFIX` in `features/nav.js` (`#/admin`); the URL is public, the server check is the protection.
- Live channel: `GET /api/events` (SSE, `utils/events.js`, single instance). Users get `sync` after admin edits and `revoked` when an admin deletes their row; admins get `log` and `db` events from `logActivity`. Client (`core/live.js`) keeps it open only while the tab is visible.
- Templates are unique per user over name (case/outer spaces ignored), duration, productivity, difficulty, category, bonus (migration 013); duplicates answer `409 duplicate_template`. Frontend mirror: `shared.templateKey/findTemplate`.
- Motion: `swapIn(el)` (`core/dom.js`) replays the fade-and-rise on tab/filter/step switches; lists re-render only when their data signature changes so entry animations do not replay. `.view`-level animations must not use `fill-mode: both/forwards` on `transform` (see hover note below).
- Responsive: at <= 960 px the dock (`#tabbar`) replaces the sidebar; at <= 640 px dialogs are top sheets (open from the top, keyboard-friendly) and the daily-goal ring becomes a rounded box with a filling outline (shared `--p` variable on `#goal-ring`). One hover zoom token, `--hover-grow` (6px total growth in width and height), in `css/tokens.css`; `core/glass.js` turns it into per-element `--sx/--sy` scale factors on pointerover, so every element grows by the same pixels (add new zoom selectors to `ZOOM` there).
- Log every user-visible action through `logActivity({ userId, action: 'category.verb', message })` with a compact human message (`Completed task "X" = +21 XP`); put full context in `meta`. Categories feed the admin log filters: auth, task, profile, friend, template, ai, admin, system.
- Performance rules for the glass UI: real `backdrop-filter` only on large persistent surfaces (card, sidebar, dock, toast, dialog), never on list rows or buttons; no infinite animations; the ambient background is one static layer. Refraction is faked with gradients and a chromatic inset rim (`--glass-*` tokens).
- Render free tier cold start: first request may 502/503; `core/api.js` retries and shows a "server waking up" banner. Only completing an existing task is queued offline.
- Admin logs page reads newest at the top, oldest at the bottom (as the server sends them; live lines are prepended).
- Admin database page: the server returns up to 5000 rows per request (filters, sort and search run in SQL, long cell values are cut at 200 characters and fetched in full on click); the browser renders them in chunks of 200 while scrolling. Table and column names come from the catalog, never from the request.
- Cards that zoom on hover must not use an animation with `fill-mode: both/forwards` on `transform` (it overrides the hover transform); `.view` and `.admin-db-body` use `grid-template-columns: minmax(0, 1fr)` so wide children cannot stretch the page.
- `logs/` and `.env` are gitignored; the test server logs to `LOG_DIR`. `avatars/` is an empty leftover directory (avatars live in the DB). `.recur-select` in `css/views.css` is dead CSS from the removed recurrence feature.
- Check `v_user_integrity` after any manual data work; it must be empty.

## Conventions

- CommonJS in backend, ES modules in `js/`. 4-space indent, single quotes, semicolons.
- Parameterized SQL only. Build DOM with `h()` (text nodes only); never `innerHTML` with data.
- Log through `utils/logger`/`loggingService`; swallowed errors use `warnOnError(context)` so they stay visible.
- New DB change = new migration (next number 019); never edit applied migrations (003 was made idempotent for fresh DBs, 010 and 011 reshaped the schema).
- Config via env only: `DATABASE_URL`, `JWT_SECRET` required; optional `DATABASE_SSL_REJECT_UNAUTHORIZED`, `JWT_EXPIRES_IN`, `GROQ_API_KEY`, `GROQ_MODEL` (leave unset: default `llama-3.3-70b-versatile`), `GROQ_BASE_URL`, `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` (default 30), `ADMIN_USERNAMES`, `PORT`, `NODE_ENV`, `CLIENT_ORIGIN`, `DATABASE_POOL_MAX`.
