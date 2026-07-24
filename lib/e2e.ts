// Client-side E2E key management — IndexedDB storage + session state.

import {
  generateECDHKeyPair,
  importECDHPublicKey,
  x3dhSender,
  initRatchetFromSharedSecret,
  hkdf,
  bufToHex,
  hexToBytes,
} from "./crypto";
import type { RatchetState } from "./crypto";

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = "chat-e2e";
const DB_VERSION = 1;
const KEYS_STORE = "identity-keys";
const SESSIONS_STORE = "ratchet-sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS_STORE)) db.createObjectStore(KEYS_STORE);
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Identity key storage
// ---------------------------------------------------------------------------

export type IdentityKeyBundle = {
  userId: number;
  identityKey: CryptoKey;
  identityPubRaw: Uint8Array;
  signedPrekey: CryptoKey;
  signedPrekeyPubRaw: Uint8Array;
  oneTimePrekeys: CryptoKey[];
  oneTimePrekeyPubRaw: Uint8Array[];
};

async function storeIdentity(bundle: IdentityKeyBundle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, "readwrite");
    tx.objectStore(KEYS_STORE).put(bundle, bundle.userId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadIdentity(userId: number): Promise<IdentityKeyBundle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, "readonly");
    const req = tx.objectStore(KEYS_STORE).get(userId);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function generateIdentityBundle(
  userId: number,
  otpCount = 5
): Promise<{
  local: IdentityKeyBundle;
  serverPayload: {
    identityPub: string;
    signedPrekeyPub: string;
    signedPrekeySig: string;
    oneTimePrekeys: string[];
  };
}> {
  const identityKey = await generateECDHKeyPair();
  const signedPrekey = await generateECDHKeyPair();

  const sigInfo = new Uint8Array([...new TextEncoder().encode("signed-prekey-sig")]);
  const signedPrekeySig = await hkdf(
    new Uint8Array(await crypto.subtle.exportKey("raw", identityKey.privateKey)).buffer as ArrayBuffer,
    new Uint8Array(0),
    sigInfo,
    32
  );

  const oneTimePrekeys: CryptoKey[] = [];
  const oneTimePrekeyPubRaw: Uint8Array[] = [];

  for (let i = 0; i < otpCount; i++) {
    const otp = await generateECDHKeyPair();
    oneTimePrekeys.push(otp.privateKey);
    oneTimePrekeyPubRaw.push(otp.pubRaw);
  }

  const bundle: IdentityKeyBundle = {
    userId,
    identityKey: identityKey.privateKey,
    identityPubRaw: identityKey.pubRaw,
    signedPrekey: signedPrekey.privateKey,
    signedPrekeyPubRaw: signedPrekey.pubRaw,
    oneTimePrekeys,
    oneTimePrekeyPubRaw,
  };

  await storeIdentity(bundle);

  return {
    local: bundle,
    serverPayload: {
      identityPub: bufToHex(identityKey.pubRaw.buffer as ArrayBuffer),
      signedPrekeyPub: bufToHex(signedPrekey.pubRaw.buffer as ArrayBuffer),
      signedPrekeySig: bufToHex(signedPrekeySig.buffer as ArrayBuffer),
      oneTimePrekeys: oneTimePrekeyPubRaw.map((raw) =>
        bufToHex(raw.buffer as ArrayBuffer)
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Ratchet session storage
// ---------------------------------------------------------------------------

export type RatchetSession = {
  key: string;
  peerId: number;
  peerIdPubRaw: Uint8Array;
  peerSignedPrekeyPubRaw: Uint8Array;
  sharedSecret: Uint8Array;
  state: RatchetState;
};

const sessionCache = new Map<string, RatchetSession>();

async function storeSession(session: RatchetSession): Promise<void> {
  sessionCache.set(session.key, session);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).put(session, session.key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadSession(key: string): Promise<RatchetSession | null> {
  if (sessionCache.has(key)) return sessionCache.get(key)!;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      const result = req.result ?? null;
      if (result) sessionCache.set(key, result);
      resolve(result);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function initSessionWithPeer(
  myId: number,
  peerId: number,
  peerIdentityPubHex: string,
  peerSignedPrekeyPubHex: string,
  _peerOneTimePrekeyHex: string | null
): Promise<RatchetSession> {
  const identity = await loadIdentity(myId);
  if (!identity) throw new Error("No identity keys — generate bundle first");

  const peerSignedPrekeyPubRaw = hexToBytes(peerSignedPrekeyPubHex);
  const peerSignedPrekey = await importECDHPublicKey(peerSignedPrekeyPubRaw);

  const ephemeral = await generateECDHKeyPair();
  const x3dh = await x3dhSender(identity.identityKey, peerSignedPrekey, ephemeral.privateKey);
  const state = await initRatchetFromSharedSecret(x3dh.authKey);

  const session: RatchetSession = {
    key: `${myId}-${peerId}`,
    peerId,
    peerIdPubRaw: hexToBytes(peerIdentityPubHex),
    peerSignedPrekeyPubRaw,
    sharedSecret: new Uint8Array(x3dh.sharedSecret.buffer as ArrayBuffer),
    state,
  };

  await storeSession(session);
  return session;
}

export async function getOrCreateSession(
  myId: number,
  peerId: number
): Promise<RatchetSession | null> {
  return loadSession(`${myId}-${peerId}`);
}

export async function encryptMessage(
  session: RatchetSession,
  plaintext: string
): Promise<{ ciphertext: string; iv: string; counter: number }> {
  const { ratchetEncrypt } = await import("./crypto");
  const msgBytes = new TextEncoder().encode(plaintext);
  const { ciphertext, iv, counter } = await ratchetEncrypt(session.state, msgBytes);
  await storeSession(session);
  return {
    ciphertext: bufToHex(ciphertext.buffer as ArrayBuffer),
    iv: bufToHex(iv.buffer as ArrayBuffer),
    counter,
  };
}

export async function decryptMessage(
  session: RatchetSession,
  ciphertextHex: string,
  ivHex: string,
  counter: number
): Promise<string> {
  const { ratchetDecrypt } = await import("./crypto");
  const ciphertext = hexToBytes(ciphertextHex);
  const iv = hexToBytes(ivHex);
  const plaintext = await ratchetDecrypt(session.state, ciphertext, iv, counter);
  await storeSession(session);
  return new TextDecoder().decode(plaintext);
}
