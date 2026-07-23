import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserById, getUserByUsername, setProfile } from "@/lib/db";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  displayName: z.string().trim().min(1).max(40),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore"),
});

const RL_IP_LIMIT = 30;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function POST(req: NextRequest) {
  // Authenticate before applying the per-IP rate limit so an unauthenticated
  // attacker cannot exhaust the bucket and lock out the (small) pool of
  // legitimate users on the same IP. The limit is intended to stop an
  // authenticated client enumerating or race-colliding usernames.
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const ip = clientIp(req);
  if (!take(`profile:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const me = await getUserById(session.userId);
  if (!me) {
    await session.destroy();
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (me.profile_completed_at) {
    return NextResponse.json({ error: "Profile already set" }, { status: 409 });
  }
  // Profiles can only be finalized once a password is on file (see
  // lib/db.ts:setProfile). Surface a clear error so the UI can react,
  // instead of the misleading "Profile already set" that an empty UPDATE
  // would otherwise produce.
  if (!me.password_hash) {
    return NextResponse.json(
      { error: "Set your password before completing your profile" },
      { status: 409 }
    );
  }

  const taken = await getUserByUsername(parsed.data.username);
  if (taken && taken.id !== me.id) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  try {
    const updated = await setProfile(me.id, parsed.data.displayName, parsed.data.username);
    if (!updated) {
      return NextResponse.json({ error: "Profile already set" }, { status: 409 });
    }
  } catch (err) {
    // Race: another request claimed this username between the check and the
    // write. SQLite enforces the UNIQUE constraint; surface a clean 409 instead
    // of a generic 500.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    throw err;
  }
  session.displayName = parsed.data.displayName;
  session.username = parsed.data.username;
  session.profileCompleted = true;
  session.pendingSignupEmail = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}