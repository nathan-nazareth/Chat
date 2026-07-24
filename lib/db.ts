import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

let _client: Client | null = null;
function getClient(): Client {
  if (_client) return _client;
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
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_otps_active
     ON otps(email, purpose) WHERE consumed_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL,
    last_message_at INTEGER,
    UNIQUE (user_a_id, user_b_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_pair ON conversations(user_a_id, user_b_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
    created_at      INTEGER NOT NULL,
    is_read         INTEGER NOT NULL DEFAULT 0,
    ciphertext      TEXT,
    iv              TEXT,
    counter         INTEGER,
    eph_pub         TEXT,
    ik_pub          TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_msg_conv_time ON messages(conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_keys (
    user_id                INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    identity_pub           TEXT NOT NULL,
    signed_prekey_pub      TEXT NOT NULL,
    signed_prekey_sig      TEXT NOT NULL,
    one_time_prekeys       TEXT NOT NULL DEFAULT '[]',
    updated_at             INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ratchet_sessions (
    my_id                  INTEGER NOT NULL,
    peer_id                INTEGER NOT NULL,
    shared_secret          TEXT NOT NULL,
    sending_chain_key      TEXT NOT NULL,
    receiving_chain_key    TEXT NOT NULL,
    send_counter           INTEGER NOT NULL DEFAULT 0,
    recv_counter           INTEGER NOT NULL DEFAULT 0,
    previous_send_count    INTEGER NOT NULL DEFAULT 0,
    updated_at             INTEGER NOT NULL,
    PRIMARY KEY (my_id, peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint      TEXT NOT NULL,
    p256dh        TEXT NOT NULL,
    auth          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    UNIQUE (user_id, endpoint)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`,
];

let initPromise: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      for (const stmt of SCHEMA) {
        try {
          await getClient().execute(stmt);
        } catch (err: any) {
          if (err?.message?.includes("duplicate column")) continue;
          throw err;
        }
      }
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
  console.warn("[WARN] [db] n() received unexpected type:", typeof v, v);
  return 0;
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
  const row = rs.rows[0] as unknown as User | undefined;
  return row ? { ...row, id: n(row.id) } : undefined;
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

export async function setProfile(
  userId: number,
  displayName: string,
  username: string
): Promise<boolean> {
  await ensureSchema();
  const result = await getClient().execute({
    sql: "UPDATE users SET display_name = ?, username = ?, profile_completed_at = ? WHERE id = ? AND profile_completed_at IS NULL AND password_hash IS NOT NULL",
    args: [displayName, username.toLowerCase(), Date.now(), userId],
  });
  return result.rowsAffected === 1;
}

export async function createOtp(
  email: string,
  purpose: "signup" | "signin",
  codeHash: string,
  ttlMs: number
): Promise<number> {
  await ensureSchema();
  const now = Date.now();
  const normalizedEmail = email.toLowerCase();
  const tx = await getClient().transaction("write");
  try {
    await tx.execute({
      sql: "UPDATE otps SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL",
      args: [now, normalizedEmail, purpose],
    });
    const info = await tx.execute({
      sql: "INSERT INTO otps (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [normalizedEmail, purpose, codeHash, now + ttlMs, now],
    });
    await tx.commit();
    const id = n(info.lastInsertRowid);
    if (!Number.isSafeInteger(id)) throw new Error("Failed to create OTP");
    return id;
  } finally {
    tx.close();
  }
}

export async function findActiveOtpByHash(
  email: string,
  purpose: "signup" | "signin",
  codeHash: string
): Promise<{ id: number } | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT id FROM otps
          WHERE email = ? AND purpose = ? AND code_hash = ?
            AND consumed_at IS NULL AND expires_at > ?
          LIMIT 1`,
    args: [email.toLowerCase(), purpose, codeHash, Date.now()],
  });
  const row = rs.rows[0] as unknown as { id: number } | undefined;
  return row ? { id: n(row.id) } : undefined;
}

export async function consumeActiveOtp(
  email: string,
  purpose: "signup" | "signin",
  codeHash: string
): Promise<boolean> {
  await ensureSchema();
  const now = Date.now();
  const rs = await getClient().execute({
    sql: `UPDATE otps SET consumed_at = ?
          WHERE email = ? AND purpose = ? AND code_hash = ?
            AND consumed_at IS NULL AND expires_at > ?`,
    args: [now, email.toLowerCase(), purpose, codeHash, now],
  });
  return rs.rowsAffected === 1;
}

export async function setPasswordHashByEmail(
  email: string,
  passwordHash: string
): Promise<User | undefined> {
  await ensureSchema();
  const normalizedEmail = email.toLowerCase();
  const now = Date.now();
  const tx = await getClient().transaction("write");
  try {
    const rs = await tx.execute({
      sql: `UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?)
            WHERE email = ? AND password_hash IS NULL AND profile_completed_at IS NULL
            RETURNING *`,
      args: [passwordHash, now, normalizedEmail],
    });
    const row = rs.rows[0] as unknown as User | undefined;
    await tx.commit();
    if (!row) return undefined;
    return { ...row, id: n(row.id) };
  } finally {
    tx.close();
  }
}

export type SignupCompletion =
  | { status: "ok"; user: User }
  | { status: "invalid_otp" }
  | { status: "account_exists" };

export async function completeSignup(
  email: string,
  codeHash: string,
  passwordHash: string | null
): Promise<SignupCompletion> {
  await ensureSchema();
  const normalizedEmail = email.toLowerCase();
  const now = Date.now();
  const tx = await getClient().transaction("write");
  try {
    const claimed = await tx.execute({
      sql: `UPDATE otps SET consumed_at = ?
            WHERE email = ? AND purpose = 'signup' AND code_hash = ?
              AND consumed_at IS NULL AND expires_at > ?`,
      args: [now, normalizedEmail, codeHash, now],
    });
    if (claimed.rowsAffected !== 1) return { status: "invalid_otp" };

    if (passwordHash === null) {
      const rs = await tx.execute({
        sql: `INSERT INTO users (email, email_verified_at, created_at)
              VALUES (?, ?, ?)
              ON CONFLICT(email) DO NOTHING
              RETURNING *`,
        args: [normalizedEmail, now, now],
      });
      let row = rs.rows[0] as unknown as User | undefined;
      if (!row) {
        const existing = await tx.execute({
          sql: "SELECT * FROM users WHERE email = ?",
          args: [normalizedEmail],
        });
        row = existing.rows[0] as unknown as User | undefined;
      }
      if (!row || row.password_hash || row.profile_completed_at) {
        await tx.commit();
        return { status: "account_exists" };
      }
      await tx.commit();
      return { status: "ok", user: { ...row, id: n(row.id) } };
    }

    const rs = await tx.execute({
      sql: `INSERT INTO users (email, password_hash, email_verified_at, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO NOTHING
            RETURNING *`,
      args: [normalizedEmail, passwordHash, now, now],
    });
    let row = rs.rows[0] as unknown as User | undefined;
    if (!row) {
      const updated = await tx.execute({
        sql: `UPDATE users
              SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?)
              WHERE email = ? AND password_hash IS NULL AND profile_completed_at IS NULL
              RETURNING *`,
        args: [passwordHash, now, normalizedEmail],
      });
      row = updated.rows[0] as unknown as User | undefined;
    }
    if (!row) return { status: "account_exists" };
    await tx.commit();
    return { status: "ok", user: { ...row, id: n(row.id) } };
  } finally {
    tx.close();
  }
}

// ---------- Search / conversations / messages ----------

type PublicUserRow = {
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
  ciphertext: string | null;
  iv: string | null;
  counter: number | null;
  eph_pub: string | null;
  ik_pub: string | null;
};

export async function searchUsers(
  query: string,
  currentUserId: number,
  limit = 10
): Promise<PublicUserRow[]> {
  await ensureSchema();
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const rs = await getClient().execute({
    sql: `SELECT id, display_name, username FROM users
          WHERE id != ? AND profile_completed_at IS NOT NULL
            AND (LOWER(display_name) LIKE ? ESCAPE '\\' OR LOWER(username) LIKE ? ESCAPE '\\')
          ORDER BY username COLLATE NOCASE ASC
          LIMIT ?`,
    args: [currentUserId, like, like, limit],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as PublicUserRow;
    return { ...row, id: n(row.id) };
  });
}

export async function findConversationBetween(
  a: number,
  b: number
): Promise<ConversationRow | undefined> {
  await ensureSchema();
  if (a === b) return undefined;
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const rs = await getClient().execute({
    sql: `SELECT * FROM conversations
          WHERE user_a_id = ? AND user_b_id = ?`,
    args: [userA, userB],
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
  await ensureSchema();
  if (a === b) throw new Error("Cannot create conversation with self");
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const now = Date.now();
  const tx = await getClient().transaction("write");
  try {
    await tx.execute({
      sql: "INSERT OR IGNORE INTO conversations (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)",
      args: [userA, userB, now],
    });
    const rs = await tx.execute({
      sql: "SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?",
      args: [userA, userB],
    });
    await tx.commit();
    const row = rs.rows[0] as unknown as ConversationRow | undefined;
    if (!row) throw new Error("Failed to create conversation");
    return {
      ...row,
      id: n(row.id),
      user_a_id: n(row.user_a_id),
      user_b_id: n(row.user_b_id),
    };
  } finally {
    tx.close();
  }
}

export type ConversationWithPeer = ConversationRow & {
  peer_id: number;
  peer_display_name: string | null;
  peer_username: string | null;
  last_text: string | null;
  unread: number;
};

export async function listConversations(
  userId: number
): Promise<ConversationWithPeer[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `WITH mine AS (
            SELECT id FROM conversations
            WHERE user_a_id = ? OR user_b_id = ?
          ),
          last_msg AS (
            SELECT m.conversation_id, m.text,
                   ROW_NUMBER() OVER (
                     PARTITION BY m.conversation_id
                     ORDER BY m.created_at DESC, m.id DESC
                   ) AS rn
            FROM messages m
            WHERE m.conversation_id IN (SELECT id FROM mine)
          ),
          unread AS (
            SELECT m.conversation_id, COUNT(*) AS unread
            FROM messages m
            WHERE m.conversation_id IN (SELECT id FROM mine)
              AND m.sender_id != ?
              AND m.is_read = 0
            GROUP BY m.conversation_id
          )
          SELECT
            c.id,
            c.user_a_id,
            c.user_b_id,
            c.created_at,
            c.last_message_at,
            CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
            u.display_name AS peer_display_name,
            u.username      AS peer_username,
            last_msg.text   AS last_text,
            COALESCE(unread.unread, 0) AS unread
          FROM conversations c
          JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
          LEFT JOIN last_msg ON last_msg.conversation_id = c.id AND last_msg.rn = 1
          LEFT JOIN unread   ON unread.conversation_id   = c.id
          ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC`,
    args: [userId, userId, userId, userId, userId],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as ConversationWithPeer;
    return {
      ...row,
      id: n(row.id),
      user_a_id: n(row.user_a_id),
      user_b_id: n(row.user_b_id),
      peer_id: n(row.peer_id),
      unread: n(row.unread),
    };
  });
}

export async function getLastMessageText(
  conversationId: number
): Promise<string | null> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT text FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    args: [conversationId],
  });
  const row = rs.rows[0] as unknown as { text: string } | undefined;
  return row ? row.text : null;
}

export async function countUnreadInConversation(
  conversationId: number,
  userId: number
): Promise<number> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND sender_id != ? AND is_read = 0",
    args: [conversationId, userId],
  });
  const row = rs.rows[0] as unknown as { c: number };
  return n(row.c);
}

