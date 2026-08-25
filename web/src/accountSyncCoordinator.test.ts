import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshotMocks = vi.hoisted(() => ({
  downloadRemoteTreeSnapshot: vi.fn(),
  uploadLocalTreeSnapshot: vi.fn()
}));

vi.mock("./accountSyncSnapshots", () => snapshotMocks);

import type { AccountSyncClient, AccountSyncTree, CreatedAccountSyncTree } from "./accountSync";
import { reconcileAccountSync } from "./accountSyncCoordinator";
import type { SyncMapping } from "./db";
import type { AppData } from "./types";

const instant = "2026-08-23T10:00:00.000Z";
const newer = "2026-08-23T11:00:00.000Z";
const csrf = "c".repeat(43);
const syncKey = "s".repeat(43);
const remoteTreeId = "r".repeat(22);
const secondRemoteTreeId = "n".repeat(22);

const data = (treeId = "local-tree", updatedAt = instant, title = "Family"): AppData => ({
  version: 1,
  language: "en",
  relationshipLanguage: "en",
  relationshipTerminology: "id",
  trees: [{ id: treeId, title, createdAt: instant, updatedAt }],
  people: [],
  relationships: [],
  selectedTreeId: treeId,
  viewports: { [treeId]: { scrollX: 0, scrollY: 0, zoom: 1 } }
});

const remote = (revision: number, treeId = remoteTreeId): AccountSyncTree => ({
  treeId,
  role: "owner",
  status: "active",
  revision,
  createdAt: instant,
  updatedAt: revision > 1 ? newer : instant
});

const created = (treeId = secondRemoteTreeId): CreatedAccountSyncTree => ({
  ...remote(0, treeId),
  syncKey
});

const client = (trees: AccountSyncTree[], overrides: Partial<AccountSyncClient> = {}): AccountSyncClient => ({
  listTrees: vi.fn(async () => trees),
  createTree: vi.fn(async () => created()),
  getTreeKey: vi.fn(async () => syncKey),
  allocateSnapshot: vi.fn(),
  uploadSnapshot: vi.fn(),
  completeSnapshot: vi.fn(),
  getSnapshot: vi.fn(),
  downloadSnapshot: vi.fn(),
  deleteTree: vi.fn(async () => undefined),
  ...overrides
});

const mapping = (revision = 1): SyncMapping => ({
  localTreeId: "local-tree",
  remoteTreeId,
  revision,
  syncKey,
  lastSyncedUpdatedAt: instant
});

beforeEach(() => {
  snapshotMocks.downloadRemoteTreeSnapshot.mockReset();
  snapshotMocks.uploadLocalTreeSnapshot.mockReset();
  snapshotMocks.uploadLocalTreeSnapshot.mockImplementation(async (
    _client: AccountSyncClient,
    localData: AppData,
    localTreeId: string,
    _remoteTreeId: string,
    baseRevision: number
  ) => ({
    revision: baseRevision + 1,
    lastSyncedUpdatedAt: localData.trees.find((tree) => tree.id === localTreeId)!.updatedAt
  }));
});

