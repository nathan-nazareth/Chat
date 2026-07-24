import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchAllMessages } from "@/lib/db";
import { take } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const RL_IP_LIMIT = 60;
const RL_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") || req.ip || "unknown";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const ip = clientIp(req);
    if (!(await take(`msg-search:ip:${ip}`, RL_IP_LIMIT, RL_WINDOW_MS))) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").slice(0, 200).trim();

    if (!q) {
      return NextResponse.json({ messages: [], hasMore: false });
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const perPage = 50;
    const offset = (page - 1) * perPage;

    // Fetch one extra row to determine whether there's a next page
    const messages = await searchAllMessages(auth.userId, q, perPage + 1, offset);
    const hasMore = messages.length > perPage;
    if (hasMore) messages.pop();

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        text: m.text,
        createdAt: m.created_at,
        isRead: Boolean(m.is_read),
        peer: {
          id: m.peer_id,
          displayName: m.peer_display_name,
          username: m.peer_username,
        },
      })),
      hasMore,
      page,
    });
  } catch (error) {
    console.error("[ERROR] [messages/search GET] unhandled error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
