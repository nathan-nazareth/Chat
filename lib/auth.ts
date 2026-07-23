import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";

export type Authed = { userId: number; error?: never };
export type Unauthed = { userId?: never; error: Response };

export async function requireUser(): Promise<Authed | Unauthed> {
  try {
    const session = await getSession();
    if (!session.userId) {
      console.log("[INFO] [auth] requireUser: no session");
      return {
        error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      };
    }
    const user = await getUserById(session.userId);
    if (!user) {
      console.warn("[WARN] [auth] requireUser: user not found id=%s", session.userId);
      try {
        await session.destroy();
      } catch (e) {
        console.error("[ERROR] [auth] session destroy failed:", e);
      }
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
      try {
        await session.save();
      } catch (saveErr) {
        console.error("[ERROR] [auth] session save failed:", saveErr);
        return {
          error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
        };
      }
    }
    return { userId: session.userId };
  } catch (error) {
    console.error("[ERROR] [auth] requireUser unhandled:", error);
    return {
      error: NextResponse.json({ error: "Something went wrong." }, { status: 500 }),
    };
  }
}
