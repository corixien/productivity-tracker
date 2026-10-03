# Features

Reference of every feature of the Productivity Tracker, for future agents: what it does, how it works, where the code lives and what must not break. `AGENTS.md` has the conventions and commands, `README.md` has setup and the API table. Verified against the code at commit `1a2655e`; if code and this file disagree, the code wins, then fix this file.

Contents: [1 Accounts](#1-accounts-and-sessions) · [2 Tasks](#2-tasks) · [3 XP](#3-xp-ranks-and-levels) · [4 Multiplier](#4-multiplier-catch-up-mechanic) · [5 Streaks](#5-streaks-and-ice-streaks) · [6 Daily goal](#6-daily-goal) · [7 Templates](#7-templates) · [8 Activity](#8-activity-page) · [9 Friends and leaderboard](#9-friends-and-leaderboard) · [10 AI rating](#10-ai-task-rating-groq) · [11 Settings](#11-settings-and-profile) · [12 Admin](#12-admin-area) · [13 Live channel](#13-live-channel-sse) · [14 Database integrity](#14-database-integrity) · [15 Logging](#15-logging-and-retention) · [16 PWA](#16-pwa-and-offline) · [17 UI system](#17-ui-system) · [18 i18n](#18-internationalization) · [19 Security](#19-security) · [20 Tests and CI](#20-tests-tooling-and-ci) · [21 Deployment](#21-deployment) · [22 Removed](#22-removed-features-do-not-resurrect)

---

## 1. Accounts and sessions

- **Register / sign in** (`features/auth-view.js`, `controllers/authController.js`): username 3-30 chars `[A-Za-z0-9_-]`, password 4-128 chars (bcrypt, 12 rounds; legacy sha256 hashes still verify). Sign-in/register are two tabs with the gliding lens; password show/hide toggle; "Remember me" picks `localStorage` (on) or `sessionStorage` (off) for the token; language picker on the sign-in screen.
- **Usernames are unique ignoring case** (unique index on `lower(username)`, migration 014). Names listed in `ADMIN_USERNAMES` cannot be registered by anyone else.
- **JWT** (`utils/jwt.js`): payload `{ userId, username, tv, type: 'access' }`, lifetime `JWT_EXPIRES_IN` (default 7d). `tv` is `users.token_version`; `authenticate` loads only `id, username, token_version, is_admin` and rejects a token whose `tv` is stale (`session_revoked`).
- **Token revocation**: changing the password bumps `token_version`, so every older token dies; the response carries the one new valid token (`core/auth.js replaceAuthToken` keeps the remember choice). An admin deleting a user also revokes (see 12). The client signs out on 401 (`unauthorized` event) and on the live `revoked` event.
- **Change password** needs the current password, rate limited 5 per 15 min per user. **Change username** returns a new token. Both live in the Account dialog (Settings).
- **Session restore** (`restoreSession`): on load a stored token is validated via `GET /api/auth/me`; a network failure keeps the token and shows the sign-in screen with a network error instead of logging out.
- **Deep links** (e.g. `#/admin/logs`) survive the sign-in screen; signing out resets the hash.
- **Public view of other users**: `GET /api/users/:username` returns the full profile only for yourself; for anyone else only public fields (username, avatar, rank, level, xp). `PUT /api/users/:username` accepts only `language` and `goals`.

## 2. Tasks

Files: `models/Task.js`, `controllers/taskController.js`, `features/dashboard.js` (list), `features/task-dialog.js` (add/edit).

- **Fields**: `name`, `duration` (1-1440 min), `productivity` (0-5), `difficulty` (1-5, default 3), `category` (`learning, exercise, creative, admin, social, deep-work, other`), `bonus` (0 or 3 from the UI checkbox; stored values are kept on edit), `xp_awarded` (the base XP), `completed`, `completed_at`.
- **Tasks page**: rank hero (badge, level, rank, glowing XP bar, multiplier chip, daily-goal ring), stat tiles (streak, today, this week), Pending/Completed tabs with counts, task cards (check button, name, XP badge, category/duration/productivity/difficulty/bonus chips, edit, bookmark-as-template, delete). Empty states and skeleton loaders. The list only re-renders when its data signature changes (avoids replaying the entry animation).
- **Add button**: the round plus button (lower right, Tasks page only, `#fab-add-task`) is the only way to add a task. Hover plays a full turn while growing; leaving reverses it.
- **Add dialog is a 3-step flow** (`task-dialog.js`): (1) *describe*: free text, either "Rate with AI" (Ctrl/Cmd+Enter) or "Enter manually"; the strip below offers up to 8 templates for one-click prefill; (2) *loading*: spinner, AI call aborts after 25 s; (3) *form*: name, duration, category, productivity and difficulty sliders, bonus checkbox, live XP preview (including the multiplier), "Already done" checkbox (completes right after creating), "Save as template" checkbox. Edit mode opens straight on the form.
- **Complete**: `POST /api/tasks/:id/complete` (or `PUT` with `completed: true`). Awards `round(xp_awarded x multiplier)`; the multiplier is recalculated inside the transaction from current standings. Toasts show the XP and celebrate rank-ups, level-ups and earned ice streaks (`shared.announceProgress`).
- **Un-complete** subtracts what was actually awarded (`SUM(xp_history)` for that task). **Delete** of a completed task also subtracts it (`task_delete` row). **Edit** of XP inputs re-prices; for a completed task the difference is booked as `task_edit`, scaled by the multiplier used at completion.
- **Idempotent**: completing a completed task (or the reverse) is a no-op that returns the current totals. Rows are locked `FOR UPDATE` in the transaction.
- `GET /api/tasks` supports `completed`, `limit` (max 500, default 100 when given) and `offset`.

## 3. XP, ranks and levels

Files: `services/rankService.js` (source of truth), `core/ranks.js` (frontend mirror), `database` function `rank_for_xp`.

- **Task XP**: `round(productivity x difficulty + duration/5 + bonus)`, `0` when productivity is `0`. The frontend only previews; the server decides.
- **Ranks** by total XP: Newcomer 0, Bronze 100, Silver 300, Gold 600, Platinum 1200, Diamond 2400, Master 5000. **Level** = `floor(xp / 100)`. Rank and level are derived from `xp` by a database trigger, never set by app code.
- **`xp_history`** is the immutable ledger: `xp_amount`, `source` (`task`, `task_uncomplete`, `task_delete`, `task_edit`, `admin_adjust`), `source_id` (task id, deliberately no foreign key so history survives deletion). `users.xp = SUM(xp_amount)`. Write XP only through `Task.syncUserTotals` inside a transaction.
- **Badges**: `Badges/*.png`, one per rank (256 px); Platinum reuses the silver badge with a CSS tint. `GET /api/meta` serves thresholds and multipliers so the frontend does not duplicate them (cached in `localStorage` as fallback when offline).

## 4. Multiplier (catch-up mechanic)

Files: `models/User.js` (`recalculateMultiplier`, `getPositionMultiplier`, `monitorMultipliersThrottled`), `rankService.computePositionMultiplier`.

- `multiplier = positionMultiplier - (1 - rankMultiplier)`, rounded to 2 decimals.
- **Position**: among you and your friends, the one with the least XP gets 1.5, the leader 0.7, linear in between (`1.5 - lower/(n-1) x 0.8`); alone = 1.0. Computed in SQL.
- **Rank penalty** multipliers: Newcomer 1.0, Bronze 0.95, Silver 0.9, Gold 0.85, Platinum 0.8, Diamond 0.75, Master 0.7.
- Recomputed in every XP transaction (also refreshes `tasks_completed` and `last_multiplier_check`). Because the free-tier server sleeps there is no timer: leaderboard requests trigger `monitorMultipliersThrottled` (at most every 5 min), which re-checks stale users (up to 200) and logs a `system.audit` entry when it corrected any. `POST /api/users/monitor-multipliers` runs it on demand.
- The UI shows a chip on the hero and uses the multiplier in the task preview (refreshed when the dialog opens).

## 5. Streaks and ice streaks

Files: `Task.computeStreaks` (pure, unit-tested), `Task.getStats`, `features/streak.js`, `features/stats.js`.

- A streak day is a local day (client timezone via `X-Timezone`) with at least one completed task. Today never counts as missed.
- **Ice streaks**: +1 on every 7th streak day (max 3 stored); one is spent automatically per missed day, so up to 3 missed days in a row can be bridged; with none left the streak resets.
- **Nothing is stored**: everything is derived from completion dates on each `GET /api/xp/stats` (looks back 1500 days). Response: `streak {current, longest, activeToday, freezes, maxFreezes, nextFreezeIn}`, `today {xp, tasks, goal}`, `week {xp, tasks}` (week starts Monday), `days` (35 entries with `date, xp, tasks, status done|frozen|none, today`).
- **Activity page visuals**: flame hero with streak number and ice slots, week strip, 14-day XP bar chart with the daily goal line, 5-week calendar heatmap (weeks start Monday), three stat tiles.

## 6. Daily goal

`users.daily_goal_xp` (10-5000, default 50), edited in Settings. Shown on the Tasks hero as a ring on desktop and, at 640 px and below, as a rounded box whose outline starts at the bottom centre, runs left once around and is done when it is back at the start (same `--p` variable; the SVG path is laid out by `layoutOutline` in `dashboard.js` and re-laid on resize), turning "done" when reached; on the Activity chart as a goal line and in the calendar heat levels.

## 7. Templates

Files: `models/QuickTask.js`, `controllers/quickTaskController.js`, `features/templates.js`. Table `templates` (renamed from `quick_tasks`, migration 012); the API path stays `/api/users/quick-tasks`.

- Save from a task card (bookmark), from the add dialog checkbox, or on the Templates page. The bookmark is filled when an identical template exists; clicking toggles it, updating in place without re-rendering the list.
- **Unique**: two templates are the same when name (case and outer spaces ignored), duration, productivity, difficulty, category and bonus match. Enforced by the unique index from migration 013; violations answer `409 duplicate_template`. The frontend mirror is `shared.templateKey/findTemplate`.
- **Use** (`POST /:id/use`) creates a new pending task from the template. The Templates page has search and delete-with-confirm; the add dialog shows the newest 8 as chips.

## 8. Activity page

`features/activity.js`: streak card and charts (see 5), then the full XP history grouped by day (`GET /api/xp`, 30 per page, "load more"). Rows show source icon, text (task name or "deleted task"), time and signed XP. Search filters the loaded rows and auto-loads the rest first. The history is marked stale on any task change and reloads on next visit.

## 9. Friends and leaderboard

Files: `controllers/userController.js`, `User.getLeaderboard`, `features/leaderboard.js`.

- **Friends are directional** (`friends` table, `user_id -> friend_id`): you add by exact username (rate limit 30/hour), you see them, they do not automatically see you. Duplicate add = `409 Already friends`; remove with confirm.
- **Leaderboard** = you plus your friends in one SQL query, `?period=all|week` (week = since Monday 00:00 in the user's timezone). Podium for the top 3 (only with 3 or more entries), rows below with rank, tasks done and weekly/total XP. Both scores arrive together so switching period re-ranks instantly on the client, then refreshes quietly. Fewer than 2 entries shows an "add a friend" empty state. Two routes serve it: `/api/leaderboard` (used by the client) and `/api/users/leaderboard`.

## 10. AI task rating (Groq)

Files: `services/groqService.js`, `controllers/groqController.js`, `routes/groq.js`. Routes: `POST /api/groq` and `/api/groq/rate`, `GET /api/groq/status`, plus legacy `/api/ai/rate` and `/api/ai/status` (kept on purpose).

- The browser never sees the key. The description (max 2000 chars) plus the user's goals text goes to the Groq chat-completions API (`GROQ_MODEL`, default `groq/compound`, `GROQ_BASE_URL`); the model must return JSON `{name, duration, productivity, difficulty, category}`. The server clamps the values, sets `bonus: 0` and computes XP itself.
- Rate limit 10/min per user. Without `GROQ_API_KEY` the endpoint answers `ai_not_configured` and the UI says so; manual entry always works. `/status` is public and returns `{ configured, keyLength, model }` (no key value, but it does reveal the key length).
- Every call is written to `groq_logs` (payload, response, time, success) and appears in admin Analytics; failures log `ai.error`.

## 11. Settings and profile

`features/settings.js`, one column of cards: **Profile** (avatar upload, username/password via the Account dialog, sign out), **Goals** (free-text long-term goals, which also feed the AI prompt, and the daily XP goal), **Preferences** (language en/de, theme system/dark/light, install-app button when the browser offers it), **Credits**.

- **Avatars** are cropped to a square and resized to 256 px JPEG in the browser (`resizeImage`) and stored as a data URL in `users.avatar_url`; the server rejects anything over 512 KB (route body limit 1 MB, rate limit 5 per 10 min). Initial-letter fallback when none.
- `GET/PUT /api/settings` read and write `language`, `goals`, `dailyGoalXp` (validated).

## 12. Admin area

Files: `services/adminService.js`, `controllers/adminController.js`, `routes/admin.js`, `features/admin/{database,logs,analytics}.js`.

- **Access**: `users.is_admin`. `ADMIN_USERNAMES` promotes existing accounts at boot; the flag is also editable in the database page. `requireAdmin` answers **404** (not 403) to everyone else. The UI route is `#/admin` (sub-pages `database`, `logs`, `analytics`, plus "Back to app"); the URL is public, the server check is the protection. Admin mode swaps the sidebar/dock items and shows an admin badge.
- **Database page**: lists every table (read-only for tables not configured in `adminService.TABLES`, including views such as `v_user_integrity`). Per table: search, **Filter** (rows of column, operator, value; operators `= != > >= < <= LIKE ILIKE NOT LIKE IN IS NULL IS NOT NULL`, validated against the catalog and a whitelist, values bound), **Sort** (column plus direction), up to 5000 rows per request rendered in chunks of 200 while scrolling, long cell values cut at 200 chars. Clicking a cell opens a multi-line editor dialog (full value fetched on demand, Copy, Save for editable columns); booleans are switches; `users.avatar_url` shows a picture preview and accepts only `data:image` up to 512 KB. Rows are deleted with confirmation where allowed. Table tabs wrap into rows and use the gliding lens. `password_hash` and `token_version` are never sent.
- **Editable columns** (the allow-list in `TABLES`): `users` (username, language, xp, rank, tasks_completed, daily_goal_xp, goals, is_admin, avatar_url), `tasks` and `templates` (name, duration, productivity, difficulty, category, bonus; tasks also `completed`). `xp_history`, `schema_migrations` are never deletable. Table and column names come from the catalog, never from the request.
- **Effect of edits**: the database links apply (see 14); an edit pushes a live `sync` to the affected user (their screen reloads), deleting a user row pushes `revoked` (they are signed out); every edit is logged as `admin.edit`.
- **Logs page**: terminal-style feed of the last 100 events, oldest at the top and newest at the bottom, one line per event (`user: Completed task "X" = +21 XP`). Search, level and category filters (`auth task profile friend template ai admin system`), Live toggle (new lines slide in via SSE), click a line for the full metadata. `GET /api/admin/logs` supports `limit` (max 500), `q`, `level`, `category`, `user`, `before`.
- **Analytics page** (`GET /api/admin/analytics`): 24-hour area chart of uptime (% of minute samples), bars of active users per hour, Groq calls per hour with errors and average latency, top 5 users, totals (users, tasks, active users, Groq calls, live connections).

## 13. Live channel (SSE)

`utils/events.js` (hub), `routes/events.js`, `core/live.js` (client). `GET /api/events` is a server-sent-events stream (fetch-based on the client so the Authorization header works).

- Events: `ready`, `sync` (your data changed elsewhere, e.g. an admin edit; the client reloads tasks, stats, templates and the current view after a 300 ms debounce), `revoked` (an admin deleted your account row, you are signed out), and for admins `log` and `db` (feed for the Logs and Database pages).
- Max 5 connections per user, keep-alive comment every 25 s. The client keeps the stream open **only while the tab is visible**, so a sleeping free-tier server can rest; on becoming visible again it refreshes (`live:resume`).
- Single-instance, in memory. Do not rely on it for correctness; every view also loads over plain HTTP.

## 14. Database integrity

Migrations are the schema source of truth (`database/migrations`, run by `migrate.js`; each file once, in a transaction, with a SHA-256 stored in `schema_migrations`; an edited applied file aborts the run).

- Tables: `users`, `tasks`, `xp_history`, `friends`, `templates`, `groq_logs`, `system_logs`, `user_activity`, `uptime_samples`, `schema_migrations`; view `v_user_integrity`.
- **Triggers** `users_sync_progress` and `users_audit_xp` (migration 011): `rank`/`level` always follow `xp`; changing `rank` moves `xp` to that rank's range; lowering `tasks_completed` deletes the oldest completed tasks and takes their XP back (0 removes all completed tasks, raising it is capped at the real count); a direct `xp` change that `xp_history` does not explain is booked as an `admin_adjust` row. `rank_for_xp` in SQL must match `rankService` (integration test).
- **Constraints**: `tasks.completed` and `completed_at` must agree; `xp_history.source` is a known value; `users.language` in (en, de); `users.rank` in the seven ranks; unique `lower(username)`; unique template index.
- **Indexes** (migration 014): covering `xp_history (user_id, created_at DESC) INCLUDE (xp_amount)`, partial `tasks (user_id, created_at DESC) WHERE completed = false`, `friends (friend_id)`; redundant ones dropped.
- **`v_user_integrity`** lists users whose stored `xp` or `tasks_completed` disagree with `xp_history` / `tasks`. It should be empty; check it after manual data work.
- Migration history: 001-009 original schema, 010 token_version/daily goal/indexes, 011 schema cleanup + triggers, 012 `quick_tasks` -> `templates`, 013 unique templates, 014 integrity and indexes. 004 does not exist; next is **015**. 011 and 012 dropped or renamed data and are irreversible: take a Neon backup branch before risky migrations.

## 15. Logging and retention

- **`logActivity({ userId, action: 'category.verb', message, meta, level })`** (`services/loggingService.js`) writes the compact human message to `system_logs` and publishes it to admins live. Actions in use: `auth.register/login/login_failed`, `task.create/edit/complete/uncomplete/delete`, `template.create/use/delete`, `friend.add/remove`, `profile.avatar/password/username/goals/settings`, `ai.rate/error`, `admin.edit`, `system.boot/audit/error/event`. Put detail in `meta`, keep `message` short.
- Winston (`utils/logger.js`) logs HTTP requests and errors to `logs/` and the console; only 5xx are persisted to `system_logs`. Swallowed errors go through `warnOnError(context)`.
- **Retention** (`retentionService`): purge 30 s after boot and daily while awake: `system_logs` and `groq_logs` older than `LOG_RETENTION_DAYS` (default 30), `uptime_samples` and `user_activity` older than 7 days.
- **Analytics sources**: `uptimeService` samples once a minute and flushes in one batch every 5 min (gaps = the server slept); `activityTracker` writes one `user_activity` row per user and hour and refreshes `users.last_seen_at` at most every 10 min.

## 16. PWA and offline

`manifest.json`, `sw.js`, `offline.html`, `core/pwa.js`, `core/api.js`.

- Service worker (`VERSION` constant, currently `v10`): app shell precached from the `SHELL` list, API never cached; `offline.html` fallback. Every new css/js/badge/font file must be in `SHELL` (test enforces it); bump `VERSION` when shell files change in a way that must invalidate caches.
- **Offline queue**: completing an existing task while offline is queued in `localStorage` and replayed in order when back online; the card shows "waiting to sync". Creating or editing tasks needs a connection.
- **Cold-start handling**: requests that hang or fail with 502/503/504 are retried (1.5 s, 3 s, 6 s; POSTs only when safe) and a "server is waking up" banner shows. An offline banner shows when the browser is offline.
- Install button (Settings, plus the sidebar when offered) uses `beforeinstallprompt`. Icons rendered from `icons/logo.svg`: favicons, `LOGO.png`, maskable PWA icon.
- When the tab becomes visible after 60 s idle, core data refreshes (`refreshWhenVisible`).

## 17. UI system

- **Design**: calm blue "liquid glass", bright blue only as accent; `--glass-*`, `--blur` and theme tokens in `css/tokens.css`; themes system/dark/light (`theme-boot.js` applies the saved theme before first paint). Font Lexend Deca, self-hosted variable woff2 (preloaded and precached). Logo: glass squircle with progress ring and checkmark.
- **Layout**: sidebar with user box on desktop, glass dock (`#tabbar`) instead of the sidebar at 960 px and below, dialogs become bottom sheets and the goal ring becomes a bar at 640 px and below. Hash routing in `features/nav.js` (`#/tasks, #/templates, #/activity, #/leaderboard, #/settings`, `#/admin/*`).
- **Gliding lens** (`nav.js`, `core/segmented.js`): a glass highlight springs to the active nav item and to the active option of every tab strip and segmented control (task filter, leaderboard period, sign-in tabs, database tables), stretching while it moves.
- **Interactions** (`core/glass.js`): pointer-following specular highlight and press ripple on glass buttons. All hover zooms share one token, `--hover-grow` (6px, `css/tokens.css`; `glass.js` converts it to a per-element scale so every element grows by the same pixel amount), also used by buttons, icon buttons, nav links and chips. Boxes (task cards, stat tiles, leaderboard rows, podium, hero, streak card, charts, history groups, settings cards, week-strip circles, the sidebar user box) zoom slightly on hover with a spring and lift above neighbours; one shared zoom amount. Tab buttons do not zoom. Excluded: data table, log terminal, dialogs, popovers; touch devices do not zoom.
- **Motion**: `swapIn()` plays a slow fade-and-rise when switching tabs, filters, dialog steps, tables and leaderboard periods; list entry animation staggers the first 8 cards; `prefers-reduced-motion` is respected.
- **Performance rules**: real `backdrop-filter` only on large persistent surfaces (card, sidebar, dock, toast, dialog), never on rows or buttons; no infinite animations; one static ambient background layer; `content-visibility: auto` on long lists; refraction is faked with gradients and a chromatic inset rim.
- **Components** (`core/ui.js`, `core/dom.js`): toasts incl. XP toasts, banners, promise-based `confirmDialog`, empty states, skeleton lists, `h()` DOM builder (text nodes only), inline SVG icon set, avatars, number/day/time formatters. Charts (`features/charts.js`) are dependency-free SVG using presentation attributes only.
- **Accessibility**: landmarks, native `<dialog>` focus handling, keyboard support (arrow keys on sign-in tabs, Ctrl/Cmd+Enter in the AI box), aria labels on icon buttons, audited with axe in both themes.

## 18. Internationalization

`core/i18n.js`: English and German, ~290 keys each, `t(key, params)`. Static markup uses `data-i18n*` attributes translated by `translateDom`. Language comes from the user's saved setting (server) with the browser as fallback and is switchable on the sign-in screen and in Settings; changing it re-renders every view through `onLanguageChange`. A test enforces key parity and that every used key exists. Admin pages are translated too.

## 19. Security

- Helmet with a strict CSP (`script/style/font/connect/manifest/worker-src 'self'`, `img-src 'self' data: blob:`, no framing, HSTS in production, `no-referrer`). No inline scripts, `style=` attributes or `on*=` handlers anywhere; styles are set through CSSOM. A test enforces it.
- Rate limits (in memory, per process): general 300/min per IP on `/api`, login/register 10 per 15 min per IP (reset on success), AI 10/min, avatar 5 per 10 min, friends 30/hour, password 5 per 15 min.
- Body limits: 100 KB globally, 1 MB for the avatar route. CORS limited to `CLIENT_ORIGIN` when set. All SQL parameterized; dynamic table/column names only from the catalog.
- `/api/*` is `Cache-Control: no-store`. Errors are uniform `{ success: false, error, code }`; `AppError` helpers, `asyncHandler`. Admin API hides itself with 404.

## 20. Tests, tooling and CI

- `npm run check` (`scripts/check.js`): syntax-checks all first-party JS (81 files).
- `npm test`: `test/unit.test.js` (ranks, XP formula, multipliers, meta, streaks and ice streaks, rate limiter, token versions, timezone, validators), `test/frontend.test.js` (i18n parity and usage, service-worker precache list, no inline script/style/handlers, no emoji in frontend code), `test/integration.test.js` (one suite with many subtests: security headers, auth, task lifecycle and XP consistency, editing, friends and multiplier, public-only profiles, templates, DB guards, settings, avatar cap, password revocation, log retention, DB triggers, admin API incl. filters, sort, cell values and live sync). Integration runs only with a **local** `TEST_DATABASE_URL` and refuses non-localhost URLs.
- CI: `.github/workflows/ci.yml` (Postgres 16 service; `npm ci`, check, migrate, test; Node 22).
- No linter or formatter on purpose.

## 21. Deployment

Render free tier (`render.yaml`: build `npm install`, start `npm start` = migrate then server, health `/api/health`). Pushing `main` deploys and migrates. The service may spin down; do not add keep-alive pings (they also burn Neon compute). `/api/health` checks the database (`status: ok|degraded`). Static files are served by Express from the repo root: HTML/manifest/sw with `no-cache`, `/js` and `/css` revalidate by ETag, badges and icons cached 7 days, fonts 1 year immutable. Graceful shutdown on SIGTERM/SIGINT flushes the uptime buffer and closes the pool.

## 22. Removed features (do not resurrect)

Stored here so nobody re-adds them by mistake: recurring tasks and templates (columns, UI, API), the `goals` table and `/api/goals`, the `profiles` table and `/api/users/profile`, `tasks.task_text`/`ai_score`, stored `position_based_multiplier`/`rank_based_multiplier`, the admin "object storage" tab, the multi-step task wizard with a header add button, the hamburger sidebar, `setInterval` multiplier monitor, keep-alive pings. Leftover: `.recur-select` in `css/views.css` is dead CSS.

## Known limitations

- Rate limits, the multiplier audit and the live channel are per process (single instance only).
- Avatars live in the database as small JPEG data URLs.
- Only completing an existing task works offline.
- No push notifications (would need a push service and VAPID keys).
- Only 5xx errors are persisted to `system_logs`; the Logs page therefore shows user actions plus server problems, not every request.
