import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  createMessage,
  isConversationMember,
  listMessages,
  markConversationRead,
} from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const conversationId = Number(params.id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await isConversationMember(conversationId, auth.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = (await listMessages(conversationId)).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    text: m.text,
    createdAt: m.created_at,
    isRead: Boolean(m.is_read),
  }));
  await markConversationRead(conversationId, auth.userId);
  return NextResponse.json({ messages });
}

const SendBody = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const conversationId = Number(params.id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await isConversationMember(conversationId, auth.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SendBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const m = await createMessage(conversationId, auth.userId, parsed.data.text);
  return NextResponse.json({
    message: {
      id: m.id,
      senderId: m.sender_id,
      text: m.text,
      createdAt: m.created_at,
      isRead: false,
    },
  });
}
