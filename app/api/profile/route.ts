import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserById, getUserByUsername, setProfile } from "@/lib/db";
import { getSession } from "@/lib/session";

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

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const me = getUserById(session.userId);
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (me.profile_completed_at) {
    return NextResponse.json({ error: "Profile already set" }, { status: 409 });
  }

  const taken = getUserByUsername(parsed.data.username);
  if (taken && taken.id !== me.id) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  setProfile(me.id, parsed.data.displayName, parsed.data.username);
  session.pendingSignupEmail = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}