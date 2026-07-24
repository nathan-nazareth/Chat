import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { upsertUserKeys, getUserKeys, consumeOneTimePrekey } from "@/lib/db";

export const dynamic = "force-dynamic";

const UploadBody = z.object({
  identityPub: z.string(),
  signedPrekeyPub: z.string(),
  signedPrekeySig: z.string(),
  oneTimePrekeys: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const json = await req.json().catch(() => null);
    const parsed = UploadBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    await upsertUserKeys(auth.userId, parsed.data.identityPub, parsed.data.signedPrekeyPub, parsed.data.signedPrekeySig, parsed.data.oneTimePrekeys);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ERROR] [keys/bundle POST]", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const url = new URL(req.url);
    const userId = Number(url.searchParams.get("userId"));
    if (!Number.isSafeInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    const keys = await getUserKeys(userId);
    if (!keys) return NextResponse.json({ error: "User has no keys" }, { status: 404 });
    const otp = await consumeOneTimePrekey(userId);
    return NextResponse.json({ identityPub: keys.identity_pub, signedPrekeyPub: keys.signed_prekey_pub, signedPrekeySig: keys.signed_prekey_sig, oneTimePrekey: otp });
  } catch (error) {
    console.error("[ERROR] [keys/bundle GET]", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
