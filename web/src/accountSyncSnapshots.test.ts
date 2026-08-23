import { describe, expect, it, vi } from "vitest";

import type { AccountSyncClient, SnapshotAllocation, SnapshotMetadata } from "./accountSync";
import { downloadRemoteTreeSnapshot, uploadLocalTreeSnapshot } from "./accountSyncSnapshots";
import type { AppData } from "./types";

const localTreeId = "local-tree";
const remoteTreeId = "r".repeat(22);
const uploadId = "u".repeat(22);
const syncKey = "s".repeat(43);
const csrf = "c".repeat(43);
const updatedAt = "2026-08-23T10:00:00.000Z";
const data: AppData = {
  version: 1,
  language: "en",
  trees: [{ id: localTreeId, title: "Synthetic", createdAt: updatedAt, updatedAt }],
  people: [],
  relationships: [],
  selectedTreeId: localTreeId,
  viewports: { [localTreeId]: { scrollX: 0, scrollY: 0, zoom: 1 } }
};

describe("account sync archive helpers", () => {
  it("allocates before encryption/upload and validates a downloaded archive", async () => {
    let uploaded: Uint8Array | undefined;
    const allocation: SnapshotAllocation = {
      uploadId,
      targetRevision: 1,
      uploadMethod: "POST",
      uploadUrl: "https://storage.googleapis.com/upload",
      formFields: {},
      uploadExpiresAt: updatedAt
    };
    const metadata = (): SnapshotMetadata => ({
      revision: 1,
      envelopeVersion: "HTGSYN01",
      ciphertextBytes: uploaded?.byteLength ?? 0,
      downloadUrl: "https://storage.googleapis.com/download",
      downloadExpiresAt: updatedAt
    });
    const client: AccountSyncClient = {
      listTrees: vi.fn(),
      createTree: vi.fn(),
      getTreeKey: vi.fn(),
      allocateSnapshot: vi.fn(async () => allocation),
      uploadSnapshot: vi.fn(async (_allocation, envelope) => { uploaded = envelope; return "1"; }),
      completeSnapshot: vi.fn(async () => 1),
      getSnapshot: vi.fn(async () => metadata()),
      downloadSnapshot: vi.fn(async () => uploaded ?? new Uint8Array()),
      deleteTree: vi.fn()
    };

    await expect(uploadLocalTreeSnapshot(client, data, localTreeId, remoteTreeId, 0, syncKey, csrf))
      .resolves.toEqual({ revision: 1, lastSyncedUpdatedAt: updatedAt });
    expect(client.allocateSnapshot).toHaveBeenCalledWith(remoteTreeId, 0, expect.any(Number), csrf, undefined);
    expect([...(uploaded?.slice(0, 8) ?? [])]).toEqual([...new TextEncoder().encode("HTGSYN01")]);

    const downloaded = await downloadRemoteTreeSnapshot(client, remoteTreeId, syncKey);
    expect(downloaded.revision).toBe(1);
    expect(downloaded.data.trees).toEqual(data.trees);
  });
});
