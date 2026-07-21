import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

const isVercel = process.env.VERCEL === "1";

let _client: Client | null = null;
function getClient(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url) {
    _client = createClient({ url, authToken });
    return _client;
  }
  if (isVercel || process.env.NODE_ENV === "production") {
    throw new Error("TURSO_DATABASE_URL is required in production");
  }
  const dataDir = path.join(process.cwd(), ".data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  _client = createClient({ url: `file:${path.join(dataDir, "chat.db")}` });
  return _client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    email_verified_at INTEGER,
    profile_completed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose)`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL,
    last_message_at INTEGER,
    UNIQUE (user_a_id, user_b_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at DESC)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
    created_at      INTEGER NOT NULL,
    is_read         INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_msg_conv_time ON messages(conversation_id, created_at)`,
];

let initPromise: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      for (const stmt of SCHEMA) await getClient().execute(stmt);
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function n(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return NaN;
}

export type User = {
  id: number;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  username: string | null;
  email_verified_at: number | null;
  profile_completed_at: number | null;
  created_at: number;
};

export async function getUserByEmail(email: string): Promise<User | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.toLowerCase()],
  });
  return (rs.rows[0] as unknown as User | undefined) ?? undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  const row = rs.rows[0] as unknown as User | undefined;
  return row ? { ...row, id: n(row.id) } : undefined;
}

export async function getUserByUsername(
  username: string
): Promise<User | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username.toLowerCase()],
  });
  const row = rs.rows[0] as unknown as User | undefined;
  return row ? { ...row, id: n(row.id) } : undefined;
}

export async function createUser(email: string): Promise<User> {
  await ensureSchema();
  const now = Date.now();
  const info = await getClient().execute({
    sql: "INSERT INTO users (email, created_at) VALUES (?, ?)",
    args: [email.toLowerCase(), now],
  });
  const created = await getUserById(n(info.lastInsertRowid));
  if (!created) throw new Error("Failed to create user");
  return created;
}

export async function setPasswordHash(
  userId: number,
  hash: string
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [hash, userId],
  });
}

export async function markEmailVerified(userId: number): Promise<void> {
  await getClient().execute({
    sql: "UPDATE users SET email_verified_at = ? WHERE id = ?",
    args: [Date.now(), userId],
  });
}

export async function setProfile(
  userId: number,
  displayName: string,
  username: string
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE users SET display_name = ?, username = ?, profile_completed_at = ? WHERE id = ?",
    args: [displayName, username.toLowerCase(), Date.now(), userId],
  });
}

export async function createOtp(
  email: string,
  purpose: "signup" | "signin",
  codeHash: string,
  ttlMs: number
): Promise<void> {
  const now = Date.now();
  await getClient().execute({
    sql: "INSERT INTO otps (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [email.toLowerCase(), purpose, codeHash, now + ttlMs, now],
  });
}

