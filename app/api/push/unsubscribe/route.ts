import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { removePushSubscription } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.string(),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await removePushSubscription(auth.userId, parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
