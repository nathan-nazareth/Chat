// E2E encryption primitives — X3DH-lite + Double Ratchet over WebCrypto.

const subtle: SubtleCrypto = globalThis.crypto.subtle;

function toBuf(x: Uint8Array): ArrayBuffer {
  return x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// ECDH P-256
// ---------------------------------------------------------------------------

export type ECDHKeyPair = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  pubRaw: Uint8Array;
};

export async function generateECDHKeyPair(): Promise<ECDHKeyPair> {
  const kp = (await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubRaw };
}

export async function importECDHPublicKey(pubRaw: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    toBuf(pubRaw),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

export async function ecdhDeriveBits(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<ArrayBuffer> {
  return subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
}

// ---------------------------------------------------------------------------
// HKDF
// ---------------------------------------------------------------------------

export async function hkdf(
  ikm: ArrayBuffer,
  salt: Uint8Array,
  info: Uint8Array,
  len: number
): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const derived = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toBuf(salt), info: toBuf(info) } as any,
    key,
    len * 8
  );
  return new Uint8Array(derived);
}

// ---------------------------------------------------------------------------
// AES-GCM
// ---------------------------------------------------------------------------

export async function aesEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const key = await subtle.importKey("raw", toBuf(keyBytes), "AES-GCM", false, ["encrypt"]);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: aad ? toBuf(aad) : undefined, tagLength: 128 } as any,
    key,
    toBuf(plaintext)
  );
  return { ciphertext: new Uint8Array(ct), iv };
}

export async function aesDecrypt(
  keyBytes: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", toBuf(keyBytes), "AES-GCM", false, ["decrypt"]);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: aad ? toBuf(aad) : undefined, tagLength: 128 } as any,
    key,
    toBuf(ciphertext)
  );
  return new Uint8Array(pt);
}

// ---------------------------------------------------------------------------
// X3DH-lite
// ---------------------------------------------------------------------------

export type X3DHResult = {
  sharedSecret: Uint8Array;
  authKey: Uint8Array;
};

export async function x3dhSender(
  IKa: CryptoKey,
  SPKb: CryptoKey,
  EK: CryptoKey
): Promise<X3DHResult & { ephPubRaw: Uint8Array }> {
  const IKaRaw = new Uint8Array(await subtle.exportKey("raw", IKa));
  const [dh1, dh2, dh3] = await Promise.all([
    ecdhDeriveBits(IKa, SPKb),
    ecdhDeriveBits(EK, await importECDHPublicKey(IKaRaw)),
    ecdhDeriveBits(EK, SPKb),
  ]);

  const masterSecret = concat([new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3)]);
  const info = new Uint8Array([...new TextEncoder().encode("x3dh-auth")]);
  const authKey = await hkdf(masterSecret.buffer as ArrayBuffer, new Uint8Array(0), info, 32);
  const ephPubRaw = new Uint8Array(await subtle.exportKey("raw", EK));

  return { sharedSecret: masterSecret, authKey, ephPubRaw };
}

export async function x3dhReceiver(
  IKb: CryptoKey,
  SPKb: CryptoKey,
  IKaRaw: Uint8Array,
  EKaRaw: Uint8Array
): Promise<X3DHResult> {
  const IKa = await importECDHPublicKey(IKaRaw);
  const EK = await importECDHPublicKey(EKaRaw);

  const [dh1, dh2, dh3] = await Promise.all([
    ecdhDeriveBits(SPKb, IKa),
    ecdhDeriveBits(IKb, EK),
    ecdhDeriveBits(SPKb, EK),
  ]);

  const masterSecret = concat([new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3)]);
  const info = new Uint8Array([...new TextEncoder().encode("x3dh-auth")]);
  const authKey = await hkdf(masterSecret.buffer as ArrayBuffer, new Uint8Array(0), info, 32);

  return { sharedSecret: masterSecret, authKey };
}

// ---------------------------------------------------------------------------
// Double Ratchet
// ---------------------------------------------------------------------------

export type RatchetState = {
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendCounter: number;
  recvCounter: number;
  previousSendCount: number;
};

export async function deriveMessageKey(
  chainKey: Uint8Array
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  const info = new Uint8Array([...new TextEncoder().encode("msg-key")]);
  const messageKey = await hkdf(chainKey.buffer as ArrayBuffer, new Uint8Array(0), info, 32);
  const info2 = new Uint8Array([...new TextEncoder().encode("chain-key")]);
  const nextChainKey = await hkdf(chainKey.buffer as ArrayBuffer, new Uint8Array(0), info2, 32);
  return { messageKey, nextChainKey };
}

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; counter: number; previousSendCount: number }> {
  const { messageKey, nextChainKey } = await deriveMessageKey(state.sendingChainKey);
  state.sendingChainKey = nextChainKey;
  state.previousSendCount = state.sendCounter;
  state.sendCounter++;

  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(state.previousSendCount));
  const fullAad = aad ? concat([aad, counterBytes]) : counterBytes;

  const { ciphertext, iv } = await aesEncrypt(messageKey, plaintext, fullAad);
  return { ciphertext, iv, counter: state.previousSendCount, previousSendCount: state.previousSendCount };
}

export async function ratchetDecrypt(
  state: RatchetState,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  counter: number,
  aad?: Uint8Array
): Promise<Uint8Array> {
  while (state.recvCounter < counter) {
    const { nextChainKey } = await deriveMessageKey(state.receivingChainKey);
    state.receivingChainKey = nextChainKey;
    state.recvCounter++;
  }

  const { messageKey, nextChainKey } = await deriveMessageKey(state.receivingChainKey);
  state.receivingChainKey = nextChainKey;
  state.recvCounter++;

  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter));
  const fullAad = aad ? concat([aad, counterBytes]) : counterBytes;

  return aesDecrypt(messageKey, ciphertext, iv, fullAad);
}

export async function initRatchetFromSharedSecret(
  sharedSecret: Uint8Array
): Promise<RatchetState> {
  const info = new Uint8Array([...new TextEncoder().encode("ratchet-init")]);
  const seed = await hkdf(sharedSecret.buffer as ArrayBuffer, new Uint8Array(0), info, 64);
  return {
    sendingChainKey: seed.slice(0, 32),
    receivingChainKey: seed.slice(32),
    sendCounter: 0,
    recvCounter: 0,
    previousSendCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function concat(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

export function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
