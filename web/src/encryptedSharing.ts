import { exportCanonicalHeritgArchive, importHeritgArchive } from "./heritgArchive";
import type { AppData } from "./types";

export const SHARE_ENVELOPE_VERSION = "HTGSHR01";
export const PASSWORD_SHARE_ENVELOPE_VERSION = "HTGSHR02";
export const MAX_SHARE_ENVELOPE_BYTES = 32 * 1024 * 1024;
const SHARE_MAGIC = new TextEncoder().encode(SHARE_ENVELOPE_VERSION);
const PASSWORD_SHARE_MAGIC = new TextEncoder().encode(PASSWORD_SHARE_ENVELOPE_VERSION);
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_ITERATIONS = 310_000;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GENERATION_PATTERN = /^[1-9][0-9]{0,30}$/;

type Fetch = typeof fetch;

export type SharePhase = "exporting" | "allocating" | "encrypting" | "uploading" | "activating";

export interface CreateShareOptions {
  expiryDays?: number;
  fetchImpl?: Fetch;
  origin?: string;
  onProgress?: (phase: SharePhase) => void;
  signal?: AbortSignal;
  password?: string;
}

export interface CreatedShare {
  shareId: string;
  deletionToken: string;
  url: string;
  expiresAt: string;
}

export interface LoadedShare {
  data: AppData;
  shareId: string;
  expiresAt: string;
}

interface Allocation {
  shareId: string;
  deletionToken: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  shareExpiresAt: string;
}

interface DownloadGrant {
  downloadUrl: string;
  envelopeVersion: string;
  ciphertextBytes: number;
  shareExpiresAt: string;
}

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const base64UrlToBytes = (value: string, expectedBytes: number) => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("This share link has an invalid key.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("This share link has an invalid key.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength !== expectedBytes || bytesToBase64Url(bytes) !== value) {
    throw new Error("This share link has an invalid key.");
  }
  return bytes;
};

const authenticatedData = (shareId: string) => {
  if (!SHARE_ID_PATTERN.test(shareId)) throw new Error("This share link is invalid.");
  const encodedShareId = new TextEncoder().encode(shareId);
  const aad = new Uint8Array(SHARE_MAGIC.byteLength + 1 + encodedShareId.byteLength);
  aad.set(SHARE_MAGIC);
  aad.set(encodedShareId, SHARE_MAGIC.byteLength + 1);
  return aad;
};

const passwordAuthenticatedData = (shareId: string, salt: Uint8Array) => {
  const share = new TextEncoder().encode(shareId);
  const aad = new Uint8Array(PASSWORD_SHARE_MAGIC.byteLength + 1 + share.byteLength + 1 + salt.byteLength);
  aad.set(PASSWORD_SHARE_MAGIC);
  aad.set(share, PASSWORD_SHARE_MAGIC.byteLength + 1);
  aad.set(salt, PASSWORD_SHARE_MAGIC.byteLength + 2 + share.byteLength);
  return aad;
};

const passwordKey = async (password: string, salt: Uint8Array, usage: KeyUsage[]) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt.slice().buffer as ArrayBuffer, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, usage);
};

const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const jsonObject = async (response: Response): Promise<Record<string, unknown>> => {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The sharing service returned an unreadable response. Please try again.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The sharing service returned an unreadable response. Please try again.");
  }
  return value as Record<string, unknown>;
};

const apiPost = async (
  path: string,
  body: Record<string, unknown>,
  fetchImpl: Fetch,
  signal?: AbortSignal,
  retryable = true
): Promise<Record<string, unknown>> => {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = undefined;
    try {
      response = await fetchImpl(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal
      });
    } catch {
      if (signal?.aborted) throw new DOMException("The sharing request was cancelled.", "AbortError");
      if (!retryable || attempt === 2) {
        throw new Error("The sharing service could not be reached. Check your connection and try again.");
      }
    }
    if (response && (!retryable || ![429, 500, 503].includes(response.status) || attempt === 2)) break;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250 * (2 ** attempt) + Math.floor(Math.random() * 150));
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("The sharing request was cancelled.", "AbortError"));
      }, { once: true });
    });
  }
  if (!response) throw new Error("The sharing service could not be reached. Check your connection and try again.");
  if (!response.ok) {
    const value = await jsonObject(response).catch(() => undefined);
    const code = value?.error && typeof value.error === "object"
      ? (value.error as { code?: unknown }).code
      : undefined;
    if (code === "expired") throw new Error("This encrypted share has expired.");
    if (code === "revoked") throw new Error("This encrypted share was revoked.");
    if (code === "not_found") throw new Error("This encrypted share could not be found.");
    if (code === "rate_limited") throw new Error("Too many sharing requests. Please wait and try again.");
    throw new Error("The sharing service could not complete this request. Please try again.");
  }
  return jsonObject(response);
};

const stringField = (value: Record<string, unknown>, field: string) => {
  if (typeof value[field] !== "string") {
    throw new Error("The sharing service returned an unreadable response. Please try again.");
  }
  return value[field] as string;
};

