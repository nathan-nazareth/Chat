import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  createConversation,
  findConversationBetween,
  listConversations,
  getUserById,
} from "@/lib/db";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const rows = listConversations(auth.userId).map((r) => ({
    id: r.id,
    peer: {
      id: r.peer_id,
      displayName: r.peer_display_name,
      username: r.peer_username,
    },
    lastText: r.last_text,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  }));
  return NextResponse.json({ conversations: rows });
}

const CreateBody = z.object({
  userId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const json = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }
  const peerId = parsed.data.userId;
  if (peerId === auth.userId) {
    return NextResponse.json({ error: "Cannot chat with yourself" }, { status: 400 });
  }
  const peer = getUserById(peerId);
  if (!peer || !peer.profile_completed_at) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const conv =
    findConversationBetween(auth.userId, peerId) ??
    createConversation(auth.userId, peerId);

  return NextResponse.json({
    conversation: {
      id: conv.id,
      peer: {
        id: peer.id,
        displayName: peer.display_name,
        username: peer.username,
      },
      lastText: null,
      lastMessageAt: conv.last_message_at,
      createdAt: conv.created_at,
    },
  });
}
