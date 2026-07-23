import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  countUnreadInConversation,
  createConversation,
  findConversationBetween,
  getLastMessageText,
  listConversations,
  getUserById,
} from "@/lib/db";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const rows = (await listConversations(auth.userId)).map((r) => ({
    id: r.id,
    peer: {
      id: r.peer_id,
      displayName: r.peer_display_name,
      username: r.peer_username,
    },
    lastText: r.last_text,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
    unread: r.unread,
  }));
  return NextResponse.json({ conversations: rows });
}

const CreateBody = z.object({
  userId: z
    .number()
    .int()
    .positive()
    .refine(Number.isSafeInteger, "Invalid user id"),
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
  const peer = await getUserById(peerId);
  if (!peer || !peer.profile_completed_at) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const conv =
    (await findConversationBetween(auth.userId, peerId)) ??
    (await createConversation(auth.userId, peerId));

  const lastText = await getLastMessageText(conv.id);
  const unread = await countUnreadInConversation(conv.id, auth.userId);

  return NextResponse.json({
    conversation: {
      id: conv.id,
      peer: {
        id: peer.id,
        displayName: peer.display_name,
        username: peer.username,
      },
      lastText,
      lastMessageAt: conv.last_message_at,
      createdAt: conv.created_at,
      unread,
    },
  });
}
