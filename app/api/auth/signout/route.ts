import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getSession();
    await session.destroy();
    console.log("[INFO] [auth/signout] session destroyed");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ERROR] [auth/signout] failed:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}