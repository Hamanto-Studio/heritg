import { exportCanonicalHeritgArchive, importHeritgArchive } from "./heritgArchive";
import type { AppData } from "./types";

export const SHARE_ENVELOPE_VERSION = "HTGSHR01";
export const MAX_SHARE_ENVELOPE_BYTES = 32 * 1024 * 1024;
const SHARE_MAGIC = new TextEncoder().encode(SHARE_ENVELOPE_VERSION);
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
  const ciphertextBytes = archive.byteLength + 36;
  if (ciphertextBytes > MAX_SHARE_ENVELOPE_BYTES) {
    throw new Error("This family archive is too large to share. Keep the encrypted share under 32 MiB.");
  }

  options.onProgress?.("allocating");
  const allocation = allocationFrom(await apiPost("/api/v1/share-uploads", {
    envelopeVersion: SHARE_ENVELOPE_VERSION,
    ciphertextBytes,
    expiryDays
  }, fetchImpl, options.signal));

  try {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    options.onProgress?.("encrypting");
    const envelope = await encryptArchive(archive, allocation.shareId, keyBytes);
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
    const key = bytesToBase64Url(keyBytes);
    return {
      shareId: allocation.shareId,
      deletionToken: allocation.deletionToken,
      url: `${origin}/s/${allocation.shareId}#k=${key}`,
      expiresAt: allocation.shareExpiresAt
    };
  } catch (error) {
    await revokeEncryptedShare(allocation.shareId, allocation.deletionToken, fetchImpl).catch(() => undefined);
    throw error;
  }
}

export function parseEncryptedShareLocation(pathname: string, hash: string) {
  const match = /^\/s\/([A-Za-z0-9_-]{22})\/?$/u.exec(pathname);
  if (!match) return undefined;
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const key = parameters.get("k");
  if (!key || parameters.size !== 1) throw new Error("This share link is missing its encryption key.");
  return { shareId: match[1], keyBytes: base64UrlToBytes(key, 32) };
}

export async function loadEncryptedShare(
  pathname = window.location.pathname,
  hash = window.location.hash,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal
): Promise<LoadedShare> {
  const parsed = parseEncryptedShareLocation(pathname, hash);
  if (!parsed) throw new Error("This share link is invalid.");
  const grantValue = await apiPost("/api/v1/share-downloads", { shareId: parsed.shareId }, fetchImpl, signal);
  const grant: DownloadGrant = {
    downloadUrl: stringField(grantValue, "downloadUrl"),
    envelopeVersion: stringField(grantValue, "envelopeVersion"),
    ciphertextBytes: grantValue.ciphertextBytes as number,
    shareExpiresAt: stringField(grantValue, "shareExpiresAt")
  };
  if (grant.envelopeVersion !== SHARE_ENVELOPE_VERSION ||
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
      !sameBytes(envelope.slice(0, SHARE_MAGIC.byteLength), SHARE_MAGIC)) {
    throw new Error("The encrypted family archive is incomplete or unsupported.");
  }

  const nonce = envelope.slice(SHARE_MAGIC.byteLength, SHARE_MAGIC.byteLength + 12);
  const ciphertext = envelope.slice(SHARE_MAGIC.byteLength + 12);
  let archive: Uint8Array;
  try {
    const key = await crypto.subtle.importKey("raw", parsed.keyBytes.slice().buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
    archive = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: authenticatedData(parsed.shareId),
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

export const encryptedShareTestHelpers = { authenticatedData, base64UrlToBytes, bytesToBase64Url, encryptArchive };
