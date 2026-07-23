import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  // bcrypt only incorporates the first 72 bytes of the input; reject longer
  // passwords up front so the user is aware rather than silently authenticating
  // against the truncated prefix.
  password: z
    .string()
    .min(1)
    .max(128)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 72,
      "Password is too long"
    ),
});

const RL_IP_LIMIT = 10;
const RL_EMAIL_LIMIT = 10;
const RL_WINDOW_MS = 10 * 60 * 1000;
// Real bcrypt hash of an unguessable value. Used as the comparison target
// when the supplied email does not exist, so the request takes the same
// ~100ms regardless of whether the user is real. This is a timing-attack
// mitigation, not placeholder data — do NOT replace with anything shorter
// than a real bcrypt hash or the constant-time property is lost.
const TIMING_EQUALIZER_HASH =
  "$2a$12$OkSCNbTWWOwo.TWdewT4neYEeiWAp8n7lq9hOP.eFVFbclRLnkYFe";

function clientIp(req: NextRequest): string {
  // Trust the connection peer (`req.ip`) or `x-real-ip` (set by Vercel at
  // the edge). `x-forwarded-for` is client-controlled and must not be used
  // to key rate-limit buckets.
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      console.warn("[WARN] [auth/signin] invalid request body");
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const ip = clientIp(req);
    console.log("[INFO] [auth/signin] attempt email=%s ip=%s", email, ip);

    if (!(await take(`signin:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS))) {
      console.warn("[WARN] [auth/signin] rate limit ip=%s", ip);
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    if (!(await take(`signin:email:${email}`, RL_EMAIL_LIMIT, RL_WINDOW_MS))) {
      console.warn("[WARN] [auth/signin] rate limit email=%s", email);
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const user = await getUserByEmail(email);
    const stored = user?.password_hash;
    const ok = await bcrypt.compare(
      parsed.data.password,
      stored ?? TIMING_EQUALIZER_HASH
    );
    if (!user || !stored || !ok) {
      console.warn("[WARN] [auth/signin] invalid credentials email=%s", email);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.displayName = user.display_name ?? undefined;
    session.username = user.username ?? undefined;
    session.profileCompleted = Boolean(user.profile_completed_at);
    try {
      await session.save();
    } catch (saveErr) {
      console.error("[ERROR] [auth/signin] session save failed:", saveErr);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }

    console.log("[INFO] [auth/signin] success email=%s stage=%s", email, user.profile_completed_at ? "ready" : "need_profile");

    return NextResponse.json({
      ok: true,
      stage: user.profile_completed_at ? "ready" : "need_profile",
    });
  } catch (error) {
    console.error("[ERROR] [auth/signin] unhandled error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
