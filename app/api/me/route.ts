import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) {
      console.log("[INFO] [me] no session");
      return NextResponse.json({ user: null });
    }
    const user = await getUserById(session.userId);
    if (!user) {
      console.warn("[WARN] [me] user not found id=%s, destroying session", session.userId);
      try {
        await session.destroy();
      } catch (destroyErr) {
        console.error("[ERROR] [me] session destroy failed:", destroyErr);
      }
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
  } catch (error) {
    console.error("[ERROR] [me] unhandled error:", error);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