const allocationFrom = (value: Record<string, unknown>): Allocation => {
  const shareId = stringField(value, "shareId");
  const deletionToken = stringField(value, "deletionToken");
  const uploadUrl = stringField(value, "uploadUrl");
  const shareExpiresAt = stringField(value, "shareExpiresAt");
  if (!SHARE_ID_PATTERN.test(shareId) || !TOKEN_PATTERN.test(deletionToken)) {
    throw new Error("The sharing service returned an unreadable response. Please try again.");
  }
  const headers = value.requiredHeaders;
  if (!headers || typeof headers !== "object" || Array.isArray(headers) ||
      Object.values(headers).some((item) => typeof item !== "string")) {
    throw new Error("The sharing service returned an unreadable response. Please try again.");
  }
  return { shareId, deletionToken, uploadUrl, shareExpiresAt, requiredHeaders: headers as Record<string, string> };
};

const encryptArchive = async (archive: Uint8Array, shareId: string, keyBytes: Uint8Array) => {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes.slice().buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonce,
    additionalData: authenticatedData(shareId),
    tagLength: 128
  }, key, archive.slice().buffer as ArrayBuffer));
  const envelope = new Uint8Array(SHARE_MAGIC.byteLength + nonce.byteLength + ciphertext.byteLength);
  envelope.set(SHARE_MAGIC);
  envelope.set(nonce, SHARE_MAGIC.byteLength);
  envelope.set(ciphertext, SHARE_MAGIC.byteLength + nonce.byteLength);
  return envelope;
};

const encryptPasswordArchive = async (archive: Uint8Array, shareId: string, password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: passwordAuthenticatedData(shareId, salt), tagLength: 128 }, key, archive.slice().buffer as ArrayBuffer));
  const envelope = new Uint8Array(PASSWORD_SHARE_MAGIC.byteLength + salt.byteLength + nonce.byteLength + ciphertext.byteLength);
  envelope.set(PASSWORD_SHARE_MAGIC);
  envelope.set(salt, PASSWORD_SHARE_MAGIC.byteLength);
  envelope.set(nonce, PASSWORD_SHARE_MAGIC.byteLength + salt.byteLength);
  envelope.set(ciphertext, PASSWORD_SHARE_MAGIC.byteLength + salt.byteLength + nonce.byteLength);
  return envelope;
};

export async function createEncryptedShare(
  data: AppData,
  treeId: string,
  options: CreateShareOptions = {}
): Promise<CreatedShare> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const expiryDays = options.expiryDays ?? 30;
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90) {
    throw new Error("Choose an expiry between 1 and 90 days.");
  }
  options.onProgress?.("exporting");
  const archive = await exportCanonicalHeritgArchive(data, treeId);
  if (options.password && options.password.length < 10) throw new Error("Use a password with at least 10 characters.");
  const ciphertextBytes = archive.byteLength + (options.password ? 52 : 36);
  if (ciphertextBytes > MAX_SHARE_ENVELOPE_BYTES) {
    throw new Error("This family archive is too large to share. Keep the encrypted share under 32 MiB.");
  }

  options.onProgress?.("allocating");
  const allocation = allocationFrom(await apiPost("/api/v1/share-uploads", {
    envelopeVersion: options.password ? PASSWORD_SHARE_ENVELOPE_VERSION : SHARE_ENVELOPE_VERSION,
    ciphertextBytes,
    expiryDays
  }, fetchImpl, options.signal));

  try {
    const keyBytes = options.password ? undefined : crypto.getRandomValues(new Uint8Array(32));
    options.onProgress?.("encrypting");
    const envelope = options.password
      ? await encryptPasswordArchive(archive, allocation.shareId, options.password)
      : await encryptArchive(archive, allocation.shareId, keyBytes!);
    if (envelope.byteLength !== ciphertextBytes) throw new Error("The encrypted share size changed unexpectedly.");

    options.onProgress?.("uploading");
    let upload: Response;
    try {
      upload = await fetchImpl(allocation.uploadUrl, {
        method: "PUT",
        body: envelope.slice().buffer as ArrayBuffer,
        headers: allocation.requiredHeaders,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: options.signal
      });
    } catch {
      if (options.signal?.aborted) throw new DOMException("The sharing request was cancelled.", "AbortError");
      throw new Error("The encrypted upload was interrupted. Please create a new link.");
    }
    if (!upload.ok) throw new Error("The encrypted upload was rejected. Please create a new link.");
    const objectGeneration = upload.headers.get("x-goog-generation");
    if (!objectGeneration || !GENERATION_PATTERN.test(objectGeneration)) {
      throw new Error("The upload could not be verified. Please create a new link.");
    }

    options.onProgress?.("activating");
    await apiPost("/api/v1/share-uploads/complete", {
      shareId: allocation.shareId,
      deletionToken: allocation.deletionToken,
      objectGeneration
    }, fetchImpl, options.signal, false);

    const origin = options.origin ?? window.location.origin;
    const key = keyBytes ? bytesToBase64Url(keyBytes) : "p=1";
    return {
      shareId: allocation.shareId,
      deletionToken: allocation.deletionToken,
      url: options.password ? `${origin}/s/${allocation.shareId}#${key}` : `${origin}/s/${allocation.shareId}#k=${key}`,
      expiresAt: allocation.shareExpiresAt
    };
  } catch (error) {
    await revokeEncryptedShare(allocation.shareId, allocation.deletionToken, fetchImpl).catch(() => undefined);
    throw error;
  }
}

