# Productivity Tracker

A web app for competing in friend groups on productivity. Users sign in with email, complete tasks to earn XP, level up through ranks, and compare on a leaderboard. Data syncs across devices via Firebase/Firestore.

## Setup

1. Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** in your project
3. Copy your Firebase config from Project Settings
4. Replace the placeholder config in `js/firebase.js` with your actual config
5. Deploy the `firestore.rules` file (see below)
6. Serve the app with any static host (Firebase Hosting, Vercel, Netlify, or locally with `npx serve`)

## Firestore Setup

1. After enabling Firestore, deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Create the composite index for the leaderboard by deploying:
   ```bash
   firebase deploy --only firestore:indexes
   ```
   Or create it manually in the Firebase Console under **Firestore > Indexes**.

## Known Limitations

- **Security**: Email-only auth allows anyone to claim any email. No password or verification is enforced. Consider adding Firebase Auth with email link sign-in for production use.
- **Cost**: Leaderboard queries read multiple user docs. Monitor Firestore read costs in production.
- **Email as Doc ID**: Emails use `.` replaced with `,` for Firestore compatibility.
- **Friend Email Migration**: When a user changes their email, other users' friend lists still reference the old email until they refresh.

## File Structure

```
productivity-tracker/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── firebase.js
│   ├── i18n.js
│   ├── leaderboard.js
│   ├── settings.js
│   ├── tasks.js
│   └── ui.js
├── assets/
│   └── icons/
└── README.md
```

## Features

- Email-only sign-in with "Remember me" persistence
- Add tasks with duration and hardness (1-10)
- XP calculated as `duration × tiered multiplier`
  - Hardness 1-2: ×1
  - Hardness 3-4: ×2
  - Hardness 5-6: ×3
  - Hardness 7-8: ×4
  - Hardness 9-10: ×5
- Rank progression: Newcomer → Bronze → Silver → Gold → Platinum → Diamond → Master
- Leaderboard with friends (add by email)
- Language toggle: English / Deutsch
- Mobile-first responsive design with sidebar swipe gestures
- Settings panel with email change and credits

## Known Limitations

- **Security**: Email-only auth allows anyone to claim any email. No password or verification is enforced. Consider adding Firebase Auth with email link sign-in for production use.
- **Cost**: Leaderboard queries read multiple user docs. Monitor Firestore read costs in production.
- **Email as Doc ID**: Emails use `.` and `,` replacements for Firestore compatibility.

## Credits

Built with Kilo Code. Main contributor: Mateo Rettenberger.
