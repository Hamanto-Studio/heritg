export const SYNC_ENVELOPE_VERSION = "HTGSYN01" as const;
export const SYNC_CONTENT_TYPE = "application/vnd.heritg.sync" as const;
export const MAX_SYNC_ENVELOPE_BYTES = 32 * 1024 * 1024;

const API_BASE = "/api/v1/trees";
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CSRF_PATTERN = KEY_PATTERN;
const GENERATION_PATTERN = /^[1-9][0-9]{0,30}$/u;
const ERROR_CODES = new Set([
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "revision_conflict",
  "session_changed",
  "invalid_state",
  "upload_mismatch",
  "expired",
  "rate_limited",
  "service_unavailable"
]);

export interface AccountSyncTree {
  treeId: string;
  role: "owner";
  status: "active" | "deleted";
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreatedAccountSyncTree extends AccountSyncTree {
  syncKey: string;
}

export interface SnapshotAllocation {
  uploadId: string;
  targetRevision: number;
  uploadMethod: "POST";
  uploadUrl: string;
  formFields: Record<string, string>;
  uploadExpiresAt: string;
}

export interface SnapshotMetadata {
  revision: number;
  envelopeVersion: typeof SYNC_ENVELOPE_VERSION;
  ciphertextBytes: number;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export class AccountSyncError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly currentRevision?: number,
    readonly retryAfterSeconds?: number
  ) {
    super("Account sync request failed");
    this.name = "AccountSyncError";
  }
}

type JsonObject = Record<string, unknown>;

const exactObject = (value: unknown, keys: readonly string[]): value is JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const validRevision = (value: unknown, allowZero = true): value is number =>
  Number.isSafeInteger(value) && (value as number) >= (allowZero ? 0 : 1);

const validInstant = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const validSignedUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const invalidResponse = (): never => {
  throw new AccountSyncError(502, "invalid_response");
};

const parseTree = (value: unknown): AccountSyncTree => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidResponse();
  const candidate = value as JsonObject;
  const status = candidate.status;
  const keys = status === "deleted"
    ? ["treeId", "role", "status", "revision", "createdAt", "updatedAt", "deletedAt"]
    : ["treeId", "role", "status", "revision", "createdAt", "updatedAt"];
  if (!exactObject(value, keys) || typeof candidate.treeId !== "string" || !ID_PATTERN.test(candidate.treeId) ||
    candidate.role !== "owner" || (status !== "active" && status !== "deleted") ||
    !validRevision(candidate.revision) || !validInstant(candidate.createdAt) || !validInstant(candidate.updatedAt) ||
    (status === "deleted" && !validInstant(candidate.deletedAt))) return invalidResponse();
  return candidate as unknown as AccountSyncTree;
};

const parseCreatedTree = (value: unknown): CreatedAccountSyncTree => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidResponse();
  const candidate = value as JsonObject;
  if (!exactObject(value, ["treeId", "role", "status", "revision", "createdAt", "updatedAt", "syncKey"]) ||
    candidate.status !== "active" || candidate.revision !== 0 || typeof candidate.syncKey !== "string" ||
    !KEY_PATTERN.test(candidate.syncKey)) return invalidResponse();
  const tree = parseTree(Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "syncKey")));
  return { ...tree, syncKey: candidate.syncKey };
};

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  if (/^\d+$/u.test(value)) return Number(value);
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)) : undefined;
};

const parseError = (response: Response, value: unknown): AccountSyncError => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return new AccountSyncError(response.status, "service_unavailable");
  }
  const wrapper = value as JsonObject;
  if (!exactObject(wrapper, ["error"]) || typeof wrapper.error !== "object" || wrapper.error === null || Array.isArray(wrapper.error)) {
    return new AccountSyncError(response.status, "service_unavailable");
  }
  const detail = wrapper.error as JsonObject;
  const conflict = detail.code === "revision_conflict";
  const keys = conflict ? ["code", "message", "currentRevision"] : ["code", "message"];
  if (!exactObject(detail, keys) || typeof detail.code !== "string" || !ERROR_CODES.has(detail.code) ||
    typeof detail.message !== "string" || detail.message.length < 1 || detail.message.length > 200 ||
    (conflict && !validRevision(detail.currentRevision))) {
    return new AccountSyncError(response.status, "service_unavailable");
  }
  return new AccountSyncError(
    response.status,
    detail.code,
    conflict ? detail.currentRevision as number : undefined,
    response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined
  );
};

