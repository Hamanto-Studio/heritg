import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>()
}));

vi.mock("idb", () => ({
  openDB: async (_name: string, _version: number, options: { upgrade(db: unknown): void }) => {
    const db = {
      objectStoreNames: { contains: (name: string) => state.stores.has(name) },
      createObjectStore: (name: string) => state.stores.set(name, new Map()),
      get: async (store: string, key: string) => state.stores.get(store)?.get(key),
      put: async (store: string, value: unknown, key: string) => { state.stores.get(store)?.set(key, value); },
      transaction: (stores: string | string[]) => {
        const names = Array.isArray(stores) ? stores : [stores];
        const objectStore = (store: string) => ({
          put: async (value: unknown, key: string) => { state.stores.get(store)?.set(key, value); }
        });
        return {
          objectStore,
          store: objectStore(names[0]!),
          done: Promise.resolve()
        };
      }
    };
    options.upgrade(db);
    return db;
  }
}));

import {
  claimSyncOwnerAccountId,
  isSyncMapping,
  loadAppData,
  loadSyncMappings,
  loadSyncOwnerAccountId,
  saveSyncedState,
  saveSyncMetadata,
  saveSyncMappings,
  type SyncMapping
} from "./db";

const mapping: SyncMapping = {
  localTreeId: "local-tree",
  remoteTreeId: "r".repeat(22),
  revision: 4,
  syncKey: "s".repeat(43),
  lastSyncedUpdatedAt: "2026-08-23T10:00:00.000Z"
};
const accountId = "a".repeat(22);

beforeEach(() => {
  for (const store of state.stores.values()) store.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_name: string, callback: () => Promise<void>) => callback() }
  });
});

describe("sync metadata storage", () => {
  it("encrypts mappings under the existing non-extractable local key", async () => {
    await saveSyncMappings(accountId, [mapping]);

    const stored = state.stores.get("syncMetadata")?.get(`mappings:${accountId}`) as { ciphertext?: ArrayBuffer };
    const key = state.stores.get("encryptionKeys")?.get("localDataKey") as CryptoKey;
    expect(stored.ciphertext?.byteLength).toBeGreaterThan(16);
    expect(JSON.stringify(stored)).not.toContain(mapping.remoteTreeId);
    expect(key.extractable).toBe(false);
    await expect(loadSyncMappings(accountId)).resolves.toEqual([mapping]);
  });

  it("strictly rejects expanded, duplicate, and malformed mappings", async () => {
    expect(isSyncMapping({ ...mapping, extra: true })).toBe(false);
    expect(isSyncMapping({ ...mapping, syncKey: "short" })).toBe(false);
    await expect(saveSyncMappings(accountId, [mapping, { ...mapping }])).rejects.toThrow(/invalid/i);
    await expect(loadSyncMappings("invalid")).rejects.toThrow(/account/i);
  });

  it("binds local synchronization to one account and persists pulls with their mapping", async () => {
    const appData = {
      version: 1 as const,
      language: "en" as const,
      relationshipLanguage: "en" as const,
      relationshipTerminology: "id" as const,
      trees: [{ id: "local-tree", title: "Family", createdAt: mapping.lastSyncedUpdatedAt, updatedAt: mapping.lastSyncedUpdatedAt }],
      people: [],
      relationships: [],
      selectedTreeId: "local-tree",
      viewports: {}
    };
    await saveSyncedState(accountId, appData, [mapping]);

    await expect(loadSyncOwnerAccountId()).resolves.toBe(accountId);
    await expect(loadAppData()).resolves.toEqual(appData);
    await expect(loadSyncMappings(accountId)).resolves.toEqual([mapping]);
  });

  it("claims ownership atomically with metadata-only synchronization", async () => {
    await saveSyncMetadata(accountId, [mapping]);

    await expect(loadSyncOwnerAccountId()).resolves.toBe(accountId);
    await expect(loadSyncMappings(accountId)).resolves.toEqual([mapping]);
  });

  it("rejects a mutation claim from another account", async () => {
    await claimSyncOwnerAccountId(accountId);
    await expect(claimSyncOwnerAccountId("b".repeat(22))).rejects.toThrow(/another account/i);
  });
});
