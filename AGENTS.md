# Chat

Next.js 14 (App Router) + TypeScript + Tailwind + SQLite. Email+OTP auth via Resend (or console-logged in dev), plus password sign-in. Iron-session cookies.

## Run

```
cp .env.example .env.local   # set SESSION_PASSWORD (32+ chars); optionally RESEND_API_KEY
npm install
npm run dev
```

Visit http://localhost:3000.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint (next/core-web-vitals)
- `npm run typecheck` — tsc --noEmit

## Without RESEND_API_KEY

OTPs are logged to the dev-server console and returned in the `/api/otp/send` response so the UI can display them in dev mode.

## Layout

- `app/page.tsx` — protected home ("Hello, {displayName}")
- `app/auth/page.tsx` — multi-step auth flow
- `app/profile/page.tsx` — first-time name + username setup
- `app/api/otp/send`, `app/api/otp/verify`, `app/api/auth/signin`, `app/api/auth/signout`, `app/api/profile`, `app/api/me`
- `lib/db.ts` — SQLite schema + queries
- `lib/otp.ts` — code gen, hashing, email send
- `lib/session.ts` — iron-session config
