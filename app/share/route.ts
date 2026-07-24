import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const text =
      (formData.get("text") as string) ||
      (formData.get("title") as string) ||
      (formData.get("url") as string) ||
      "";
    const url = new URL("/", req.url);
    if (text) {
      url.searchParams.set("shared_text", text.slice(0, 4000));
    }
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(new URL("/", req.url), 303);
  }
}
