import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: number;
  displayName?: string;
  username?: string;
  email?: string;
  profileCompleted?: boolean;
};

const sessionPassword = process.env.SESSION_PASSWORD;
// Require SESSION_PASSWORD in every environment — a misconfigured NODE_ENV
// (e.g., set to "staging") would otherwise fall through to the dev fallback
// and let anyone who reads this source forge sessions.
if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error(
    "SESSION_PASSWORD must be set and at least 32 characters. Generate one with: openssl rand -base64 32"
  );
}

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: "chat_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}