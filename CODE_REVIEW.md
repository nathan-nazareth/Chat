# Code Review Report — Chat App

Generated: 2026-07-23

---

## CRITICAL (2)

### C1. ConversationView uses PATCH for read-only polling
**File**: `components/ConversationView.tsx:78`
**Category**: Logic / API Semantics

`PATCH` is a mutating HTTP method. Every 4 seconds, a PATCH fires to fetch messages — repeatedly marking the conversation as read (side-effect) and semantically wrong for a read operation.

**Fix**: Change to `GET` for polling; mark-read as a one-time action on conversation open.

### C2. OTP code leaked to client in production on email failure
**File**: `app/api/otp/send/route.ts:108-110`
**Category**: Security / Information Disclosure

When `RESEND_API_KEY` is set but Resend fails (quota, invalid recipient), the raw OTP is included in the HTTP response as `devCode`. An attacker can trigger this with intentionally invalid emails and complete signup with unverified emails.

**Fix**: Gate `devCode` behind `process.env.NODE_ENV !== "production"`.

---

## HIGH (4)

### H1. Rate limit bucket wiped on errors
**File**: `app/api/otp/send/route.ts:78,100`
**Category**: Security / Rate Limiting Bypass

`reset()` calls on error paths completely remove the email rate limit bucket. A transient DB error or Resend outage resets the attacker's rate limit.

**Fix**: Remove the `reset()` calls; the window-based expiry handles cleanup.

### H2. In-memory rate limiter ineffective on serverless
**File**: `lib/rateLimit.ts:3`
**Category**: Security / Architecture

Each Vercel function instance has its own `Map`. 20 concurrent requests hit 20 different instances, each seeing only 1 request. All rate limits are effectively bypassed.

**Fix**: Use a persistent store-backed rate limiter for production.

### H3. Missing top-level try-catch in otp/verify
**File**: `app/api/otp/verify/route.ts`
**Category**: Error Handling

Unlike `otp/send`, the verify route has no top-level error handler. DB connection loss returns a generic 500 with stack trace in development.

**Fix**: Add try-catch matching `otp/send`'s pattern.

### H4. `x-real-ip` spoofable without reverse proxy
**File**: All `clientIp()` callers
**Category**: Security / Rate Limiting Bypass

`x-real-ip` is client-controlled in deployments without a trusted reverse proxy. An attacker can cycle IPs to bypass rate limits.

**Fix**: Only trust `x-real-ip` when behind a known proxy; document requirement.

---

## MEDIUM (8)

### M1. TOCTOU race in completeSignup
**File**: `lib/db.ts:300-305`

Commits transaction before checking `account_exists` condition. Concurrent requests can alter the row between commit and check.

**Fix**: Check the ON CONFLICT condition inside the transaction before committing.

### M2. Duplicate PublicUser type
**File**: `lib/types.ts:1-5` vs `lib/db.ts:336-340`

Two different `PublicUser` types with different shapes (camelCase vs snake_case, nullable vs non-nullable).

**Fix**: Remove one; use a single canonical source.

### M3. Dead code: otpId check unreachable
**File**: `app/api/otp/send/route.ts:82-88`

The for-loop always throws before reaching the `otpId === undefined` check.

**Fix**: Remove dead check or refactor loop.

### M4. consumeActiveOtp not in a transaction
**File**: `lib/db.ts:217-231`

User lookup + OTP consumption aren't atomic. User could be deleted between lookup and consume.

**Fix**: Wrap in transaction or document the safety net (`requireUser()` catch).

### M5. Redundant ternary in EmailStep button
**File**: `app/auth/page.tsx:301`

Both branches return `"Continue"` — dead code, no visual distinction between signup/signin.

**Fix**: Show `"Sign in"` for signin mode.

### M6. Missing `suppressHydrationWarning` on `<html>`
**File**: `app/layout.tsx:11`

Browser extensions inject attributes on `<html>`, causing hydration mismatch warnings.

**Fix**: Add `suppressHydrationWarning`.

### M7. `onClose` not stable in effect dependency
**File**: `components/NewChatModal.tsx:30-36`

Inline arrow function re-creates the event listener on every render.

**Fix**: Wrap in `useCallback` in parent.

### M8. handleSubmit type mismatch
**File**: `components/ConversationView.tsx:287-296`

`KeyboardEvent` cast to `FormEvent` via `as unknown as`. Fragile type bypass.

**Fix**: Rely on form's `onSubmit`; use ref for composing state check.

---

## LOW (10)

| # | File | Issue |
|---|------|-------|
| L1 | `lib/db.ts:85-90` | `n()` silently returns NaN |
| L2 | `lib/otp.ts:29` | OTP code interpolated in HTML (defense-in-depth) |
| L3 | `lib/otp.ts:4` | OTP TTL hardcoded, not configurable |
| L4 | `lib/rateLimit.ts:18-21` | Eviction picks oldest, not expiring bucket |
| L5 | `lib/auth.ts:30-35` | Session stale after external profile edit |
| L6 | `lib/session.ts:21-23` | Dev fallback password in production bundle |
| L7 | `api/conversations/route.ts` | No pagination on conversation list |
| L8 | `api/conversations/[id]/messages/route.ts` | No pagination on message list |
| L9 | `api/profile/route.ts` | Display name not sanitized |
| L10 | `app/robots.ts` | Allows all crawlers on all paths |
