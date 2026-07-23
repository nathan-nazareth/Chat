import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail, setPasswordHashByEmail } from "@/lib/db";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 72,
      "Password is too long"
    ),
});

const RL_IP_LIMIT = 20;
const RL_EMAIL_LIMIT = 10;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      console.warn("[WARN] [auth/signup-password] invalid request body");
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    console.log("[INFO] [auth/signup-password] attempt email=%s", email);

    const session = await getSession();
    // Bind the password reset to the existing session. Without this, a user
    // signed in as A could submit `email: B` here, and the server would set a
    // password on B's account (created via OTP) and overwrite `session.userId`
    // to B, effectively handing over B's account to A. The OTP verify step
    // always sets `session.email`, so a missing/mismatched email means the
    // caller hasn't actually completed the signup flow for this address.
    if (!session.userId || !session.email || session.email !== email) {
      console.warn("[WARN] [auth/signup-password] session mismatch userId=%s sessionEmail=%s requestEmail=%s",
        session.userId, session.email, email);
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Authenticate before applying the per-IP / per-email rate limit so an
    // unauthenticated attacker can't exhaust the bucket and lock out the
    // legitimate user mid-signup behind the same NAT.
    const ip = clientIp(req);
    if (!(await take(`signup-pw:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS))) {
      console.warn("[WARN] [auth/signup-password] rate limit ip=%s", ip);
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }
    if (!(await take(`signup-pw:email:${email}`, RL_EMAIL_LIMIT, RL_WINDOW_MS))) {
      console.warn("[WARN] [auth/signup-password] rate limit email=%s", email);
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    let user = await getUserByEmail(email);
    if (!user || user.id !== session.userId) {
      console.warn("[WARN] [auth/signup-password] user not found or id mismatch");
      await session.destroy();
      return NextResponse.json(
        { error: "Start over and request a new code." },
        { status: 400 }
      );
    }

    if (user.password_hash) {
      if (!(await bcrypt.compare(parsed.data.password, user.password_hash))) {
        console.warn("[WARN] [auth/signup-password] password already set (wrong password) email=%s", email);
        return NextResponse.json(
          { error: "Password has already been set" },
          { status: 409 }
        );
      }
    } else {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const updated = await setPasswordHashByEmail(email, passwordHash);
      if (updated) {
        user = updated;
        console.log("[INFO] [auth/signup-password] password set email=%s", email);
      } else {
        const current = await getUserByEmail(email);
        if (!current || current.id !== session.userId || !current.password_hash) {
          console.warn("[WARN] [auth/signup-password] race: user state changed email=%s", email);
          await session.destroy();
          return NextResponse.json(
            { error: "Start over and request a new code." },
            { status: 400 }
          );
        }
        if (!(await bcrypt.compare(parsed.data.password, current.password_hash))) {
          console.warn("[WARN] [auth/signup-password] password already set by concurrent request email=%s", email);
          return NextResponse.json(
            { error: "Password has already been set" },
            { status: 409 }
          );
        }
        user = current;
      }
    }
    session.userId = user.id;
    session.email = user.email;
    session.displayName = user.display_name ?? undefined;
    session.username = user.username ?? undefined;
    session.profileCompleted = Boolean(user.profile_completed_at);
    try {
      await session.save();
    } catch (saveErr) {
      console.error("[ERROR] [auth/signup-password] session save failed:", saveErr);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }

    console.log("[INFO] [auth/signup-password] success email=%s stage=%s", email, user.profile_completed_at ? "ready" : "need_profile");

    return NextResponse.json({
      ok: true,
      stage: user.profile_completed_at ? "ready" : "need_profile",
    });
  } catch (error) {
    console.error("[ERROR] [auth/signup-password] unhandled error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
