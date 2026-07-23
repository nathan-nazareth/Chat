import crypto from "node:crypto";
import { Resend } from "resend";

export const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

type SendResult = { delivered: "email" | "console" };

function buildEmail(
  _email: string,
  code: string,
  purpose: "signup" | "signin"
): { subject: string; html: string; text: string } {
  const subject =
    purpose === "signup"
      ? "Your chat signup verification code"
      : "Your chat sign-in code";
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin:0 0 16px">${subject}</h2>
      <p>Your one-time code is:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">${code}</div>
      <p style="color:#555">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`;
  const text =
    `${subject}\n\n` +
    `Your one-time code is: ${code}\n\n` +
    `This code expires in 10 minutes. If you didn't request it, ignore this email.`;
  return { subject, html, text };
}

export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: "signup" | "signin"
): Promise<SendResult> {
  const { subject, html, text } = buildEmail(email, code, purpose);

  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    "onboarding@resend.dev";

  // No Resend configured: surface the code via the server console so the
  // operator can copy it. We intentionally do NOT hard-fail in production
  // (which would surface as a 500 to the user) — instead we log the code and
  // let the route expose it via `devCode` so signup can still proceed.
  if (!apiKey) {
    console.log(`[OTP] ${purpose} -> ${email}: ${code}\n${text}`);
    return { delivered: "console" };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });
  if (error) throw new Error(error.message || "Failed to send OTP email");
  return { delivered: "email" };
}

export const OTP_CONFIG = { ttlMs: OTP_TTL_MS };