export async function findActiveOtp(
  email: string,
  purpose: "signup" | "signin"
): Promise<{ id: number; code_hash: string } | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT * FROM otps
          WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
          ORDER BY id DESC LIMIT 1`,
    args: [email.toLowerCase(), purpose, Date.now()],
  });
  const row = rs.rows[0] as unknown as
    | { id: number; code_hash: string }
    | undefined;
  return row ? { id: n(row.id), code_hash: row.code_hash } : undefined;
}

export async function consumeOtp(id: number): Promise<void> {
  await getClient().execute({
    sql: "UPDATE otps SET consumed_at = ? WHERE id = ?",
    args: [Date.now(), id],
  });
}

// ---------- Search / conversations / messages ----------

export type PublicUser = {
  id: number;
  display_name: string | null;
  username: string | null;
};

export type ConversationRow = {
  id: number;
  user_a_id: number;
  user_b_id: number;
  created_at: number;
  last_message_at: number | null;
};

export type MessageRow = {
  id: number;
  conversation_id: number;
  sender_id: number;
  text: string;
  created_at: number;
  is_read: number;
};

export async function searchUsers(
  query: string,
  currentUserId: number,
  limit = 10
): Promise<PublicUser[]> {
  await ensureSchema();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const rs = await getClient().execute({
    sql: `SELECT id, display_name, username FROM users
          WHERE id != ? AND profile_completed_at IS NOT NULL
            AND (LOWER(display_name) LIKE ? ESCAPE '\\' OR LOWER(username) LIKE ? ESCAPE '\\')
          ORDER BY username COLLATE NOCASE ASC
          LIMIT ?`,
    args: [currentUserId, like, like, limit],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as PublicUser;
    return { ...row, id: n(row.id) };
  });
}

export async function findConversationBetween(
  a: number,
  b: number
): Promise<ConversationRow | undefined> {
  const rs = await getClient().execute({
    sql: `SELECT * FROM conversations
          WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`,
    args: [a, b, b, a],
  });
  const row = rs.rows[0] as unknown as ConversationRow | undefined;
  return row
    ? {
        ...row,
        id: n(row.id),
        user_a_id: n(row.user_a_id),
        user_b_id: n(row.user_b_id),
      }
    : undefined;
}

export async function createConversation(
  a: number,
  b: number
): Promise<ConversationRow> {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const now = Date.now();
  await getClient().execute({
    sql: "INSERT OR IGNORE INTO conversations (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)",
    args: [userA, userB, now],
  });
  const conv = await findConversationBetween(a, b);
  if (!conv) throw new Error("Failed to create conversation");
  return conv;
}

export type ConversationWithPeer = ConversationRow & {
  peer_id: number;
  peer_display_name: string | null;
  peer_username: string | null;
  last_text: string | null;
};

export async function listConversations(
  userId: number
): Promise<ConversationWithPeer[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT
            c.*,
            CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
            u.display_name AS peer_display_name,
            u.username      AS peer_username,
            (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_text
          FROM conversations c
          JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
          WHERE c.user_a_id = ? OR c.user_b_id = ?
          ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    args: [userId, userId, userId, userId],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as ConversationWithPeer;
    return {
      ...row,
      id: n(row.id),
      user_a_id: n(row.user_a_id),
      user_b_id: n(row.user_b_id),
      peer_id: n(row.peer_id),
    };
  });
}

export async function getConversationById(
  id: number
): Promise<ConversationRow | undefined> {
  const rs = await getClient().execute({
    sql: "SELECT * FROM conversations WHERE id = ?",
    args: [id],
  });
  const row = rs.rows[0] as unknown as ConversationRow | undefined;
  return row ? { ...row, id: n(row.id) } : undefined;
}

export async function isConversationMember(
  conversationId: number,
  userId: number
): Promise<boolean> {
  const rs = await getClient().execute({
    sql: "SELECT user_a_id, user_b_id FROM conversations WHERE id = ?",
    args: [conversationId],
  });
  const row = rs.rows[0] as unknown as
    | { user_a_id: number; user_b_id: number }
    | undefined;
  if (!row) return false;
  return n(row.user_a_id) === userId || n(row.user_b_id) === userId;
}

export async function listMessages(
  conversationId: number,
  limit = 200
): Promise<MessageRow[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`,
    args: [conversationId, limit],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as MessageRow;
    return {
      ...row,
      id: n(row.id),
      conversation_id: n(row.conversation_id),
      sender_id: n(row.sender_id),
      is_read: n(row.is_read),
    };
  });
}

export async function createMessage(
  conversationId: number,
  senderId: number,
  text: string
): Promise<MessageRow> {
  const now = Date.now();
  const info = await getClient().execute({
    sql: "INSERT INTO messages (conversation_id, sender_id, text, created_at, is_read) VALUES (?, ?, ?, ?, 0)",
    args: [conversationId, senderId, text, now],
  });
  await getClient().execute({
    sql: "UPDATE conversations SET last_message_at = ? WHERE id = ?",
    args: [now, conversationId],
  });
  const rs = await getClient().execute({
    sql: "SELECT * FROM messages WHERE id = ?",
    args: [n(info.lastInsertRowid)],
  });
  const row = rs.rows[0] as unknown as MessageRow;
  return {
    ...row,
    id: n(row.id),
    conversation_id: n(row.conversation_id),
    sender_id: n(row.sender_id),
    is_read: n(row.is_read),
  };
}

export async function markConversationRead(
  conversationId: number,
  userId: number
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0",
    args: [conversationId, userId],
  });
}

export async function countUnreadForUser(
  userId: number
): Promise<Array<{ conversation_id: number; unread: number }>> {
  const rs = await getClient().execute({
    sql: `SELECT m.conversation_id, COUNT(*) AS unread
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE (c.user_a_id = ? OR c.user_b_id = ?)
            AND m.sender_id != ? AND m.is_read = 0
          GROUP BY m.conversation_id`,
    args: [userId, userId, userId],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as { conversation_id: number; unread: number };
    return {
      conversation_id: n(row.conversation_id),
      unread: n(row.unread),
    };
  });
}