const accountRequest = async (
  path: string,
  init: RequestInit,
  expectedStatus: number,
  expectedAccountId: string,
  fetchImpl: typeof fetch
): Promise<unknown> => {
  if (!ID_PATTERN.test(expectedAccountId)) throw new AccountSyncError(400, "invalid_request");
  const response = await fetchImpl(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, "x-heritg-account-id": expectedAccountId },
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw parseError(response, payload);
  if (response.status !== expectedStatus ||
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return invalidResponse();
  }
  return payload;
};

const mutation = (csrfToken: string, body: unknown, signal?: AbortSignal): RequestInit => {
  if (!CSRF_PATTERN.test(csrfToken)) throw new AccountSyncError(400, "invalid_request");
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
    signal
  };
};

const treePath = (treeId: string): string => {
  if (!ID_PATTERN.test(treeId)) throw new AccountSyncError(400, "invalid_request");
  return `/${treeId}`;
};

const parseAllocation = (value: unknown, treeId: string, baseRevision: number): SnapshotAllocation => {
  if (!exactObject(value, ["uploadId", "targetRevision", "uploadMethod", "uploadUrl", "formFields", "uploadExpiresAt"])) {
    return invalidResponse();
  }
  const fields = value.formFields;
  if (typeof value.uploadId !== "string" || !ID_PATTERN.test(value.uploadId) ||
    value.targetRevision !== baseRevision + 1 || value.uploadMethod !== "POST" || !validSignedUrl(value.uploadUrl) ||
    !validInstant(value.uploadExpiresAt) || typeof fields !== "object" || fields === null || Array.isArray(fields) ||
    !Object.keys(fields).length || Object.entries(fields).some(([key, field]) => !key || typeof field !== "string")) {
    return invalidResponse();
  }
  const formFields = fields as Record<string, string>;
  if (formFields["Content-Type"] !== SYNC_CONTENT_TYPE || formFields["x-goog-if-generation-match"] !== "0" ||
    formFields["x-goog-meta-heritg-envelope"] !== SYNC_ENVELOPE_VERSION ||
    formFields["x-goog-meta-heritg-state"] !== "immutable" || formFields["x-goog-meta-heritg-tree-id"] !== treeId ||
    formFields["x-goog-meta-heritg-upload-id"] !== value.uploadId ||
    formFields["x-goog-meta-heritg-revision"] !== String(value.targetRevision) ||
    formFields.success_action_status !== "201") return invalidResponse();
  return value as unknown as SnapshotAllocation;
};

export interface AccountSyncClient {
  listTrees(signal?: AbortSignal): Promise<AccountSyncTree[]>;
  createTree(csrfToken: string, signal?: AbortSignal): Promise<CreatedAccountSyncTree>;
  getTreeKey(treeId: string, signal?: AbortSignal): Promise<string>;
  allocateSnapshot(treeId: string, baseRevision: number, ciphertextBytes: number, csrfToken: string, signal?: AbortSignal): Promise<SnapshotAllocation>;
  uploadSnapshot(allocation: SnapshotAllocation, envelope: Uint8Array, signal?: AbortSignal): Promise<string>;
  completeSnapshot(treeId: string, uploadId: string, objectGeneration: string, csrfToken: string, signal?: AbortSignal): Promise<number>;
  getSnapshot(treeId: string, signal?: AbortSignal): Promise<SnapshotMetadata>;
  downloadSnapshot(metadata: SnapshotMetadata, signal?: AbortSignal): Promise<Uint8Array>;
  deleteTree(treeId: string, csrfToken: string, signal?: AbortSignal): Promise<void>;
}

