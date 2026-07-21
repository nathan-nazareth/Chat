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
  const user = getUserById(session.userId);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { userId: user.id };
}