export async function isConversationMember(
  conversationId: number,
  userId: number
): Promise<boolean> {
  await ensureSchema();
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

export async function getConversationPeer(
  conversationId: number,
  userId: number
): Promise<{ peerId: number; peerName: string | null } | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT
            CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
            u.display_name AS peer_name
          FROM conversations c
          JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
          WHERE c.id = ? AND (c.user_a_id = ? OR c.user_b_id = ?)`,
    args: [userId, userId, conversationId, userId, userId],
  });
  const row = rs.rows[0] as unknown as
    | { peer_id: number; peer_name: string | null }
    | undefined;
  if (!row) return undefined;
  return { peerId: n(row.peer_id), peerName: row.peer_name };
}

export async function listMessages(
  conversationId: number,
  limit = 200
): Promise<MessageRow[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT * FROM (
            SELECT * FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          )
          ORDER BY created_at ASC, id ASC`,
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

export async function listAndMarkRead(
  conversationId: number,
  userId: number,
  limit = 200
): Promise<{ messages: MessageRow[]; marked: number }> {
  await ensureSchema();
  const tx = await getClient().transaction("write");
  try {
    const marked = await tx.execute({
      sql: `UPDATE messages SET is_read = 1
            WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
      args: [conversationId, userId],
    });
    const rs = await tx.execute({
      sql: `SELECT * FROM (
              SELECT * FROM messages
              WHERE conversation_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            )
            ORDER BY created_at ASC, id ASC`,
      args: [conversationId, limit],
    });
    await tx.commit();
    return {
      marked: n(marked.rowsAffected),
      messages: rs.rows.map((r) => {
        const row = r as unknown as MessageRow;
        return {
          ...row,
          id: n(row.id),
          conversation_id: n(row.conversation_id),
          sender_id: n(row.sender_id),
          is_read: n(row.is_read),
        };
      }),
    };
  } finally {
    tx.close();
  }
}

export async function markRead(
  conversationId: number,
  userId: number
): Promise<number> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `UPDATE messages SET is_read = 1
          WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
    args: [conversationId, userId],
  });
  return n(rs.rowsAffected);
}

export async function searchMessagesInConversation(
  conversationId: number,
  query: string,
  limit = 100
): Promise<MessageRow[]> {
  await ensureSchema();
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase().replace(/[\\%_]/g, (m) => "\\" + m);
  const like = `%${q}%`;
  const rs = await getClient().execute({
    sql: `SELECT * FROM messages
          WHERE conversation_id = ? AND LOWER(text) LIKE ? ESCAPE '\\'
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [conversationId, like, limit],
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

export async function searchAllMessages(
  userId: number,
  query: string,
  limit = 50,
  offset = 0
): Promise<(MessageRow & { peer_id: number; peer_display_name: string | null; peer_username: string | null })[]> {
  await ensureSchema();
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase().replace(/[\\%_]/g, (m) => "\\" + m);
  const like = `%${q}%`;
  const rs = await getClient().execute({
    sql: `SELECT m.*,
            CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
            u.display_name AS peer_display_name,
            u.username AS peer_username
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
          WHERE (c.user_a_id = ? OR c.user_b_id = ?)
            AND LOWER(m.text) LIKE ? ESCAPE '\\'
          ORDER BY m.created_at DESC
          LIMIT ? OFFSET ?`,
    args: [userId, userId, userId, userId, like, limit, offset],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as MessageRow & { peer_id: number; peer_display_name: string | null; peer_username: string | null };
    return {
      ...row,
      id: n(row.id),
      conversation_id: n(row.conversation_id),
      sender_id: n(row.sender_id),
      peer_id: n(row.peer_id),
      is_read: n(row.is_read),
    };
  });
}

export async function createMessage(
  conversationId: number,
  senderId: number,
  text: string,
  ciphertext?: string,
  iv?: string,
  counter?: number,
  ephPub?: string,
  ikPub?: string
): Promise<MessageRow | undefined> {
  await ensureSchema();
  const now = Date.now();
  const tx = await getClient().transaction("write");
  try {
    const inserted = await tx.execute({
      sql: `INSERT INTO messages (conversation_id, sender_id, text, created_at, is_read, ciphertext, iv, counter, eph_pub, ik_pub)
            SELECT ?, ?, ?, ?, 0, ?, ?, ?, ?, ?
            FROM conversations
            WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)
            RETURNING *`,
      args: [
        conversationId,
        senderId,
        text,
        now,
        ciphertext ?? null,
        iv ?? null,
        counter ?? null,
        ephPub ?? null,
        ikPub ?? null,
        conversationId,
        senderId,
        senderId,
      ],
    });
    const row = inserted.rows[0] as unknown as MessageRow | undefined;
    if (!row) return undefined;
    await tx.execute({
      sql: "UPDATE conversations SET last_message_at = MAX(COALESCE(last_message_at, 0), ?) WHERE id = ?",
      args: [now, conversationId],
    });
    await tx.commit();
    return {
      ...row,
      id: n(row.id),
      conversation_id: n(row.conversation_id),
      sender_id: n(row.sender_id),
      is_read: n(row.is_read),
    };
  } finally {
    tx.close();
  }
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export async function upsertUserKeys(
  userId: number,
  identityPub: string,
  signedPrekeyPub: string,
  signedPrekeySig: string,
  oneTimePrekeys: string[]
): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await getClient().execute({
    sql: `INSERT INTO user_keys (user_id, identity_pub, signed_prekey_pub, signed_prekey_sig, one_time_prekeys, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            identity_pub = excluded.identity_pub,
            signed_prekey_pub = excluded.signed_prekey_pub,
            signed_prekey_sig = excluded.signed_prekey_sig,
            one_time_prekeys = excluded.one_time_prekeys,
            updated_at = excluded.updated_at`,
    args: [userId, identityPub, signedPrekeyPub, signedPrekeySig, JSON.stringify(oneTimePrekeys), now],
  });
}

export async function getUserKeys(userId: number): Promise<{
  identity_pub: string;
  signed_prekey_pub: string;
  signed_prekey_sig: string;
  one_time_prekeys: string[];
} | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM user_keys WHERE user_id = ?",
    args: [userId],
  });
  const row = rs.rows[0] as unknown as {
    identity_pub: string;
    signed_prekey_pub: string;
    signed_prekey_sig: string;
    one_time_prekeys: string;
  } | undefined;
  if (!row) return undefined;
  return {
    ...row,
    one_time_prekeys: JSON.parse(row.one_time_prekeys),
  };
}

export async function consumeOneTimePrekey(userId: number): Promise<string | null> {
  await ensureSchema();
  const now = Date.now();
  const tx = await getClient().transaction("write");
  try {
    const rs = await tx.execute({
      sql: "SELECT one_time_prekeys FROM user_keys WHERE user_id = ?",
      args: [userId],
    });
    const row = rs.rows[0] as unknown as { one_time_prekeys: string } | undefined;
    if (!row) return null;
    const keys: string[] = JSON.parse(row.one_time_prekeys);
    if (keys.length === 0) return null;
    const consumed = keys.shift()!;
    await tx.execute({
      sql: "UPDATE user_keys SET one_time_prekeys = ?, updated_at = ? WHERE user_id = ?",
      args: [JSON.stringify(keys), now, userId],
    });
    await tx.commit();
    return consumed;
  } finally {
    tx.close();
  }
}

export async function upsertRatchetSession(
  myId: number,
  peerId: number,
  sharedSecret: string,
  sendingChainKey: string,
  receivingChainKey: string,
  sendCounter: number,
  recvCounter: number,
  previousSendCount: number
): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await getClient().execute({
    sql: `INSERT INTO ratchet_sessions (my_id, peer_id, shared_secret, sending_chain_key, receiving_chain_key, send_counter, recv_counter, previous_send_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(my_id, peer_id) DO UPDATE SET
            shared_secret = excluded.shared_secret,
            sending_chain_key = excluded.sending_chain_key,
            receiving_chain_key = excluded.receiving_chain_key,
            send_counter = excluded.send_counter,
            recv_counter = excluded.recv_counter,
            previous_send_count = excluded.previous_send_count,
            updated_at = excluded.updated_at`,
    args: [myId, peerId, sharedSecret, sendingChainKey, receivingChainKey, sendCounter, recvCounter, previousSendCount, now],
  });
}

export async function getRatchetSession(
  myId: number,
  peerId: number
): Promise<{
  shared_secret: string;
  sending_chain_key: string;
  receiving_chain_key: string;
  send_counter: number;
  recv_counter: number;
  previous_send_count: number;
} | undefined> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM ratchet_sessions WHERE my_id = ? AND peer_id = ?",
    args: [myId, peerId],
  });
  const row = rs.rows[0] as unknown as {
    shared_secret: string;
    sending_chain_key: string;
    receiving_chain_key: string;
    send_counter: number;
    recv_counter: number;
    previous_send_count: number;
  } | undefined;
  if (!row) return undefined;
  return {
    ...row,
    send_counter: n(row.send_counter),
    recv_counter: n(row.recv_counter),
    previous_send_count: n(row.previous_send_count),
  };
}

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

export type PushSubscriptionRow = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
};

export async function addPushSubscription(
  userId: number,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: `INSERT OR IGNORE INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [userId, endpoint, p256dh, auth, Date.now()],
  });
}

export async function removePushSubscription(
  userId: number,
  endpoint: string
): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    args: [userId, endpoint],
  });
}

export async function getPushSubscriptions(
  userId: number
): Promise<PushSubscriptionRow[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT * FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });
  return rs.rows.map((r) => {
    const row = r as unknown as PushSubscriptionRow;
    return { ...row, id: n(row.id), user_id: n(row.user_id) };
  });
}
