import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ user: null });
  const user = await getUserById(session.userId);
  if (!user) {
    await session.destroy();
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      username: user.username,
      profileCompleted: Boolean(user.profile_completed_at),
    },
  });
}
