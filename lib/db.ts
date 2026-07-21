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

export default db;