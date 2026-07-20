import crypto from "node:crypto";
import { Resend } from "resend";

const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtp(): string {
  // 6-digit numeric code, leading zeros allowed.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function sendOtpEmail(email: string, code: string, purpose: "signup" | "signin") {
  const subject =
    purpose === "signup" ? "Your chat signup verification code" : "Your chat sign-in code";

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin:0 0 16px">${subject}</h2>
      <p>Your one-time code is:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">${code}</div>
      <p style="color:#555">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n[OTP] (no RESEND_API_KEY — printing to console) ${email} -> ${code}\n`);
    return { delivered: "console" as const };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
  });
  if (error) {
    console.error("Resend error", error);
    throw new Error("Failed to send OTP email");
  }
  return { delivered: "email" as const };
}

export const OTP_CONFIG = { ttlMs: OTP_TTL_MS };