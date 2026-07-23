import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";

export type Authed = { userId: number; error?: never };
export type Unauthed = { userId?: never; error: Response };

export async function requireUser(): Promise<Authed | Unauthed> {
  const session = await getSession();
  if (!session.userId) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  const user = await getUserById(session.userId);
  if (!user) {
    await session.destroy();
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (!user.profile_completed_at) {
    return {
      error: NextResponse.json(
        { error: "Profile not completed" },
        { status: 403 }
      ),
    };
  }
  if (!session.profileCompleted) {
    session.profileCompleted = true;
    session.displayName = user.display_name ?? undefined;
    session.username = user.username ?? undefined;
    await session.save();
  }
  return { userId: session.userId };
}
