import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
