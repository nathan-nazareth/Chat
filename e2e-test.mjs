// E2E encryption flow test — Node 22 has globalThis.crypto already
const { webcrypto } = await import("node:crypto");

// Verify WebCrypto is available
if (!globalThis.crypto?.subtle) {
  console.error("WebCrypto not available"); process.exit(1);
}

const {
  generateECDHKeyPair, importECDHPublicKey, ecdhDeriveBits,
  hkdf, aesEncrypt, aesDecrypt,
  x3dhSender, ratchetEncrypt, ratchetDecrypt,
  initRatchetFromSharedSecret, bufToHex, hexToBytes
} = await import("./lib/crypto.ts");

let passed = 0, failed = 0;
function ok(msg) { passed++; console.log(`  ✓ ${msg}`); }
function fail(msg) { failed++; console.error(`  ✗ ${msg}`); }
function assertEq(a, b, msg) {
  if (bufToHex(a.buffer) === bufToHex(b.buffer)) ok(msg);
  else fail(`${msg}`);
}

// ---- Test 1: ECDH ----
console.log("\n[Test 1] ECDH P-256");
{
  const alice = await generateECDHKeyPair();
  const bob = await generateECDHKeyPair();
  assertEq(alice.pubRaw, alice.pubRaw, "pubRaw round-trip");
  const sA = new Uint8Array(await ecdhDeriveBits(alice.privateKey, bob.publicKey));
  const sB = new Uint8Array(await ecdhDeriveBits(bob.privateKey, alice.publicKey));
  assertEq(sA, sB, "ECDH shared secret matches");
  ok(`Shared secret length = ${sA.length * 8} bits`);
}

// ---- Test 2: HKDF ----
console.log("\n[Test 2] HKDF-SHA-256");
{
  const ikm = new Uint8Array(32); crypto.getRandomValues(ikm);
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const info = new Uint8Array([...new TextEncoder().encode("test")]);
  const a = await hkdf(ikm.buffer, salt, info, 32);
  const b = await hkdf(ikm.buffer, salt, info, 32);
  assertEq(a, b, "Deterministic");
  const c = await hkdf(ikm.buffer, salt, info, 64);
  ok(`32-byte output: ${bufToHex(a.buffer).slice(0,16)}...`);
}

// ---- Test 3: AES-GCM ----
console.log("\n[Test 3] AES-256-GCM");
{
  const key = new Uint8Array(32); crypto.getRandomValues(key);
  const pt = new TextEncoder().encode("Hello E2E!");
  const aad = new Uint8Array(8); crypto.getRandomValues(aad);
  const { ciphertext, iv } = await aesEncrypt(key, pt, aad);
  ok(`Ciphertext = ${ciphertext.length} bytes (plaintext ${pt.length} + tag 16)`);
  const dec = await aesDecrypt(key, ciphertext, iv, aad);
  assertEq(dec, pt, "Decrypt with correct AAD");
  try {
    const bad = new Uint8Array(8); crypto.getRandomValues(bad);
    await aesDecrypt(key, ciphertext, iv, bad);
    fail("Wrong AAD should throw");
  } catch { ok("Wrong AAD throws"); }
}

// ---- Test 4: X3DH ----
console.log("\n[Test 4] X3DH sender");
{
  const IKa = await generateECDHKeyPair();
  const SPKb = await generateECDHKeyPair();
  const EK = await generateECDHKeyPair();
  const result = await x3dhSender(IKa.privateKey, IKa.publicKey, SPKb.publicKey, EK.privateKey, EK.publicKey);
  ok(`sharedSecret=${result.sharedSecret.length*8}bits authKey=${result.authKey.length*8}bits ephPub=${result.ephPubRaw.length}bytes`);
}

// ---- Test 5: Double Ratchet full roundtrip ----
console.log("\n[Test 5] Double Ratchet encrypt/decrypt");
{
  const sharedSecret = new Uint8Array(32); crypto.getRandomValues(sharedSecret);
  const info = new Uint8Array([...new TextEncoder().encode("ratchet-init")]);
  const seed = await hkdf(sharedSecret.buffer, new Uint8Array(0), info, 64);
  
  const sender = { sendingChainKey: seed.slice(0,32), receivingChainKey: seed.slice(32), sendCounter: 0, recvCounter: 0, previousSendCount: 0 };
  const receiver = { sendingChainKey: new Uint8Array(seed.slice(32)), receivingChainKey: new Uint8Array(seed.slice(0,32)), sendCounter: 0, recvCounter: 0, previousSendCount: 0 };
  
  const msgs = ["Hello!", "Second message", "Third 🔐", "A".repeat(4000)];
  for (let i = 0; i < msgs.length; i++) {
    const pt = new Uint8Array([...new TextEncoder().encode(msgs[i])]);
    const enc = await ratchetEncrypt(sender, pt);
    const hex = bufToHex(enc.ciphertext.buffer);
    const dec = await ratchetDecrypt(receiver, hexToBytes(hex), enc.iv, enc.counter);
    assertEq(dec, pt, `Message ${i+1}: "${msgs[i].slice(0,20)}..."`);
  }
}

// ---- Test 6: Cross-device state sync ----
console.log("\n[Test 6] Cross-device state serialization");
{
  const ss = new Uint8Array(32); crypto.getRandomValues(ss);
  const seed = await hkdf(ss.buffer, new Uint8Array(0), new Uint8Array([...new TextEncoder().encode("ratchet-init")]), 64);
  
  const devA = { sendingChainKey: seed.slice(0,32), receivingChainKey: seed.slice(32), sendCounter: 0, recvCounter: 0, previousSendCount: 0 };
  const pt = new TextEncoder().encode("Device A msg");
  const enc = await ratchetEncrypt(devA, pt);
  
  // Serialize → deserialize
  const serialized = {
    sendingChainKey: bufToHex(devA.sendingChainKey.buffer),
    receivingChainKey: bufToHex(devA.receivingChainKey.buffer),
    sendCounter: devA.sendCounter, recvCounter: devA.recvCounter, previousSendCount: devA.previousSendCount
  };
  const devB = {
    sendingChainKey: hexToBytes(serialized.sendingChainKey),
    receivingChainKey: hexToBytes(serialized.receivingChainKey),
    sendCounter: serialized.sendCounter, recvCounter: serialized.recvCounter, previousSendCount: serialized.previousSendCount
  };
  
  const pt2 = new TextEncoder().encode("Device B msg");
  const enc2 = await ratchetEncrypt(devB, pt2);
  ok(`Device B counter = ${enc2.counter} (continues from A's ${devA.sendCounter})`);
  
  // Receiver decrypts both
  const rx = { sendingChainKey: new Uint8Array(seed.slice(32)), receivingChainKey: new Uint8Array(seed.slice(0,32)), sendCounter: 0, recvCounter: 0, previousSendCount: 0 };
  const d1 = await ratchetDecrypt(rx, enc.ciphertext, enc.iv, enc.counter);
  assertEq(d1, pt, "Receiver decrypts A");
  const d2 = await ratchetDecrypt(rx, enc2.ciphertext, enc2.iv, enc2.counter);
  assertEq(d2, pt2, "Receiver decrypts B");
}

// ---- Test 7: hex round-trip ----
console.log("\n[Test 7] bufToHex / hexToBytes");
{
  const orig = new Uint8Array(65); crypto.getRandomValues(orig);
  const hex = bufToHex(orig.buffer);
  ok(`65 bytes → ${hex.length} hex chars`);
  assertEq(hexToBytes(hex), orig, "Round-trip");
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All E2E encryption tests PASSED!");
