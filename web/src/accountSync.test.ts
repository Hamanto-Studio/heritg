import { describe, expect, it, vi } from "vitest";

import { AccountSyncError, SYNC_CONTENT_TYPE, createAccountSyncClient } from "./accountSync";

const treeId = "t".repeat(22);
const uploadId = "u".repeat(22);
const csrf = "c".repeat(43);
const syncKey = "k".repeat(43);
const accountId = "a".repeat(22);
const instant = "2026-08-23T10:00:00.000Z";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", ...headers }
});
const fields = {
  "Content-Type": SYNC_CONTENT_TYPE,
  "x-goog-if-generation-match": "0",
  "x-goog-meta-heritg-envelope": "HTGSYN01",
  "x-goog-meta-heritg-state": "immutable",
  "x-goog-meta-heritg-tree-id": treeId,
  "x-goog-meta-heritg-upload-id": uploadId,
  "x-goog-meta-heritg-revision": "1",
  success_action_status: "201",
  policy: "signed-policy"
};

describe("account sync transport", () => {
  it("returns the escrowed key from tree creation", async () => {
    const client = createAccountSyncClient(accountId, vi.fn(async () => json({
      treeId,
      role: "owner",
      status: "active",
      revision: 0,
      createdAt: instant,
      updatedAt: instant,
      syncKey
    }, 201)));

    await expect(client.createTree(csrf)).resolves.toMatchObject({ treeId, revision: 0, syncKey });
  });

  it("uses included credentials, exact mutation headers, and strict key responses", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      return String(input).endsWith("/key") ? json({ syncKey }) : json({
        uploadId,
        targetRevision: 1,
        uploadMethod: "POST",
        uploadUrl: "https://storage.googleapis.com/signed",
        formFields: fields,
        uploadExpiresAt: instant
      }, 201);
    });
    const client = createAccountSyncClient(accountId, fetchMock);

    await expect(client.getTreeKey(treeId)).resolves.toBe(syncKey);
    await client.allocateSnapshot(treeId, 0, 36, csrf);

    const [, init] = fetchMock.mock.calls[1];
    expect(init).toEqual(expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json", "x-csrf-token": csrf, "x-heritg-account-id": accountId }
    }));
    expect(JSON.parse(String(init?.body))).toEqual({ envelopeVersion: "HTGSYN01", ciphertextBytes: 36, baseRevision: 0 });
  });

  it("uploads and downloads signed objects without credentials or cache", async () => {
    const envelope = new Uint8Array(36);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === "https://storage.googleapis.com/signed-upload" && init?.method === "POST"
        ? new Response("", { status: 201 })
        : String(input).includes("/complete")
          ? json({ revision: 1 })
          : new Response(envelope, { status: 200 }));
    const client = createAccountSyncClient(accountId, fetchMock);
    const allocation = {
      uploadId,
      targetRevision: 1,
      uploadMethod: "POST" as const,
      uploadUrl: "https://storage.googleapis.com/signed-upload",
      formFields: fields,
      uploadExpiresAt: instant
    };

    await expect(client.uploadSnapshot(allocation, envelope)).resolves.toBeUndefined();
    await expect(client.completeSnapshot(treeId, uploadId, csrf)).resolves.toBe(1);
    await expect(client.downloadSnapshot({
      revision: 1,
      envelopeVersion: "HTGSYN01",
      ciphertextBytes: 36,
      downloadUrl: "https://storage.googleapis.com/signed-download",
      downloadExpiresAt: instant
    })).resolves.toEqual(envelope);

    for (const [, init] of [fetchMock.mock.calls[0]!, fetchMock.mock.calls[2]!]) {
      expect(init).toEqual(expect.objectContaining({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }));
    }
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({});
  });

  it("strictly rejects expanded responses and safely preserves conflict revision", async () => {
    const expanded = createAccountSyncClient(accountId, vi.fn(async () => json({ syncKey, extra: true })));
    await expect(expanded.getTreeKey(treeId)).rejects.toMatchObject({ status: 502, code: "invalid_response" });

    const conflict = createAccountSyncClient(accountId, vi.fn(async () => json({
      error: { code: "revision_conflict", message: "Snapshot revision conflict", currentRevision: 9 }
    }, 409)));
    const error = await conflict.allocateSnapshot(treeId, 0, 36, csrf).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AccountSyncError);
    expect(error).toMatchObject({ status: 409, code: "revision_conflict", currentRevision: 9 });
    expect(String(error)).not.toContain(treeId);
    expect(String(error)).not.toContain(csrf);

    const changed = createAccountSyncClient(accountId, vi.fn(async () => json({
      error: { code: "session_changed", message: "Account session changed" }
    }, 409)));
    await expect(changed.listTrees()).rejects.toMatchObject({ status: 409, code: "session_changed" });
  });

  it("rejects allocation fields that are not bound to the request", async () => {
    const client = createAccountSyncClient(accountId, vi.fn(async () => json({
      uploadId,
      targetRevision: 1,
      uploadMethod: "POST",
      uploadUrl: "https://storage.googleapis.com/signed",
      formFields: { ...fields, "x-goog-meta-heritg-tree-id": "x".repeat(22) },
      uploadExpiresAt: instant
    }, 201)));

    await expect(client.allocateSnapshot(treeId, 0, 36, csrf)).rejects.toMatchObject({ code: "invalid_response" });
  });
});
