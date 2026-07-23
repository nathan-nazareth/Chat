import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchAllMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";

    if (!q) {
      return NextResponse.json({ messages: [] });
    }

    const messages = await searchAllMessages(auth.userId, q);

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
    });
  } catch (error) {
    console.error("[ERROR] [messages/search GET] unhandled error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
