# Chat

Next.js 14 (App Router) + TypeScript + Tailwind + Turso (libSQL) for the database. Email+OTP auth via Resend (or console-logged in dev), plus password sign-in. Iron-session cookies.

## Run

```
cp .env.example .env.local   # set SESSION_PASSWORD (32+ chars); optionally RESEND_API_KEY
npm install
npm run dev
```

Visit http://localhost:3000. In dev without `TURSO_DATABASE_URL`, the app falls back to a local file DB at `.data/chat.db`.

## Deploy (Vercel)

Set these env vars in the Vercel project settings:

- `SESSION_PASSWORD` (32+ chars)
- `TURSO_DATABASE_URL` (required — `libsql://...`)
- `TURSO_AUTH_TOKEN`
- `RESEND_API_KEY`, `RESEND_FROM` (optional; without these, OTPs are logged)

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
- `lib/db.ts` — Turso schema + async queries
- `lib/otp.ts` — code gen, hashing, email send
- `lib/session.ts` — iron-session config

## Notes

- All `lib/db.ts` functions are async (Turso client). Awaiting `ensureSchema()` lazily on first call runs migrations.
- New-message delivery within an open conversation uses 4s polling (`ConversationView.tsx`). The sidebar does not live-update; reload to see fresh previews.
