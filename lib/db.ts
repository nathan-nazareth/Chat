import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR =
  process.env.VERCEL === "1" ? "/tmp" : path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "chat.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    email_verified_at INTEGER,
    profile_completed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);

  CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL,
    last_message_at INTEGER,
    UNIQUE (user_a_id, user_b_id)
  );
  CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
    created_at      INTEGER NOT NULL,
    is_read         INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_msg_conv_time ON messages(conversation_id, created_at);
`);

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

export function getUserByEmail(email: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase()) as User | undefined;
}

export function createUser(email: string): User {
  const now = Date.now();
  const info = db
    .prepare("INSERT INTO users (email, created_at) VALUES (?, ?)")
    .run(email.toLowerCase(), now);
  return getUserById(Number(info.lastInsertRowid))!;
}

export function setPasswordHash(userId: number, hash: string) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function markEmailVerified(userId: number) {
  db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(Date.now(), userId);
}

export function setProfile(userId: number, displayName: string, username: string) {
  db.prepare(
    "UPDATE users SET display_name = ?, username = ?, profile_completed_at = ? WHERE id = ?"
  ).run(displayName, username.toLowerCase(), Date.now(), userId);
}

export function createOtp(email: string, purpose: "signup" | "signin", codeHash: string, ttlMs: number) {
  const now = Date.now();
  db.prepare(
    "INSERT INTO otps (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(email.toLowerCase(), purpose, codeHash, now + ttlMs, now);
}

export function findActiveOtp(email: string, purpose: "signup" | "signin") {
  return db
    .prepare(
      `SELECT * FROM otps
       WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(email.toLowerCase(), purpose, Date.now()) as
    | { id: number; code_hash: string }
    | undefined;
}

export function consumeOtp(id: number) {
  db.prepare("UPDATE otps SET consumed_at = ? WHERE id = ?").run(Date.now(), id);
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

export function searchUsers(query: string, currentUserId: number, limit = 10): PublicUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const rows = db
    .prepare(
      `SELECT id, display_name, username FROM users
       WHERE id != ? AND profile_completed_at IS NOT NULL
         AND (LOWER(display_name) LIKE ? ESCAPE '\\' OR LOWER(username) LIKE ? ESCAPE '\\')
       ORDER BY username COLLATE NOCASE ASC
       LIMIT ?`
    )
    .all(currentUserId, like, like, limit) as PublicUser[];
  return rows;
}

export function findConversationBetween(a: number, b: number): ConversationRow | undefined {
  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`
    )
    .get(a, b, b, a) as ConversationRow | undefined;
}

export function createConversation(a: number, b: number): ConversationRow {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const now = Date.now();
  const info = db
    .prepare(
      "INSERT OR IGNORE INTO conversations (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)"
    )
    .run(userA, userB, now);
  if (info.changes > 0) {
    return findConversationBetween(a, b)!;
  }
  return findConversationBetween(a, b)!;
}

export function listConversations(userId: number): Array<
  ConversationRow & {
    peer_id: number;
    peer_display_name: string | null;
    peer_username: string | null;
    last_text: string | null;
  }
> {
  return db
    .prepare(
      `SELECT
         c.*,
         CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
         u.display_name AS peer_display_name,
         u.username      AS peer_username,
         (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_text
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
       WHERE c.user_a_id = ? OR c.user_b_id = ?
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(userId, userId, userId, userId) as any;
}

export function getConversationById(id: number): ConversationRow | undefined {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | ConversationRow
    | undefined;
}

export function isConversationMember(conversationId: number, userId: number): boolean {
  const row = db
    .prepare("SELECT user_a_id, user_b_id FROM conversations WHERE id = ?")
    .get(conversationId) as { user_a_id: number; user_b_id: number } | undefined;
  if (!row) return false;
  return row.user_a_id === userId || row.user_b_id === userId;
}

export function listMessages(conversationId: number, limit = 200): MessageRow[] {
  return db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(conversationId, limit) as MessageRow[];
}

export function createMessage(
  conversationId: number,
  senderId: number,
  text: string
): MessageRow {
  const now = Date.now();
  const info = db
    .prepare(
      "INSERT INTO messages (conversation_id, sender_id, text, created_at, is_read) VALUES (?, ?, ?, ?, 0)"
    )
    .run(conversationId, senderId, text, now);
  db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(
    now,
    conversationId
  );
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid) as MessageRow;
}

export function markConversationRead(conversationId: number, userId: number) {
  db.prepare(
    "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0"
  ).run(conversationId, userId);
}

export function countUnreadForUser(userId: number): Array<{
  conversation_id: number;
  unread: number;
}> {
  return db
    .prepare(
      `SELECT m.conversation_id, COUNT(*) AS unread
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.user_a_id = ? OR c.user_b_id = ?)
         AND m.sender_id != ? AND m.is_read = 0
       GROUP BY m.conversation_id`
    )
    .all(userId, userId, userId) as Array<{ conversation_id: number; unread: number }>;
}

export default db;