import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addPushSubscription } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subscription" },
      { status: 400 }
    );
  }

  await addPushSubscription(
    auth.userId,
    parsed.data.endpoint,
    parsed.data.keys.p256dh,
    parsed.data.keys.auth
  );

  return NextResponse.json({ ok: true });
}
