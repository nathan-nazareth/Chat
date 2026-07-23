import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isConversationMember, markRead } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const conversationId = Number(params.id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await isConversationMember(conversationId, auth.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const marked = await markRead(conversationId, auth.userId);
  return NextResponse.json({ ok: true, marked });
}