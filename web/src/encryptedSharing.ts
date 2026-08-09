import {
  exportCanonicalHeritgArchive,
  importHeritgArchive,
  sharedViewFor,
  type SharedViewPolicy
} from "./heritgArchive";
import {
  DEFAULT_EXPORT_PRIVACY_SELECTION,
  prepareDataForExport,
  type ExportPrivacySelection
} from "./exportPrivacy";
import type { AppData } from "./types";

export const SHARE_ENVELOPE_VERSION = "HTGSHR02";
export const MAX_SHARE_ENVELOPE_BYTES = 32 * 1024 * 1024;
export const SHARE_PASSWORD_MIN_LENGTH = 8;
const SHARE_PASSWORD_ITERATIONS = 600_000;
const SHARE_PASSWORD_SALT_BYTES = 16;
const SHARE_NONCE_BYTES = 12;
const SHARE_TAG_BYTES = 16;
const SHARE_MAGIC = new TextEncoder().encode(SHARE_ENVELOPE_VERSION);
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GENERATION_PATTERN = /^[1-9][0-9]{0,30}$/;

type Fetch = typeof fetch;

export type SharePhase = "exporting" | "allocating" | "encrypting" | "uploading" | "activating";
export type ShareDataSelection = ExportPrivacySelection;
export const DEFAULT_SHARE_DATA_SELECTION = DEFAULT_EXPORT_PRIVACY_SELECTION;

export class SharePasswordRequiredError extends Error {
  constructor() {
    super("This share requires a password.");
    this.name = "SharePasswordRequiredError";
  }
}

export class ShareDecryptionError extends Error {
  constructor() {
    super("This link has the wrong password or its encrypted archive was modified.");
    this.name = "ShareDecryptionError";
  }
}

export interface CreateShareOptions {
  password: string;
  expiryDays?: number;
  fetchImpl?: Fetch;
  origin?: string;
  onProgress?: (phase: SharePhase) => void;
  signal?: AbortSignal;
  selection?: ShareDataSelection;
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
  sharedView?: SharedViewPolicy;
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

const authenticatedPasswordData = (shareId: string) => {
  if (!SHARE_ID_PATTERN.test(shareId)) throw new Error("This share link is invalid.");
  const encodedShareId = new TextEncoder().encode(shareId);
  const aad = new Uint8Array(SHARE_MAGIC.byteLength + 1 + encodedShareId.byteLength);
  aad.set(SHARE_MAGIC);
  aad.set(encodedShareId, SHARE_MAGIC.byteLength + 1);
  return aad;
};

const deriveShareKey = async (password: string, salt: Uint8Array, usage: KeyUsage) => {
  const passwordBytes = new TextEncoder().encode(password.normalize("NFC"));
  try {
    const material = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: salt.slice().buffer as ArrayBuffer, iterations: SHARE_PASSWORD_ITERATIONS },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      [usage]
    );
  } finally {
    passwordBytes.fill(0);
  }
};

export const sharePasswordMeetsRequirements = (password: string) => {
  const normalized = password.normalize("NFC");
  return [...normalized].length >= SHARE_PASSWORD_MIN_LENGTH &&
    /\p{Lu}/u.test(normalized) && /\p{Ll}/u.test(normalized) && /\p{Nd}/u.test(normalized);
};

export const sharePasswordIsReady = (password: string, confirmation: string) =>
  password === confirmation && sharePasswordMeetsRequirements(password);

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

const encryptArchive = async (archive: Uint8Array, shareId: string, password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(SHARE_PASSWORD_SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(SHARE_NONCE_BYTES));
  const key = await deriveShareKey(password, salt, "encrypt");
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonce,
    additionalData: authenticatedPasswordData(shareId),
    tagLength: 128
  }, key, archive.slice().buffer as ArrayBuffer));
  const envelope = new Uint8Array(SHARE_MAGIC.byteLength + salt.byteLength + nonce.byteLength + ciphertext.byteLength);
  envelope.set(SHARE_MAGIC);
  envelope.set(salt, SHARE_MAGIC.byteLength);
  envelope.set(nonce, SHARE_MAGIC.byteLength + salt.byteLength);
  envelope.set(ciphertext, SHARE_MAGIC.byteLength + salt.byteLength + nonce.byteLength);
  return envelope;
};

