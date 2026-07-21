import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchUsers } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return NextResponse.json({ users: [] });
  }
  const users = (await searchUsers(trimmed, auth.userId)).map((u) => ({
    id: u.id,
    displayName: u.display_name,
    username: u.username,
  }));
  return NextResponse.json({ users });
}
