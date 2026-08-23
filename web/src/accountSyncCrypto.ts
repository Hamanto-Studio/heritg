import { MAX_SYNC_ENVELOPE_BYTES, SYNC_ENVELOPE_VERSION } from "./accountSync";

const MARKER = new TextEncoder().encode(SYNC_ENVELOPE_VERSION);
const AAD_CONTEXT = "heritg:sync:v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
export const MAX_SYNC_PLAINTEXT_BYTES = MAX_SYNC_ENVELOPE_BYTES - MARKER.byteLength - IV_BYTES - TAG_BYTES;

const cryptoBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};

const validateBinding = (treeId: string, revision: number): void => {
  if (!ID_PATTERN.test(treeId) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Invalid sync snapshot binding.");
  }
};

const aad = (treeId: string, revision: number): Uint8Array => {
  validateBinding(treeId, revision);
  return new TextEncoder().encode(`${AAD_CONTEXT}\0${treeId}\0${String(revision)}`);
};

const decodeSyncKey = (value: string): Uint8Array => {
  if (!KEY_PATTERN.test(value)) throw new Error("Invalid sync encryption key.");
  try {
    const standard = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=";
    const binary = atob(standard);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength !== 32) throw new Error();
    return bytes;
  } catch {
    throw new Error("Invalid sync encryption key.");
  }
};

const importSyncKey = (value: string): Promise<CryptoKey> => crypto.subtle.importKey(
  "raw",
  cryptoBytes(decodeSyncKey(value)),
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"]
);

export async function encryptSyncSnapshot(
  plaintext: Uint8Array,
  syncKey: string,
  treeId: string,
  revision: number
): Promise<Uint8Array> {
  if (!ArrayBuffer.isView(plaintext) || plaintext.BYTES_PER_ELEMENT !== 1 || plaintext.byteLength > MAX_SYNC_PLAINTEXT_BYTES) {
    throw new Error("Sync snapshot plaintext is too large.");
  }
  const iv = cryptoBytes(crypto.getRandomValues(new Uint8Array(IV_BYTES)));
  const ciphertext = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: cryptoBytes(aad(treeId, revision)),
    tagLength: TAG_BYTES * 8
  }, await importSyncKey(syncKey), cryptoBytes(plaintext));
  const envelope = new Uint8Array(MARKER.byteLength + IV_BYTES + ciphertext.byteLength);
  envelope.set(MARKER);
  envelope.set(iv, MARKER.byteLength);
  envelope.set(new Uint8Array(ciphertext), MARKER.byteLength + IV_BYTES);
  return envelope;
}

export async function decryptSyncSnapshot(
  envelope: Uint8Array,
  syncKey: string,
  treeId: string,
  revision: number
): Promise<Uint8Array> {
  validateBinding(treeId, revision);
  decodeSyncKey(syncKey);
  if (!ArrayBuffer.isView(envelope) || envelope.BYTES_PER_ELEMENT !== 1 ||
    envelope.byteLength < MARKER.byteLength + IV_BYTES + TAG_BYTES ||
    envelope.byteLength > MAX_SYNC_ENVELOPE_BYTES || MARKER.some((byte, index) => envelope[index] !== byte)) {
    throw new Error("Invalid sync snapshot envelope.");
  }
  const iv = cryptoBytes(envelope.slice(MARKER.byteLength, MARKER.byteLength + IV_BYTES));
  const ciphertext = cryptoBytes(envelope.slice(MARKER.byteLength + IV_BYTES));
  try {
    const plaintext = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv,
      additionalData: cryptoBytes(aad(treeId, revision)),
      tagLength: TAG_BYTES * 8
    }, await importSyncKey(syncKey), ciphertext);
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Sync snapshot authentication failed.");
  }
}
