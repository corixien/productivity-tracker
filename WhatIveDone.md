# What I've done

A complete record of everything changed in this working session, in the order it happened. Each section lists what was done, why, and which commit carries it. The session started from commit `7bb4915` and ended at `ce95222`.

## Contents

1. [Session overview](#1-session-overview)
2. [Orientation and first cleanup](#2-orientation-and-first-cleanup)
3. [Round 1: the 25 improvements and the first redesign](#3-round-1-the-25-improvements-and-the-first-redesign)
4. [Round 2: blue liquid glass, new logo, simpler flows](#4-round-2-blue-liquid-glass-new-logo-simpler-flows)
5. [Round 3: add button, animations, streak page, ice streaks](#5-round-3-add-button-animations-streak-page-ice-streaks)
6. [Round 4: performance, admin area, schema cleanup, font, logo](#6-round-4-performance-admin-area-schema-cleanup-font-logo)
7. [Round 5: admin URL, gliding tabs, wrapped table tabs](#7-round-5-admin-url-gliding-tabs-wrapped-table-tabs)
8. [Round 6: admin database like Neon, templates table rename](#8-round-6-admin-database-like-neon-templates-table-rename)
9. [Round 7: hover zoom on boxes](#9-round-7-hover-zoom-on-boxes)
10. [Database: final schema and migrations](#10-database-final-schema-and-migrations)
11. [API: final surface](#11-api-final-surface)
12. [Frontend: final structure](#12-frontend-final-structure)
13. [Tests, tooling and CI](#13-tests-tooling-and-ci)
14. [Bugs found and fixed along the way](#14-bugs-found-and-fixed-along-the-way)
15. [Decisions and interpretations](#15-decisions-and-interpretations)
16. [Things you need to do or know](#16-things-you-need-to-do-or-know)
17. [Commit list](#17-commit-list)

---

## 1. Session overview

| Area | Before | After |
|---|---|---|
| Frontend | 9 plain JS files, one 1241-line stylesheet, multi-step task wizard | ES modules in `core/` and `features/`, CSS design system split in 6 files, blue liquid-glass look, Lexend Deca font |
| Navigation | Hamburger sidebar | Sidebar on desktop, glass dock on mobile, gliding glass lens behind the active item |
| Security | Weak CSP, tokens valid after password change, any user could read others' data | Helmet CSP, token versioning, rate limits, public-only view of other users, admin checks |
| Database | 9 tables incl. duplicated data, derived columns stored by hand | Cleaned schema, database triggers keep rank, level, XP and task count consistent |
| Features | Tasks, XP, ranks, leaderboard, friends | plus streaks and ice streaks, daily goal, weekly leaderboard, templates, activity page with charts, PWA/offline, admin area |
| Tests | none | 32 tests (unit, frontend static checks, database-backed integration), CI workflow |
| Docs | README and a stale overview | README, AGENTS.md (project guide), this file |

## 2. Orientation and first cleanup

- Read the whole project and wrote `AGENTS.md` for `productivity-tracker/` (what it does, where files are, how it works, invariants, commands, gotchas).
- Found and reported problems, then fixed them:
  - `GET /quick-tasks` was shadowed by `GET /:username` (route order in `routes/users.js`).
  - `User.monitorMultipliers` used `INTERVAL $1 MINUTES`, invalid parameterized SQL, and the error was swallowed, so the monitor never ran.
  - `.env.example` contained the real `JWT_SECRET` and `NODE_ENV="production"` (replaced with a placeholder; **the old secret is in git history and should be rotated**).
  - The XP formula was duplicated in `rankService` and `groqService`.
  - Un-completing or deleting a task subtracted the unmultiplied XP while completing awarded the multiplied XP.
- Deleted outdated files: `MIGRATION_PLAN.md`, `PROJECT_OVERVIEW.txt`, `neon.ts`, and the unused `@neon/config`, `@neon/env`, `neon` packages.
- Updated `README.md` and the workspace-level `/home/mateo/AGENTS.md` where they had become wrong.

## 3. Round 1: the 25 improvements and the first redesign

Commit `aeadf97`.

### Security and correctness
1. **Token versioning**: JWTs carry `tv` (= `users.token_version`). Changing the password bumps it and revokes all older tokens; the response returns the only valid new token. The password change now requires the current password.
2. **Avatars**: they were already stored in the database (the docs were wrong). Now the browser resizes them to 256 px JPEG and the server caps them at 512 KB.
3. **Rate limiting**: a reusable limiter factory with presets for login, AI rating, avatar upload, adding friends, password change and a general per-IP limit; expired entries are swept.
4. **Request size**: 100 KB globally, 1 MB only for the avatar route.
5. **Helmet and a strict CSP** (`script-src 'self'`, `style-src 'self'`): no inline scripts, styles or handlers; a test enforces it.
6. **XP and multiplier are updated in one transaction**; the swallowed `.catch(() => {})` calls are gone.
7. **Migration 010** drops the old delete trigger (the app computes XP itself).

### Architecture and maintainability
8. First tests (unit, frontend static checks, integration against a real Postgres, refusing non-local databases).
9. `npm run check` now syntax-checks every first-party JS file.
10. Swallowed errors are logged through `warnOnError(context)`.
11. `GET /api/meta` serves rank thresholds and multipliers so the frontend no longer duplicates them.
12. The multiplier audit runs opportunistically (throttled) instead of a `setInterval`, because the free-tier server sleeps; a log retention job purges old rows.
13. One error model: `AppError`, `asyncHandler`, and a consistent `{ success: false, error, code }` response.

### Product
14. The position multiplier is computed in SQL; the leaderboard is one query instead of N+1.
15. Streaks, a daily XP goal (progress ring) and an all-time/weekly leaderboard.
16. Tasks can be edited (XP re-priced, completed tasks book a `task_edit` difference), un-completed, and the XP history is browsable.
17. Templates with a UI.
18. PWA: manifest, service worker (app-shell cache, API never cached), install button, offline queue for completing a task.
19. Rank badges are used in the UI (resized to 256 px and renamed per rank; Platinum reuses the silver badge with a tint).

### Frontend
20. Split into modules; `app.js` shrank from 584 lines to a short bootstrap.
21. Accessibility: landmarks, native `<dialog>`, keyboard support, `prefers-reduced-motion`; audited with axe (no violations on any view, both themes).
22. Removed console logging.
23. Skeleton loaders and a "server is waking up" banner for Render cold starts.

### Ops
24. GitHub Actions workflow (`.github/workflows/ci.yml`) with a Postgres service.
25. Log retention (`LOG_RETENTION_DAYS`, default 30).

Item 26 (keep-alive pings) was skipped on purpose: Neon capped the uptime, so spinning down is good.

### Other fixes in this commit
- Migration 003 failed on fresh databases; made it re-runnable.
- `groqService` had a broken logger import and returned the raw Groq response to the client.
- POST requests were retried on any 500 (risk of duplicates); retries now only happen when it is safe.
- Any logged-in user could read another user's goals and multiplier; others now only get public fields.
- The "Remember me" checkbox was ignored.
- `PUT /api/users/:username` accepted arbitrary fields; it now only accepts `language` and `goals`.

## 4. Round 2: blue liquid glass, new logo, simpler flows

Commit `ceb42fb`.

- Re-themed to blue with Apple-style liquid glass (translucent layers, backdrop blur, bright top edge) in dark and light.
- **New logo** (`icons/logo.svg`): a glass squircle with a progress ring and checkmark. Rendered all favicon sizes, `LOGO.png` and a maskable PWA icon from it; updated theme colours.
- Removed the add-task button from the Tasks header.
- Task dialog: the XP preview moved below the options; the checkbox label became "Already done".
- Settings: one column, in the order Profile, Goals, Preferences, Credits.
- Credits text: "Built with Kilo Code and Claude. Deployed on Render. Database: Neon. Main contributor: Mateo Rettenberger." (also German and README).

## 5. Round 3: add button, animations, streak page, ice streaks

Commit `c7353cb`.

- The round plus button (lower right, Tasks page only) is now the only way to add a task, on desktop and mobile.
- **Liquid-glass interactions**: spring hover and press on buttons, a pointer-following highlight and a ripple (`core/glass.js`).
- **Gliding glass lens** behind the active sidebar/dock item (`features/nav.js`): spring movement, stretches while moving, the icon pops on arrival.
- Calmer backgrounds; bright blue only for accents.
- **Activity page** got a Duolingo-style streak section: flame and streak number, 7-day strip, ice streak storage, a 14-day XP bar chart with the daily goal line, and a 5-week calendar.
- **Ice streaks**: one is earned on every 7th streak day (max 3 stored); one is spent automatically per missed day, so up to 3 missed days in a row can be bridged; with none left the streak resets; today never counts as missed. Computed from history in `Task.computeStreaks`, with unit tests. `/api/xp/stats` now also returns `freezes`, `maxFreezes`, `nextFreezeIn` and a 35-day `days` list.

## 6. Round 4: performance, admin area, schema cleanup, font, logo

Commit `870e8f6`. This was the largest round.

### 6.1 Performance
- Measured with a relative benchmark in headless Chromium (4x CPU throttle): the Tasks page went from about 617 ms to 23 ms per frame when idle and from 535 ms to 32 ms while scrolling; the Activity page became smooth too.
- Causes fixed: animated, heavily blurred background orbs; backdrop blur on every card and list row; a fixed-attachment body background; endless animations (floating badge, flame flicker, shimmer).
- Now: one static ambient layer, real `backdrop-filter` only on large persistent surfaces (cards, sidebar, dock, toasts, dialogs), finite animations only, `content-visibility: auto` on long lists, one style write per frame for the pointer highlight.

### 6.2 More liquid glass
- Depth from layered gradients, a diagonal sheen, a bright top edge and a chromatic rim (blue left, pink right) that imitates refraction. True backdrop refraction (SVG displacement) was not used: it is Chromium-only and expensive.

### 6.3 Activity page layout
- New order: streak card (horizontal on desktop), stat tiles, chart next to calendar at equal height, history in two columns.

### 6.4 Add-button swirl
- Hover: a fast full turn while growing to 128%; leaving plays the same turn backwards and shrinks it back; tapping on mobile does the same.

### 6.5 Database cleanup and links (migration 011)
- Dropped: `profiles` (goals text lives in `users.goals`), the unused `goals` table and its API, `tasks.task_text`, `tasks.ai_score`, `users.position_based_multiplier`, `users.rank_based_multiplier`, recurrence columns.
- Added: `users.is_admin`, `users.last_seen_at`, `system_logs.user_id/username/action`, tables `uptime_samples` and `user_activity`, indexes, a CHECK that `completed` and `completed_at` agree, a CHECK on known XP sources.
- Database-level links (triggers `users_sync_progress` and `users_audit_xp`):
  - XP changes, so rank and level follow.
  - A rank changes, so XP moves into that rank's range (lowering a rank lowers XP).
  - `tasks_completed` is lowered: the oldest completed tasks are deleted and their XP is taken back (0 removes all completed tasks, pending ones stay); raising it above the real count is capped.
  - A direct XP edit that the history does not explain is booked as an `admin_adjust` row in `xp_history`.
  - SQL rank thresholds (`rank_for_xp`) are checked against `rankService` by a test.

### 6.6 Admin area
- Reachable at `/#/admin` (originally `/#/admin-4321`, see round 5); only for accounts with `users.is_admin`. `ADMIN_USERNAMES` promotes existing accounts at startup; those names cannot be registered by anyone else. The admin API answers 404 to everyone else.
- Same sidebar and dock as the app, with Database, Logs, Analytics and Back to app.
- **Database**: every table, editable in place, row delete, search; avatar object storage tab (removed again in round 6).
- **Logs**: terminal-style list of the last 100 events (`user: Completed task "X" = +21 XP`), no command line, search plus level and category filters, a Live toggle, click a line for all details. Every action goes through `logActivity` with a compact message and full metadata.
- **Analytics**: 24-hour charts for uptime, users on the site and Groq calls, plus a top-5 users leaderboard.
- **Live sync**: a server-sent-events channel (`/api/events`, `core/live.js`). Admin edits reach the affected user instantly; user actions appear live in the admin pages. The stream is only open while a tab is visible so a sleeping server can rest.
- Uptime is sampled once a minute and written in batches every 5 minutes; user activity is stored once per user and hour.

### 6.7 Other items of this round
- Removed the recurrence feature for templates (UI, API and columns).
- Logo background darkened.
- **Lexend Deca** font, self-hosted in `fonts/` (variable, SIL OFL), preloaded and precached.

## 7. Round 5: admin URL, gliding tabs, wrapped table tabs

- Commit `9435d25`: admin URL changed from `/#/admin-4321` to `/#/admin` (sub-pages `/#/admin/database`, `/#/admin/logs`, `/#/admin/analytics`); the server check is the protection.
- Commit `dda8a5f`: the gliding glass lens now also runs behind the active option of Pending/Completed, All time/This week, the database table tabs and the sign-in tabs (`core/segmented.js`); options grew on hover (reverted later, see round 7).
- Commit `7bea188`: the database table tabs wrap into rows instead of scrolling.
- From here on every change is committed and pushed without being asked (stored as a note for future sessions).

## 8. Round 6: admin database like Neon, templates table rename

Commit `175d03e`.

- Table `quick_tasks` renamed to `templates` (migration 012, including index, trigger and key names). The user-facing API path stays `/api/users/quick-tasks`.
- The database page has no pager any more: it loads up to 5000 rows and renders them in chunks of 200 while scrolling; shows "N rows" or "First 5000 of N rows".
- **Filter** (Neon style): column, operator and value rows with Add filter, Apply, Clear. Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `ILIKE`, `NOT LIKE`, `IN` (comma separated), `IS NULL`, `IS NOT NULL`. Columns and operators are validated against the catalog and a whitelist; values are bound parameters.
- **Sort**: dropdown with column plus ascending or descending.
- Filter and Sort buttons sit right of the search bar; on phones the panels open full width.
- **Cell editor**: clicking a cell opens a dialog with the full content in a multi-line field; editable columns have Save, read-only columns do not; Copy button; long values (log metadata, avatars) are fetched in full on demand. Booleans keep an on/off switch.
- `users.avatar_url` shows the real value (shortened in the list, picture preview in the editor) and is editable; empty means no avatar; only `data:image` values up to 512 KB are accepted.
- Object storage tab and endpoints removed.
- Fixed a layout bug where wide tables stretched the whole page (grid columns now use `minmax(0, 1fr)`).
- New tests for filters, sorting, cell values and avatar editing.

## 9. Round 7: hover zoom on boxes

Commit `ce95222`.

- Removed the grow-on-hover from the tab buttons (they keep the gliding highlight).
- Boxes grow slightly with a spring on hover and return when the pointer leaves: about 3% for task cards, stat tiles, leaderboard rows and podium spots, about 1.5% for the rank hero, streak card, chart and analytics cards, history groups and settings cards, 14% for the week-strip day circles. A hovered box lifts above its neighbours with a stronger shadow.
- Excluded on purpose: the data table, the log terminal, dialogs and popovers. Touch devices do not zoom by hover.
- Fixed task cards: the entry animation used `fill-mode: both`, which would have overridden the hover transform.

## 10. Database: final schema and migrations

Tables: `users`, `tasks`, `xp_history`, `friends`, `templates`, `groq_logs`, `system_logs`, `user_activity`, `uptime_samples`, `schema_migrations`.

| Migration | Content |
|---|---|
| 001 to 009 | existing history (initial schema through quick tasks) |
| 003 (edited) | made idempotent so fresh databases migrate |
| 010 | `token_version`, `daily_goal_xp`, recurrence columns, dropped delete trigger, indexes |
| 011 | schema cleanup, new columns and tables, integrity checks, rank/xp/level/task-count triggers |
| 012 | `quick_tasks` renamed to `templates` |

Migrations 011 and 012 change production data structure (tables and columns are dropped or renamed) and cannot be reversed; a Neon backup branch should exist before deploying them.

## 11. API: final surface

- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Users: `GET/PUT /api/users/:username`, `POST .../password`, `.../avatar`, `.../change-username`, friends (`GET/POST/DELETE /api/users/friends`), `GET /api/users/leaderboard`, templates (`/api/users/quick-tasks`, `PUT/DELETE /:id`, `POST /:id/use`).
- Tasks: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`, `POST /api/tasks/:id/complete`.
- XP: `GET /api/xp` (paginated history), `GET /api/xp/stats` (streak, ice streaks, today, week, 35-day breakdown, goal).
- Leaderboard: `GET /api/leaderboard?period=all|week`. Settings: `GET/PUT /api/settings`.
- AI: `POST /api/groq`, `/api/groq/rate`, `GET /api/groq/status`, legacy `/api/ai/*`.
- Public: `GET /api/meta`, `GET /api/health`.
- Live: `GET /api/events` (server-sent events).
- Admin (404 for non-admins): `GET /api/admin/tables`, `GET /api/admin/tables/:table` (search, `filters`, `sort`, `dir`), `GET .../:key/cell`, `PATCH/DELETE .../:key`, `GET /api/admin/logs`, `GET /api/admin/analytics`.
- Removed: `/api/goals`, `/api/users/profile`, `/api/settings/profile`, spawn-recurring, admin storage.

## 12. Frontend: final structure

```
index.html, sw.js, offline.html, manifest.json
css/        fonts, tokens (themes, glass tokens), base, components, layout, views
fonts/      Lexend Deca (variable woff2, license)
js/         app.js, theme-boot.js
  core/     api, auth, state, data, i18n, dom, ui, ranks, theme, pwa, glass, live, segmented
  features/ nav, auth-view, dashboard, task-dialog, templates, activity, streak, stats,
            leaderboard, settings, charts, shared, admin/ (database, logs, analytics)
```

Languages: English and German for every string (a test enforces key parity and usage). Themes: system, dark, light.

## 13. Tests, tooling and CI

- `npm run check`: syntax-checks all first-party JavaScript (81 files).
- `npm test`: 32 tests.
  - Unit: ranks, XP formula, position multiplier, streaks and ice streaks, rate limiter, token versioning, validators, timezone.
  - Frontend static: translation parity and usage, service worker precache list, no inline script/style/handlers, no emoji.
  - Integration (needs a local `TEST_DATABASE_URL`): auth, task lifecycle, editing, friends and multiplier, templates, settings, avatar caps, password revocation, log retention, database triggers, admin API (access, edits, filters, sorting, logs, analytics, live sync).
- CI: `.github/workflows/ci.yml` runs check, migrate and the tests against a Postgres service.
- Browser checks used during development (not committed, run with Playwright and axe): login and task flows, offline queue, admin flows with two browsers for live sync, accessibility on every view in both themes, overflow checks at 360 to 768 px, a performance benchmark.

## 14. Bugs found and fixed along the way

- Route shadowing for `/quick-tasks`; broken multiplier monitor SQL; real JWT secret in `.env.example`.
- XP asymmetry between completing and un-completing.
- Fresh-database migration failure (003).
- Broken logger import and raw Groq response leak in `groqService`.
- Unsafe POST retries; missing "Remember me"; over-permissive profile update; cross-user data exposure.
- A stale multiplier in the task preview (the multiplier is now refreshed when the dialog opens and on every `me` call).
- Deep links (like the admin URL) were lost on the sign-in screen.
- Nested `position: fixed`/overflow issues on small screens (long German button labels, wide tables).
- Light-theme contrast problems found by axe (faint text, success and danger colours, gold place label).
- `replaceChildren(null)` printed "null" in the row count.
- SVG chart grid lines collided with the Activity layout class `chart-grid`.
- Hover transform was ignored on task cards because of the animation fill mode.

## 15. Decisions and interpretations

- "Object storage" was interpreted as the avatar images (Neon has no separate object storage); that tab was later removed on request.
- Admin identity: accounts with `is_admin` (set from `ADMIN_USERNAMES`) plus the `/#/admin` route; the URL is public knowledge, the server check is the protection.
- Lowering the task count deletes completed tasks and takes their XP back; pending tasks stay.
- Filter and Sort were placed right next to the search bar.
- "Dexend Leca" was read as **Lexend Deca**.
- "Zoom out" on boxes was read as a small zoom in on hover.
- Real backdrop refraction was replaced by gradients and a chromatic rim for performance and browser support.

## 16. Things you need to do or know

- **Rotate `JWT_SECRET`**: the old value was committed in `.env.example` and is in git history.
- **Set `ADMIN_USERNAMES`** on Render to your username, or nobody can use the admin area.
- **Create a Neon backup branch** before deploying migrations 011 and 012 if you have not already.
- The `origin` remote still embeds an expired token. Pushes are done through the `gh` login (`git -c credential.helper='!gh auth git-credential' push https://github.com/corixien/productivity-tracker.git main`). Fix with `gh auth setup-git` or a new token.
- The live channel is single-instance (in memory); rate limits are per process.
- Only completing an existing task is queued offline.
- No push notifications (they would need a push service and VAPID keys).
- Original badge artwork was replaced by 256 px versions; the originals remain in git history.

## 17. Commit list

| Commit | Summary |
|---|---|
| `aeadf97` | security hardening, redesign, PWA, streaks, templates, tests |
| `ceb42fb` | blue liquid glass, new logo, simpler task flow and settings |
| `c7353cb` | streak page with ice streaks, floating add button, glass animations |
| `870e8f6` | performance pass, admin area, schema cleanup, Lexend Deca, darker logo |
| `9435d25` | admin route is now `#/admin` |
| `dda8a5f` | gliding glass lens for tab strips |
| `7bea188` | database table tabs wrap into rows |
| `175d03e` | admin database: filters, sort, cell editor; templates table rename |
| `ce95222` | boxes zoom on hover, tab buttons do not |
