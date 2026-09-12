# Productivity Tracker

A web app for competing in friend groups on productivity. Users sign in with a username, complete tasks to earn XP, level up through ranks, and compare on a leaderboard. The backend uses Express, PostgreSQL (Neon), bcrypt, and JWT.

## Setup

1. Create a Neon project and a PostgreSQL database (use the Neon console or DB Pro tool)
2. Copy your Neon database connection string
3. Set the environment variables in `.env`
4. Run the database migration: `npm run migrate`
5. Start the app: `npm start` or `npm run dev`

## Environment Variables

See `.env.example` for required variables:

- `DATABASE_URL` - Neon PostgreSQL connection string
- `JWT_SECRET` - secure random JWT signing secret
- `JWT_EXPIRES_IN` - token expiry (default: `7d`)
- `GROQ_API_KEY` - optional AI rating API key
- `GROQ_MODEL` - AI model (default: `groq/compound`)
- `DATABASE_SSL_REJECT_UNAUTHORIZED` - set to `false` in production if your Neon database requires SSL acceptance
- `PORT` - server port (default: `3000`)
- `NODE_ENV` - environment (`development` or `production`)

## Database

PostgreSQL through Neon. The schema is created with `database/migrate.js`. Tables:

- `users` - user accounts with bcrypt password hashes
- `profiles` - extended profile data (5-year goals, preferences)
- `tasks` - task records with XP, productivity, difficulty
- `xp_history` - immutable XP audit trail
- `friends` - many-to-many friend relationships
- `goals` - long-term goals
- `groq_logs` - AI request/response logging
- `system_logs` - application logs

Manage the database with your DB Pro tool, the Neon SQL editor, or any PostgreSQL client.

## API Routes

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user (returns JWT)
- `GET /api/auth/me` - Current user profile
- `GET /api/users/:username` - Get user by username
- `PUT /api/users/:username` - Update user fields
- `POST /api/users/:username/password` - Change password
- `POST /api/users/:username/avatar` - Upload avatar
- `POST /api/users/:username/change-username` - Change username
- `GET/POST/DELETE /api/users/friends` - Friend management
- `GET /api/users/leaderboard` - Leaderboard
- `GET/POST/PUT/DELETE /api/tasks` - Task CRUD
- `POST /api/tasks/:id/complete` - Complete task (awards XP)
- `GET/POST/PUT/DELETE /api/goals` - Goal CRUD
- `GET/POST /api/xp` - XP data
- `GET /api/leaderboard` - Leaderboard
- `GET/PUT /api/settings` - Settings
- `POST /api/groq/rate` - AI task scoring
- `GET /api/groq/status` - AI service status
- Legacy `POST /api/ai/rate` and `GET /api/ai/status` are also supported

## Features

- Username + password sign in with "Remember me" JWT persistence
- Add tasks using natural language and AI rating
- XP calculated server-side via immutable `xp_history`
- Rank progression: Newcomer -> Bronze -> Silver -> Gold -> Platinum -> Diamond -> Master
- Leaderboard with friends (add by username)
- Language toggle: English / Deutsch
- Profile picture upload stored locally in `avatars/`
- Goal management
- Mobile-first responsive design with sidebar swipe gestures

## File Structure

```
productivity-tracker/
├── index.html              # Main SPA
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main app controller
│   ├── auth.js             # Auth state and session management
│   ├── api.js              # Frontend API client
│   ├── tasks.js            # Task operations and rendering
│   ├── leaderboard.js      # Leaderboard logic
│   ├── settings.js         # Settings panel
│   ├── ui.js               # UI utilities
│   ├── ai-service.js       # AI task rating client
│   └── i18n.js             # Internationalization
├── backend/
│   ├── index.js            # Express entry point
│   ├── config.js           # Environment config
│   ├── routes/             # Route definitions
│   ├── controllers/        # Request handling
│   ├── models/             # Data access layer
│   ├── services/           # Business logic and logging
│   └── middleware/         # Auth, validation, errors
├── database/
│   ├── migrations/       # SQL migrations
│   ├── migrate.js        # Schema migration runner
│   └── migrate-data.js   # SQLite to PostgreSQL data migration
├── avatars/                # Locally stored avatar images (gitignored)
├── Badges/                 # Rank badge images
├── assets/                 # Static assets
├── .env.example            # Example environment variables
└── README.md
```

## Known Limitations

- Avatars are stored locally in `avatars/`; use a CDN or object storage for production.
- Changing a password invalidates existing sessions only if the user logs in again with the new password; existing JWT tokens remain valid until expiry.
- SQLite data migration script (`database/migrate-data.js`) requires the old SQLite database.
- The app does not include an admin panel; database administration is done externally through Neon.

## Credits

Built with Kilo Code. Main contributor: Mateo Rettenberger.