export const createAccountSyncClient = (expectedAccountId: string, fetchImpl: typeof fetch = fetch): AccountSyncClient => ({
  async listTrees(signal) {
    const value = await accountRequest("", { method: "GET", signal }, 200, expectedAccountId, fetchImpl);
    if (!exactObject(value, ["trees"]) || !Array.isArray(value.trees)) return invalidResponse();
    return value.trees.map(parseTree);
  },

  async createTree(csrfToken, signal) {
    return parseCreatedTree(await accountRequest("", mutation(csrfToken, {}, signal), 201, expectedAccountId, fetchImpl));
  },

  async getTreeKey(treeId, signal) {
    const value = await accountRequest(`${treePath(treeId)}/key`, { method: "GET", signal }, 200, expectedAccountId, fetchImpl);
    if (!exactObject(value, ["syncKey"]) || typeof value.syncKey !== "string" || !KEY_PATTERN.test(value.syncKey)) {
      return invalidResponse();
    }
    return value.syncKey;
  },

  async allocateSnapshot(treeId, baseRevision, ciphertextBytes, csrfToken, signal) {
    if (!validRevision(baseRevision) || baseRevision >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(ciphertextBytes) ||
      ciphertextBytes < 36 || ciphertextBytes > MAX_SYNC_ENVELOPE_BYTES) {
      throw new AccountSyncError(400, "invalid_request");
    }
    const value = await accountRequest(`${treePath(treeId)}/snapshot-uploads`, mutation(csrfToken, {
      envelopeVersion: SYNC_ENVELOPE_VERSION,
      ciphertextBytes,
      baseRevision
    }, signal), 201, expectedAccountId, fetchImpl);
    return parseAllocation(value, treeId, baseRevision);
  },

  async uploadSnapshot(allocation, envelope, signal) {
    if (!(envelope instanceof Uint8Array) || envelope.byteLength < 36 || envelope.byteLength > MAX_SYNC_ENVELOPE_BYTES) {
      throw new AccountSyncError(400, "invalid_request");
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(allocation.formFields)) form.append(key, value);
    const uploadBytes = new Uint8Array(new ArrayBuffer(envelope.byteLength));
    uploadBytes.set(envelope);
    form.append("file", new Blob([uploadBytes], { type: SYNC_CONTENT_TYPE }));
    const response = await fetchImpl(allocation.uploadUrl, {
      method: "POST",
      body: form,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal
    });
    const generation = response.headers.get("x-goog-generation");
    if (response.status !== 201 || !generation || !GENERATION_PATTERN.test(generation)) {
      throw new AccountSyncError(response.ok ? 502 : response.status, response.ok ? "invalid_response" : "service_unavailable");
    }
    return generation;
  },

  async completeSnapshot(treeId, uploadId, objectGeneration, csrfToken, signal) {
    if (!ID_PATTERN.test(uploadId) || !GENERATION_PATTERN.test(objectGeneration)) {
      throw new AccountSyncError(400, "invalid_request");
    }
    const value = await accountRequest(`${treePath(treeId)}/snapshot-uploads/${uploadId}/complete`,
      mutation(csrfToken, { objectGeneration }, signal), 200, expectedAccountId, fetchImpl);
    if (!exactObject(value, ["revision"]) || !validRevision(value.revision, false)) return invalidResponse();
    return value.revision;
  },

  async getSnapshot(treeId, signal) {
    const value = await accountRequest(`${treePath(treeId)}/snapshot`, { method: "GET", signal }, 200, expectedAccountId, fetchImpl);
    if (!exactObject(value, ["revision", "envelopeVersion", "ciphertextBytes", "downloadUrl", "downloadExpiresAt"]) ||
      !validRevision(value.revision, false) || value.envelopeVersion !== SYNC_ENVELOPE_VERSION ||
      !Number.isSafeInteger(value.ciphertextBytes) || (value.ciphertextBytes as number) < 36 ||
      (value.ciphertextBytes as number) > MAX_SYNC_ENVELOPE_BYTES || !validSignedUrl(value.downloadUrl) ||
      !validInstant(value.downloadExpiresAt)) return invalidResponse();
    return value as unknown as SnapshotMetadata;
  },

  async downloadSnapshot(metadata, signal) {
    const response = await fetchImpl(metadata.downloadUrl, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal
    });
    if (response.status !== 200) throw new AccountSyncError(response.status, "service_unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== metadata.ciphertextBytes || bytes.byteLength > MAX_SYNC_ENVELOPE_BYTES) return invalidResponse();
    return bytes;
  },

  async deleteTree(treeId, csrfToken, signal) {
    const init = mutation(csrfToken, {}, signal);
    init.method = "DELETE";
    const value = await accountRequest(treePath(treeId), init, 200, expectedAccountId, fetchImpl);
    if (!exactObject(value, ["status"]) || value.status !== "deleted") return invalidResponse();
  }
});
