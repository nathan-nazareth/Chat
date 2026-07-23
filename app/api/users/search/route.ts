import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchUsers } from "@/lib/db";
import { take } from "@/lib/rateLimit";

const RL_IP_LIMIT = 60;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function GET(req: NextRequest) {
  // Authenticate before applying the per-IP rate limit so an unauthenticated
  // attacker cannot exhaust the bucket and lock out legitimate users on the
  // same IP (e.g. behind NAT). The limit is intended to stop an authenticated
  // client enumerating the user directory with many short-prefix queries.
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const ip = clientIp(req);
  if (!(await take(`search:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS))) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

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
