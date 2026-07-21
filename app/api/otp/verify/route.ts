import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  consumeOtp,
  createUser,
  findActiveOtp,
  getUserByEmail,
  markEmailVerified,
  setPasswordHash,
} from "@/lib/db";
import { hashOtp } from "@/lib/otp";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
  purpose: z.enum(["signup", "signin"]),
  password: z.string().min(8).max(128).optional(),
});

const RL_IP_LIMIT = 20;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!take(`verify:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { email: rawEmail, code, purpose } = parsed.data;
  const password = parsed.data.password;
  const email = rawEmail.toLowerCase();

  const otp = await findActiveOtp(email, purpose);
  if (!otp || otp.code_hash !== hashOtp(code)) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  let user = await getUserByEmail(email);
  if (purpose === "signup") {
    if (!user) user = await createUser(email);
    await markEmailVerified(user.id);
    if (!password) {
      return NextResponse.json({ ok: true, stage: "need_password" });
    }
    await consumeOtp(otp.id);
    const hash = await bcrypt.hash(password, 12);
    await setPasswordHash(user.id, hash);
  } else {
    if (!user || !user.password_hash) {
      return NextResponse.json(
        { error: "Account not found or not set up. Please sign up first." },
        { status: 404 }
      );
    }
    await consumeOtp(otp.id);
  }

  user = (await getUserByEmail(email))!;
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  if (user.display_name) session.displayName = user.display_name;
  if (user.username) session.username = user.username;
  if (!user.profile_completed_at) {
    session.pendingSignupEmail = user.email;
  }
  await session.save();

  return NextResponse.json({
    ok: true,
    stage: user.profile_completed_at ? "ready" : "need_profile",
  });
}
