import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  completeSignup,
  consumeActiveOtp,
  findActiveOtpByHash,
  getUserByEmail,
} from "@/lib/db";
import { hashOtp } from "@/lib/otp";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(["signup", "signin"]),
  // bcrypt only incorporates the first 72 bytes of the input; reject longer
  // passwords up front so we never hash a value that wouldn't round-trip.
  password: z
    .string()
    .min(8)
    .max(128)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 72,
      "Password is too long"
    )
    .optional(),
});

const RL_IP_LIMIT = 20;
const RL_EMAIL_LIMIT = 10;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  // Next.js populates `req.ip` from the connection peer address, and Vercel
  // automatically sets `x-real-ip` to the client IP. Trusting
  // `x-forwarded-for` unconditionally would let a client spoof their bucket
  // key and bypass every IP-keyed rate limit.
  return (
    req.headers.get("x-real-ip") ||
    req.ip ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { email: rawEmail, code, purpose } = parsed.data;
  const password = parsed.data.password;
  const email = rawEmail.toLowerCase();
  const ip = clientIp(req);

  if (!take(`verify:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  if (!take(`verify:email:${email}`, RL_EMAIL_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const codeHash = hashOtp(code);
  let user;
  if (purpose === "signup") {
    // Fast-fail on unknown/expired/used codes so we don't waste a
    // bcrypt.hash. The actual atomic claim happens inside completeSignup;
    // we look the OTP up by code_hash (not by "latest id") so that any
    // resend since the user requested the code still works against the
    // specific code they typed.
    const otp = await findActiveOtpByHash(email, purpose, codeHash);
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (!password) {
      // Burn the OTP AND create the user row (without a password)
      // atomically so the subsequent /api/auth/signup-password call can
      // find the user and set the password. The previous code only burned
      // the OTP, leaving no user row and causing signup-password to 400
      // with "Start over and request a new code" once the OTP had already
      // been consumed.
      const result = await completeSignup(email, codeHash, null);
      if (result.status !== "ok") {
        return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
      }
      // Bind the just-created user to the session now so signup-password's
      // session-binding guard (see app/api/auth/signup-password) accepts
      // the next request. Without this, the user verifies the OTP and is
      // immediately rejected with 401 when trying to set their password.
      const session = await getSession();
      session.userId = result.user.id;
      session.email = result.user.email;
      session.displayName = result.user.display_name ?? undefined;
      session.username = result.user.username ?? undefined;
      session.profileCompleted = Boolean(result.user.profile_completed_at);
      await session.save();
      return NextResponse.json({ ok: true, stage: "need_password" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await completeSignup(email, codeHash, passwordHash);
    if (result.status === "invalid_otp") {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (result.status === "account_exists") {
      // The OTP was already consumed in completeSignup's transaction; we
      // surface the same generic error as a wrong code so the response
      // doesn't depend on whether an account already exists.
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    user = result.user;
  } else {
    // Validate the user exists with a password BEFORE consuming the OTP so
    // that a degenerate state (e.g., user deleted between OTP send and
    // verify) cannot burn the user's only valid code. sendOtp already blocks
    // signin OTPs for accounts without a password, so reaching this branch
    // with a missing user is a defensive concern only.
    user = await getUserByEmail(email);
    if (!user || !user.password_hash) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (!(await consumeActiveOtp(email, purpose, codeHash))) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
  }
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.displayName = user.display_name ?? undefined;
  session.username = user.username ?? undefined;
  session.profileCompleted = Boolean(user.profile_completed_at);
  await session.save();

  return NextResponse.json({
    ok: true,
    stage: user.profile_completed_at ? "ready" : "need_profile",
  });
}