export function parseEncryptedShareLocation(pathname: string, hash: string, password?: string) {
  const match = /^\/s\/([A-Za-z0-9_-]{22})\/?$/u.exec(pathname);
  if (!match) return undefined;
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const key = parameters.get("k");
  if (parameters.get("p") === "1" && parameters.size === 1) {
    if (!password) throw new Error("This link is password protected.");
    return { shareId: match[1], password };
  }
  if (!key || parameters.size !== 1) throw new Error("This share link is missing its encryption key.");
  return { shareId: match[1], keyBytes: base64UrlToBytes(key, 32) };
}

export async function loadEncryptedShare(
  pathname = window.location.pathname,
  hash = window.location.hash,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
  password?: string
): Promise<LoadedShare> {
  const parsed = parseEncryptedShareLocation(pathname, hash, password);
  if (!parsed) throw new Error("This share link is invalid.");
  const grantValue = await apiPost("/api/v1/share-downloads", { shareId: parsed.shareId }, fetchImpl, signal);
  const grant: DownloadGrant = {
    downloadUrl: stringField(grantValue, "downloadUrl"),
    envelopeVersion: stringField(grantValue, "envelopeVersion"),
    ciphertextBytes: grantValue.ciphertextBytes as number,
    shareExpiresAt: stringField(grantValue, "shareExpiresAt")
  };
  if (![SHARE_ENVELOPE_VERSION, PASSWORD_SHARE_ENVELOPE_VERSION].includes(grant.envelopeVersion) ||
      !Number.isSafeInteger(grant.ciphertextBytes) || grant.ciphertextBytes < 36 ||
      grant.ciphertextBytes > MAX_SHARE_ENVELOPE_BYTES) {
    throw new Error("The sharing service returned invalid envelope information.");
  }

  let response: Response;
  try {
    response = await fetchImpl(grant.downloadUrl, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal
    });
  } catch {
    throw new Error("The encrypted family archive could not be downloaded. Check your connection and try again.");
  }
  if (!response.ok) throw new Error("The encrypted family archive could not be downloaded. Try opening the link again.");
  const envelope = new Uint8Array(await response.arrayBuffer());
  if (envelope.byteLength !== grant.ciphertextBytes || envelope.byteLength > MAX_SHARE_ENVELOPE_BYTES ||
      !sameBytes(envelope.slice(0, 8), grant.envelopeVersion === PASSWORD_SHARE_ENVELOPE_VERSION ? PASSWORD_SHARE_MAGIC : SHARE_MAGIC)) {
    throw new Error("The encrypted family archive is incomplete or unsupported.");
  }

  const passwordEnvelope = grant.envelopeVersion === PASSWORD_SHARE_ENVELOPE_VERSION;
  if (passwordEnvelope && !parsed.password) throw new Error("This link is password protected.");
  const salt = passwordEnvelope ? envelope.slice(8, 8 + PASSWORD_SALT_BYTES) : undefined;
  const nonceOffset = passwordEnvelope ? 8 + PASSWORD_SALT_BYTES : 8;
  const nonce = envelope.slice(nonceOffset, nonceOffset + 12);
  const ciphertext = envelope.slice(nonceOffset + 12);
  let archive: Uint8Array;
  try {
    const key = passwordEnvelope
      ? await passwordKey(parsed.password!, salt!, ["decrypt"])
      : await crypto.subtle.importKey("raw", parsed.keyBytes!.slice().buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
    archive = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: passwordEnvelope ? passwordAuthenticatedData(parsed.shareId, salt!) : authenticatedData(parsed.shareId),
      tagLength: 128
    }, key, ciphertext.slice().buffer as ArrayBuffer));
  } catch {
    throw new Error("This link has the wrong key, or its encrypted archive was modified.");
  }
  return {
    data: await importHeritgArchive(archive),
    shareId: parsed.shareId,
    expiresAt: grant.shareExpiresAt
  };
}

export async function revokeEncryptedShare(
  shareId: string,
  deletionToken: string,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal
) {
  if (!SHARE_ID_PATTERN.test(shareId) || !TOKEN_PATTERN.test(deletionToken)) {
    throw new Error("This share cannot be revoked from this browser session.");
  }
  await apiPost("/api/v1/share-revocations", { shareId, deletionToken }, fetchImpl, signal);
}

export const encryptedShareTestHelpers = { authenticatedData, base64UrlToBytes, bytesToBase64Url, encryptArchive, encryptPasswordArchive };
