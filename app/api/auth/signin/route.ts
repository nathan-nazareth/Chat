import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { getSession } from "@/lib/session";
import { take } from "@/lib/rateLimit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

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
  const ip = clientIp(req);
  if (!take(`signin:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const user = await getUserByEmail(email);
  const stored = user?.password_hash;
  const ok = stored ? await bcrypt.compare(parsed.data.password, stored) : false;
  if (!user || !stored || !ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  if (user.display_name) session.displayName = user.display_name;
  if (user.username) session.username = user.username;
  if (!user.profile_completed_at) session.pendingSignupEmail = user.email;
  await session.save();

  return NextResponse.json({
    ok: true,
    stage: user.profile_completed_at ? "ready" : "need_profile",
  });
}
