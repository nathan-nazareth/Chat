import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  upsertRatchetSession,
  getRatchetSession,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const UploadBody = z.object({
  peerId: z.number().int().positive(),
  sharedSecret: z.string(),
  sendingChainKey: z.string(),
  receivingChainKey: z.string(),
  sendCounter: z.number().int().min(0),
  recvCounter: z.number().int().min(0),
  previousSendCount: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const json = await req.json().catch(() => null);
    const parsed = UploadBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    await upsertRatchetSession(
      auth.userId,
      parsed.data.peerId,
      parsed.data.sharedSecret,
      parsed.data.sendingChainKey,
      parsed.data.receivingChainKey,
      parsed.data.sendCounter,
      parsed.data.recvCounter,
      parsed.data.previousSendCount
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ERROR] [keys/session POST] unhandled error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const peerId = Number(url.searchParams.get("peerId"));
    if (!Number.isSafeInteger(peerId) || peerId <= 0) {
      return NextResponse.json({ error: "Invalid peerId" }, { status: 400 });
    }

    const session = await getRatchetSession(auth.userId, peerId);
    if (!session) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("[ERROR] [keys/session GET] unhandled error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
