import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOtp, discardOtp, getUserByEmail } from "@/lib/db";
import { generateOtp, hashOtp, sendOtpEmail, OTP_CONFIG } from "@/lib/otp";
import { take, reset } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  purpose: z.enum(["signup", "signin"]),
});

const RL_EMAIL_LIMIT = 3;
const RL_IP_LIMIT = 10;
const RL_PROBE_LIMIT = 3;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  // Next.js populates `req.ip` from the connection peer address, and Vercel
  // sets `x-real-ip` to the client IP. Trusting `x-forwarded-for`
  // unconditionally would let a client spoof their bucket key and bypass
  // every IP-keyed rate limit.
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const purpose = parsed.data.purpose;
  const ip = clientIp(req);

  // Always rate-limit per IP so the endpoint can't be abused to amplify
  // load against the database.
  if (!take(`otp:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  // Always consume a per-email bucket so a caller can't distinguish "this
  // address is eligible for a code" from "this address is not" by counting
  // how many requests they get before a 429. The probe bucket is consumed
  // for calls we silently short-circuit; the delivery bucket is consumed
  // when we actually issue a code.
  if (!take(`otp:email:${email}`, RL_EMAIL_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const existing = await getUserByEmail(email);
  const signupBlocked =
    purpose === "signup" && Boolean(existing?.password_hash || existing?.profile_completed_at);
  const signinBlocked = purpose === "signin" && !existing?.password_hash;

  if (signupBlocked || signinBlocked) {
    if (!take(`otp:probe:${email}`, RL_PROBE_LIMIT, RL_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }
    // `sent: false` lets the client distinguish a silently short-circuited
    // request (no code generated) from a successful send, so the UI can keep
    // the user on the email/signin-method step instead of stranding them on
    // the OTP step waiting for a code that will never arrive.
    return NextResponse.json({ ok: true, sent: false });
  }

  let code = generateOtp();
  let otpId: number | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      otpId = await createOtp(email, purpose, hashOtp(code), OTP_CONFIG.ttlMs);
      break;
    } catch (err) {
      // The partial unique index on (email, purpose) WHERE consumed_at IS
      // NULL means a concurrent createOtp for the same email+purpose can
      // race this INSERT. Retry once with a fresh code so the user still
      // gets a working OTP.
      const msg = err instanceof Error ? err.message : "";
      const isUnique =
        /UNIQUE/i.test(msg) || /SQLITE_CONSTRAINT/i.test(msg);
      if (attempt === 0 && isUnique) {
        code = generateOtp();
        continue;
      }
      reset(`otp:email:${email}`);
      throw err;
    }
  }
  if (otpId === undefined) {
    reset(`otp:email:${email}`);
    return NextResponse.json(
      { error: "Couldn't send OTP, try again." },
      { status: 500 }
    );
  }
  try {
    await sendOtpEmail(email, code, purpose);
  } catch (error) {
    await discardOtp(otpId);
    reset(`otp:email:${email}`);
    throw error;
  }

  const body: Record<string, unknown> = { ok: true, sent: true };
  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    body.devCode = code;
  }
  return NextResponse.json(body);
}