describe("account sync coordinator", () => {
  it("creates and uploads the first local tree using the returned escrowed key", async () => {
    const syncClient = client([]);
    const beforeMutation = vi.fn(async () => undefined);
    const result = await reconcileAccountSync({ client: syncClient, data: data(), mappings: [], canWrite: true, csrfToken: csrf, beforeMutation });

    expect(beforeMutation).toHaveBeenCalledOnce();
    expect(syncClient.createTree).toHaveBeenCalledWith(csrf, undefined);
    expect(snapshotMocks.uploadLocalTreeSnapshot).toHaveBeenCalledWith(
      syncClient, expect.anything(), "local-tree", secondRemoteTreeId, 0, syncKey, csrf, undefined
    );
    expect(result.mappings).toEqual([expect.objectContaining({ localTreeId: "local-tree", remoteTreeId: secondRemoteTreeId, revision: 1, syncKey })]);
    expect(result.phase).toBe("upToDate");
  });

  it("replaces an abandoned empty cloud tree with the local archive without prompting", async () => {
    const syncClient = client([remote(0)]);
    const result = await reconcileAccountSync({
      client: syncClient,
      data: data(),
      mappings: [],
      canWrite: true,
      csrfToken: csrf
    });

    expect(syncClient.deleteTree).toHaveBeenCalledWith(remoteTreeId, csrf, undefined);
    expect(snapshotMocks.uploadLocalTreeSnapshot).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ phase: "upToDate", pendingChanges: 0 });
    expect(result.mappings).toEqual([expect.objectContaining({ localTreeId: "local-tree", revision: 1 })]);
  });

  it("restores cloud data over a pristine default tree without prompting", async () => {
    const cloud = data("cloud-local-id", newer, "Cloud Family");
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 1, data: cloud });
    const result = await reconcileAccountSync({
      client: client([remote(1)]),
      data: data("fresh", instant, "My Family Tree"),
      mappings: [],
      canWrite: true,
      csrfToken: csrf
    });

    expect(result.data.trees.map((tree) => tree.id)).toEqual(["cloud-local-id"]);
    expect(result.mappings[0]).toMatchObject({ localTreeId: "cloud-local-id", remoteTreeId, revision: 1 });
    expect(result.phase).toBe("upToDate");
  });

  it("restores cloud data when the local archive has no trees", async () => {
    const cloud = data("cloud-local-id", newer, "Cloud Family");
    const empty = { ...data(), trees: [], people: [], relationships: [], selectedTreeId: undefined, viewports: {} };
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 1, data: cloud });
    const result = await reconcileAccountSync({
      client: client([remote(1)]),
      data: empty,
      mappings: [],
      canWrite: true,
      csrfToken: csrf
    });

    expect(result.data.trees.map((tree) => tree.id)).toEqual(["cloud-local-id"]);
    expect(result.mappings).toEqual([expect.objectContaining({ localTreeId: "cloud-local-id", remoteTreeId })]);
    expect(result.phase).toBe("upToDate");
    expect(snapshotMocks.uploadLocalTreeSnapshot).not.toHaveBeenCalled();
  });

  it("automatically preserves populated device and cloud archives on first synchronization", async () => {
    const cloud = data("local-tree", newer, "Cloud Family");
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 1, data: cloud });
    const result = await reconcileAccountSync({
      client: client([remote(1)]),
      data: data("local-tree", instant, "Device Family"),
      mappings: [],
      canWrite: true,
      csrfToken: csrf
    });

    expect(result.phase).toBe("upToDate");
    expect(result.data.trees).toHaveLength(2);
    expect(result.data.trees.some((tree) => tree.id === "local-tree" && tree.title === "Cloud Family")).toBe(true);
    const preservedDevice = result.data.trees.find((tree) => tree.title === "Device Family");
    expect(preservedDevice?.id).toBeTruthy();
    expect(preservedDevice?.id).not.toBe("local-tree");
    expect(result.mappings).toEqual([
      expect.objectContaining({ localTreeId: "local-tree", remoteTreeId }),
      expect.objectContaining({ localTreeId: preservedDevice?.id, remoteTreeId: secondRemoteTreeId })
    ]);
  });

  it("waits without prompting when both initial archives need read-only preservation", async () => {
    const result = await reconcileAccountSync({
      client: client([remote(1)]),
      data: data("local-tree", instant, "Device Family"),
      mappings: [],
      canWrite: false
    });

    expect(result).toMatchObject({ phase: "pending", pendingChanges: 1, mappings: [] });
    expect(result.data.trees[0]?.title).toBe("Device Family");
    expect(snapshotMocks.downloadRemoteTreeSnapshot).not.toHaveBeenCalled();
    expect(snapshotMocks.uploadLocalTreeSnapshot).not.toHaveBeenCalled();
  });

  it("reports a conflict when both mapped copies changed", async () => {
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 2, data: data("local-tree", newer, "Cloud") });
    const result = await reconcileAccountSync({
      client: client([remote(2)]),
      data: data("local-tree", newer, "Device"),
      mappings: [mapping()],
      canWrite: true,
      csrfToken: csrf
    });

    expect(result).toMatchObject({ phase: "conflict", pendingChanges: 1, local: { trees: 1 }, cloud: { trees: 1 } });
    expect(snapshotMocks.uploadLocalTreeSnapshot).not.toHaveBeenCalled();
  });

  it("propagates a local deletion before dropping its mapping", async () => {
    const syncClient = client([remote(1)]);
    const empty = { ...data(), trees: [], selectedTreeId: undefined, viewports: {} };
    const result = await reconcileAccountSync({ client: syncClient, data: empty, mappings: [mapping()], canWrite: true, csrfToken: csrf });

    expect(syncClient.deleteTree).toHaveBeenCalledWith(remoteTreeId, csrf, undefined);
    expect(result.mappings).toEqual([]);
    expect(result.phase).toBe("pending");
  });

  it("applies an authoritative remote tombstone locally", async () => {
    const tombstone: AccountSyncTree = { ...remote(1), status: "deleted", deletedAt: newer };
    const result = await reconcileAccountSync({
      client: client([tombstone]),
      data: data(),
      mappings: [mapping()],
      canWrite: true,
      csrfToken: csrf
    });

    expect(result.data.trees).toEqual([]);
    expect(result.mappings).toEqual([]);
    expect(result.phase).toBe("pending");
  });

  it("can choose the cloud copy while entitlement access is read-only", async () => {
    const cloud = data("local-tree", newer, "Cloud");
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 2, data: cloud });
    const result = await reconcileAccountSync({
      client: client([remote(2)]),
      data: data("local-tree", newer, "Device"),
      mappings: [mapping()],
      canWrite: false,
      resolution: "cloud"
    });

    expect(result.data.trees[0]?.title).toBe("Cloud");
    expect(result.mappings[0]).toMatchObject({ revision: 2, lastSyncedUpdatedAt: newer });
    expect(result.phase).toBe("upToDate");
  });

  it("preserves cloud identity and remaps the device copy when keeping both", async () => {
    const cloud = data("local-tree", newer, "Cloud");
    snapshotMocks.downloadRemoteTreeSnapshot.mockResolvedValue({ revision: 2, data: cloud });
    const result = await reconcileAccountSync({
      client: client([remote(2)]),
      data: data("local-tree", newer, "Device"),
      mappings: [mapping()],
      canWrite: true,
      csrfToken: csrf,
      resolution: "both"
    });

    expect(result.data.trees).toHaveLength(2);
    expect(result.mappings[0]).toMatchObject({ localTreeId: "local-tree", remoteTreeId });
    expect(result.mappings[1]?.localTreeId).not.toBe("local-tree");
    expect(result.mappings[1]).toMatchObject({ remoteTreeId: secondRemoteTreeId });
  });
});
