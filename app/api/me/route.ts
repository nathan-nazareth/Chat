import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email ?? null,
      displayName: session.displayName ?? null,
      username: session.username ?? null,
      profileCompleted: Boolean(session.displayName && session.username),
    },
  });
}
