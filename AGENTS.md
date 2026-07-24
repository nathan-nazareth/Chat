# Chat

Next.js 14 (App Router) + TypeScript + Tailwind. Local file SQLite database (`.data/chat.db`) via `@libsql/client` — no external DB service needed. Email+OTP auth via Resend (or console-logged in dev), plus password sign-in. Iron-session cookies.

## Run

```
cp .env.example .env.local   # set SESSION_PASSWORD (32+ chars); optionally RESEND_API_KEY
npm install
npm run dev
```

Visit http://localhost:3000. The database is a local file at `.data/chat.db` — no setup needed.

## Deploy (Vercel)

Set these env vars in the Vercel project settings:

- `SESSION_PASSWORD` (32+ chars)
- `RESEND_API_KEY`, `RESEND_FROM` (optional; without these, OTPs are logged)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (optional; for push notifications)

**Note**: The app uses a local file database, which does not persist on Vercel serverless. For production use, consider mounting a persistent volume or re-adding a remote database.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint (next/core-web-vitals)
- `npm run typecheck` — tsc --noEmit

## Without RESEND_API_KEY

OTPs are logged to the dev-server console and returned in the `/api/otp/send` response so the UI can display them in dev mode.

## Layout

- `app/page.tsx` — protected home (chat shell: sidebar + conversation view)
- `app/auth/page.tsx` — multi-step auth flow
- `app/profile/page.tsx` — first-time name + username setup
- `app/api/otp/send`, `app/api/otp/verify`, `app/api/auth/signin`, `app/api/auth/signout`, `app/api/profile`, `app/api/me`
- `app/api/users/search` — find registered users by name/username
- `app/api/conversations` — list and create DM conversations
- `app/api/conversations/[id]/messages` — list and send messages
- `components/ChatApp.tsx`, `Sidebar.tsx`, `ConversationView.tsx`, `NewChatModal.tsx` — chat UI
- `lib/db.ts` — SQLite schema + async queries
- `lib/otp.ts` — code gen, hashing, email send
- `lib/session.ts` — iron-session config

## Notes

- All `lib/db.ts` functions are async (libSQL client). Awaiting `ensureSchema()` lazily on first call runs migrations.
- New-message delivery within an open conversation uses 4s polling (`ConversationView.tsx`). The sidebar does not live-update; reload to see fresh previews.