export const prepareEncryptedShareData = (
  data: AppData,
  treeId: string,
  selection: ShareDataSelection = DEFAULT_SHARE_DATA_SELECTION,
  now = new Date()
): { data: AppData; sharedView: SharedViewPolicy } => {
  const prepared = prepareDataForExport(data, treeId, selection, now);
  return {
    data: prepared.data,
    sharedView: { ...selection, ageByPersonId: prepared.ageByPersonId }
  };
};

export async function createEncryptedShare(
  data: AppData,
  treeId: string,
  options: CreateShareOptions
): Promise<CreatedShare> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const password = options.password;
  if (!sharePasswordMeetsRequirements(password)) {
    throw new Error(`Use a share password with at least ${SHARE_PASSWORD_MIN_LENGTH} characters, including uppercase, lowercase, and a number.`);
  }
  const expiryDays = options.expiryDays ?? 30;
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90) {
    throw new Error("Choose an expiry between 1 and 90 days.");
  }
  options.onProgress?.("exporting");
  const prepared = prepareEncryptedShareData(
    data,
    treeId,
    options.selection ?? DEFAULT_SHARE_DATA_SELECTION
  );
  const archive = await exportCanonicalHeritgArchive(
    prepared.data,
    treeId,
    new Date(),
    { sharedView: prepared.sharedView }
  );
  const ciphertextBytes = archive.byteLength + SHARE_MAGIC.byteLength + SHARE_PASSWORD_SALT_BYTES + SHARE_NONCE_BYTES + SHARE_TAG_BYTES;
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
    options.onProgress?.("encrypting");
    const envelope = await encryptArchive(archive, allocation.shareId, password);
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
    return {
      shareId: allocation.shareId,
      deletionToken: allocation.deletionToken,
      url: `${origin}/s/${allocation.shareId}`,
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
  if (hash.replace(/^#/u, "")) throw new Error("This share link has an unsupported legacy key.");
  return { shareId: match[1] };
}

export async function loadEncryptedShare(
  pathname = window.location.pathname,
  hash = window.location.hash,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
  password?: string
): Promise<LoadedShare> {
  const parsed = parseEncryptedShareLocation(pathname, hash);
  if (!parsed) throw new Error("This share link is invalid.");
  if (!password) throw new SharePasswordRequiredError();

  const grantValue = await apiPost("/api/v1/share-downloads", { shareId: parsed.shareId }, fetchImpl, signal);
  const grant: DownloadGrant = {
    downloadUrl: stringField(grantValue, "downloadUrl"),
    envelopeVersion: stringField(grantValue, "envelopeVersion"),
    ciphertextBytes: grantValue.ciphertextBytes as number,
    shareExpiresAt: stringField(grantValue, "shareExpiresAt")
  };
  if (grant.envelopeVersion !== SHARE_ENVELOPE_VERSION ||
      !Number.isSafeInteger(grant.ciphertextBytes) ||
      grant.ciphertextBytes < SHARE_MAGIC.byteLength + SHARE_PASSWORD_SALT_BYTES + SHARE_NONCE_BYTES + SHARE_TAG_BYTES ||
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

  const salt = envelope.slice(SHARE_MAGIC.byteLength, SHARE_MAGIC.byteLength + SHARE_PASSWORD_SALT_BYTES);
  const nonceStart = SHARE_MAGIC.byteLength + SHARE_PASSWORD_SALT_BYTES;
  const nonce = envelope.slice(nonceStart, nonceStart + SHARE_NONCE_BYTES);
  const ciphertext = envelope.slice(nonceStart + SHARE_NONCE_BYTES);
  let archive: Uint8Array;
  try {
    const key = await deriveShareKey(password, salt, "decrypt");
    archive = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: authenticatedPasswordData(parsed.shareId),
      tagLength: 128
    }, key, ciphertext.slice().buffer as ArrayBuffer));
  } catch {
    throw new ShareDecryptionError();
  }
  const data = await importHeritgArchive(archive);
  return {
    data,
    shareId: parsed.shareId,
    expiresAt: grant.shareExpiresAt,
    sharedView: sharedViewFor(data)
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

export const encryptedShareTestHelpers = { encryptArchive };
