# Project Resume

> Instruction for Claude: read this whole file first. Then read every file under "Must read before any change". Do not modify anything until you have fully understood the project. Keep this file updated as you work (see "Maintenance rules").

Last updated: 2026-10-06

## 1. What this project is
Productivity Tracker: web app where friends compete on productivity. Users log tasks (AI-rated via Groq or manual), complete them for server-computed XP, keep streaks, climb ranks, compare on a leaderboard. EN/DE, dark/light, installable PWA, admin area. Stack: Express 4 + Neon Postgres (CommonJS backend), vanilla ES-module SPA, no build step. Deploy: Render free tier (push to `main` deploys and migrates). Owner: Mateo Rettenberger.

## 2. Must read before any change
1. `/home/mateo/AGENTS.md` - workspace rules (subagent model, secrets, Neon ids)
2. `AGENTS.md` - architecture, invariants, conventions, commands
3. `FEATURES.md` - every feature in detail (keep in sync when behavior changes)
4. `README.md` - setup, env vars, API table

## 3. How to navigate
- `backend/` routes -> middleware -> controllers -> models -> `utils/database`; `services/` (rankService, groqService, loggingService, adminService...).
- `js/` : `app.js`, `core/` (api, state, i18n, dom, ui, glass, segmented), `features/` (one module per view, `admin/`).
- `css/` : fonts, tokens, base, components, layout, views. `sw.js` service worker. `database/migrations/` (next = 020).
- Lookup: XP/ranks `backend/services/rankService.js`; XP writes `models/Task.js` (`syncUserTotals`); AI `backend/services/groqService.js`; streak/activity UI `js/features/streak.js`; admin charts `js/features/admin/analytics.js` + `js/features/charts.js`; account dialog `js/features/settings.js` + `index.html`; toasts/dialogs `js/core/ui.js` + `css/components.css`; strings `js/core/i18n.js` (EN and DE both).

## 4. Commands
Run from `/home/mateo/productivity-tracker`. `npm run check`, `npm test` (integration only with local `TEST_DATABASE_URL`, never Neon), `npm run dev` (no migrate), `npm start` (migrate + server), `npm run migrate`. Push: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/corixien/productivity-tracker.git HEAD:main`. Owner wants every change committed and pushed right away. Headless screenshot test of static HTML works with `firefox --headless --no-remote --profile <dir> --screenshot`.

## 5. Invariants and gotchas
- Never write `users.xp` directly; use `Task.syncUserTotals` in a transaction.
- Strict CSP: no inline script/style/handlers; styles via CSSOM. New css/js files go into `SHELL` in `sw.js`; bump `VERSION` (now `v15`).
- New UI text needs `en` and `de`. DB change = new migration, never edit applied ones.
- Never print `.env`, remote URL (embeds PAT), `~/.config/opencode/opencode.json`. Reads of the production Neon DB are blocked by the auto-mode classifier; do not work around.
- Env values must not contain `<>` placeholders. Leave `GROQ_MODEL` unset (default `llama-3.3-70b-versatile`); a 404 triggers auto-pick from Groq `/models`.
- Mobile breakpoints: 960px (dock, toasts 2.5 s at top), 640px (dialogs open from top), 560px (bar values hidden).

## 6. Current state
- Branch / last commit: `main`, see `git log` (pushed after the 2026-10-04 test pass).
- Working tree: clean after push.
- Goal of the current task: none open. Last session delivered the batch below.

### Done
- [x] 2026-10-06 friend profile page: click a leaderboard entry -> `#/profile/<name>` (`js/features/profile.js`, `GET /api/users/:username/profile`, friends/self only), hero header (avatar, name, rank badge and progress), sections profile, activity stats, first place streaks, searchable completed task list; `sw.js` `v13`; integration test added. Account cleanup on production done by the owner.
- [x] 2026-10-04 fixed lockout after deleting all users: reserved ADMIN_USERNAMES names can be registered again while no admin exists (and the registrant becomes admin)
- [x] 2026-10-04 accounts on production were deleted by the owner; test accounts are gone
- [x] 2026-10-04 AI fills the offline/with friends bonus, rank-up bonus (1% of threshold, max 100, once per rank, migration 019), weekly trophy now 50 XP and never counts as next week's XP
- [x] 2026-10-04 AI task name follows the UI language, Enter sends in the AI box (Shift+Enter = new line), daily goal bonus reworked (v_task_xp, combined toast, ring shows bonus, Activity row), first place streaks on Activity. Real-browser test harness idea: headless Firefox + WebDriver BiDi (see session notes, not committed)
- [x] 2026-10-04 final audit: fixed concurrent completions deleting tasks (per-user lock + migration 017), short tasks round down below 30 min (shortMinutes 30), property tests for XP formula and multiplier, race test
- [x] 2026-10-04 daily goal bonus (10% of goal, min 1, max 100, taken back when the day falls below the goal) and weekly trophy (75 XP to first place only, settled lazily, migration 016, `bonusService.js`). Values chosen by simulation, see FEATURES.md
- [x] 2026-10-04 test pass (local Postgres via podman, 35/35 tests): server ignores client `xp` on task create, bonus capped at 100, `/api/groq/status` no longer returns `keyLength`, dead `.recur-select` CSS removed
- [x] Analytics charts fill their cards (ResizeObserver, `fillChart`)
- [x] Account dialog: single form, single Save button
- [x] Admin logs newest at top
- [x] 14-day XP chart fixed on mobile (explicit grid rows); daily goal bold top right
- [x] Activity 5-week calendar: red cross / green check / blue snowflake + legend
- [x] XP bar solid `#64d2ff` with glow
- [x] Mobile toasts back at top, 2.5 s; dialogs open from top
- [x] Groq 404 fixed (dead `groq/compound` default; auto model pick); confirmed working on Render
- [x] Docs synced

### In progress
- none

### Next steps
1. Wait for user request.

### Open questions / blockers
- None.

## 7. Decisions log
- 2026-10-03 - removed `response_format: json_object` from Groq call - not all models support it; prompt + parser suffice.
- 2026-10-03 - toasts kept on phones (top, 2.5 s) after user asked to restore them.

- 2026-10-03 - XP formula reworked to time-proportional `(12 + p*d) * effectiveMinutes/60` (old fixed p*d term made 5-min tasks farmable, 8x); multiplier reworked to smooth gap-based `clamp(((avgFriend+150)/(own+150))^0.4, 0.85, 1.3)`, rank penalty removed. Simulation in session scratchpad (not saved). Rank thresholds x3.6 (Master 18000 = ~1 year at 50 XP/day), migration 015.

## 8. Resume prompt
Paste this into a new session:
> Read project-resume.md in this project fully. Read every file it lists under "Must read before any change". Then continue from "Current state". Do not change anything before you have understood the project. Keep project-resume.md updated.

- 2026-10-04 - when running the server by hand, set `NODE_ENV=test DATABASE_URL=<local>` inline in the SAME command; `.env` points at Neon production and shell env does not persist between commands.
