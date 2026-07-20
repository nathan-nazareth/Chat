import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOtp, getUserByEmail } from "@/lib/db";
import { generateOtp, hashOtp, sendOtpEmail, OTP_CONFIG } from "@/lib/otp";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().email(),
  purpose: z.enum(["signup", "signin"]),
});

const RL_EMAIL_LIMIT = 3;
const RL_IP_LIMIT = 10;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const purpose = parsed.data.purpose;
  const ip = clientIp(req);

  if (!take(`otp:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  if (!take(`otp:email:${email}`, RL_EMAIL_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const existing = getUserByEmail(email);
  const signupBlocked = purpose === "signup" && Boolean(existing);
  const signinBlocked = purpose === "signin" && !existing;

  if (signupBlocked || signinBlocked) {
    return NextResponse.json({
      ok: true,
      silent: true,
      ...(process.env.RESEND_API_KEY ? {} : { devCode: null }),
    });
  }

  const code = generateOtp();
  createOtp(email, purpose, hashOtp(code), OTP_CONFIG.ttlMs);
  await sendOtpEmail(email, code, purpose);

  const body: Record<string, unknown> = { ok: true };
  if (!process.env.RESEND_API_KEY) body.devCode = code;
  return NextResponse.json(body);
}
