import type { AccountSyncClient, AccountSyncTree } from "./accountSync";
import { downloadRemoteTreeSnapshot, uploadLocalTreeSnapshot } from "./accountSyncSnapshots";
import type { SyncMapping } from "./db";
import { localizedDefaultTreeTitle, replaceAppData } from "./domain";
import { mergeImportedData } from "./portability";
import type { SyncArchiveSummary, SyncResolution } from "./proTypes";
import type { AppData } from "./types";

interface CloudTree {
  remote: AccountSyncTree;
  syncKey: string;
  data: AppData;
}

export interface AccountSyncResult {
  data: AppData;
  mappings: SyncMapping[];
  phase: "upToDate" | "pending" | "conflict";
  pendingChanges: number;
  local?: SyncArchiveSummary;
  cloud?: SyncArchiveSummary;
}

export interface AccountSyncInput {
  client: AccountSyncClient;
  data: AppData;
  mappings: SyncMapping[];
  canWrite: boolean;
  csrfToken?: string;
  resolution?: SyncResolution;
  beforeMutation?: () => Promise<void>;
  signal?: AbortSignal;
}

const beforeMutation = async (input: AccountSyncInput): Promise<void> => input.beforeMutation?.();

const summary = (data: AppData): SyncArchiveSummary => ({
  trees: data.trees.length,
  people: data.people.length,
  updatedAt: data.trees.map((tree) => tree.updatedAt).sort().at(-1)
});

const treeSlice = (data: AppData, treeId: string): AppData => {
  const tree = data.trees.find((candidate) => candidate.id === treeId);
  if (!tree) throw new Error("Local sync tree was not found.");
  return replaceAppData({
    ...data,
    trees: [tree],
    people: data.people.filter((person) => person.treeId === treeId),
    relationships: data.relationships.filter((relationship) => relationship.treeId === treeId),
    selectedTreeId: treeId,
    viewports: data.viewports[treeId] ? { [treeId]: data.viewports[treeId] } : {}
  });
};

const withoutTree = (data: AppData, treeId: string): AppData => {
  const trees = data.trees.filter((tree) => tree.id !== treeId);
  const viewports = Object.fromEntries(Object.entries(data.viewports).filter(([id]) => id !== treeId));
  return replaceAppData({
    ...data,
    trees,
    people: data.people.filter((person) => person.treeId !== treeId),
    relationships: data.relationships.filter((relationship) => relationship.treeId !== treeId),
    selectedTreeId: data.selectedTreeId === treeId ? trees[0]?.id : data.selectedTreeId,
    viewports
  });
};

const replaceTree = (data: AppData, localTreeId: string, snapshot: AppData): AppData => {
  const remoteTree = snapshot.trees[0];
  if (!remoteTree || remoteTree.id !== localTreeId) throw new Error("Cloud tree identity did not match local sync metadata.");
  const base = data.trees.some((tree) => tree.id === localTreeId) ? withoutTree(data, localTreeId) : data;
  return replaceAppData({
    ...base,
    trees: [...base.trees, remoteTree],
    people: [...base.people, ...snapshot.people],
    relationships: [...base.relationships, ...snapshot.relationships],
    selectedTreeId: base.selectedTreeId ?? localTreeId,
    viewports: {
      ...base.viewports,
      [localTreeId]: data.viewports[localTreeId] ?? snapshot.viewports[localTreeId] ?? { scrollX: 0, scrollY: 0, zoom: 1 }
    }
  });
};

const emptyLike = (data: AppData): AppData => replaceAppData({
  ...data,
  trees: [],
  people: [],
  relationships: [],
  selectedTreeId: undefined,
  viewports: {}
});

const isPristineDefault = (data: AppData): boolean => {
  const tree = data.trees[0];
  return data.trees.length === 1 && data.people.length === 0 && data.relationships.length === 0 && Boolean(tree) &&
    tree.title === localizedDefaultTreeTitle(data.language) && tree.createdAt === tree.updatedAt && !tree.lastSelectedPersonId;
};

const csrf = (input: AccountSyncInput): string => {
  if (!input.canWrite) throw new Error("Family synchronization is read-only.");
  if (!input.csrfToken) throw new Error("Sign in again before synchronizing family data.");
  return input.csrfToken;
};

const loadCloudTrees = async (
  client: AccountSyncClient,
  remotes: AccountSyncTree[],
  mappings: SyncMapping[],
  signal?: AbortSignal
): Promise<CloudTree[]> => {
  const keys = new Map(mappings.map((mapping) => [mapping.remoteTreeId, mapping.syncKey]));
  const loaded: CloudTree[] = [];
  for (const remote of remotes.filter((tree) => tree.revision > 0)) {
    const syncKey = keys.get(remote.treeId) ?? await client.getTreeKey(remote.treeId, signal);
    const snapshot = await downloadRemoteTreeSnapshot(client, remote.treeId, syncKey, signal);
    if (snapshot.revision !== remote.revision) throw new Error("Cloud tree changed while synchronization was comparing copies.");
    loaded.push({ remote, syncKey, data: snapshot.data });
  }
  return loaded;
};

const cloudArchive = (base: AppData, trees: CloudTree[]): AppData => {
  let data = emptyLike(base);
  for (const tree of trees) {
    const localTreeId = tree.data.trees[0]?.id;
    if (!localTreeId || data.trees.some((candidate) => candidate.id === localTreeId)) {
      throw new Error("Cloud family data contains duplicate tree identities.");
    }
    data = replaceTree(data, localTreeId, tree.data);
  }
  return data;
};

const uploadNewTree = async (
  input: AccountSyncInput,
  data: AppData,
  localTreeId: string
): Promise<SyncMapping> => {
  await beforeMutation(input);
  const created = await input.client.createTree(csrf(input), input.signal);
  const uploaded = await uploadLocalTreeSnapshot(
    input.client,
    data,
    localTreeId,
    created.treeId,
    created.revision,
    created.syncKey,
    csrf(input),
    input.signal
  );
  return {
    localTreeId,
    remoteTreeId: created.treeId,
    revision: uploaded.revision,
    syncKey: created.syncKey,
    lastSyncedUpdatedAt: uploaded.lastSyncedUpdatedAt
  };
};

const resolveCopies = async (
  input: AccountSyncInput,
  remotes: AccountSyncTree[]
): Promise<AccountSyncResult> => {
  const resolution = input.resolution;
  if (!resolution) throw new Error("A synchronization choice is required.");
  if (resolution === "device") {
    for (const remote of remotes) {
      await beforeMutation(input);
      await input.client.deleteTree(remote.treeId, csrf(input), input.signal);
    }
    const mappings: SyncMapping[] = [];
    for (const tree of input.data.trees) mappings.push(await uploadNewTree(input, input.data, tree.id));
    return { data: input.data, mappings, phase: "upToDate", pendingChanges: 0 };
  }

  const cloudTrees = await loadCloudTrees(input.client, remotes, input.mappings, input.signal);
  if (input.canWrite) {
    for (const remote of remotes.filter((tree) => tree.revision === 0)) {
      await beforeMutation(input);
      await input.client.deleteTree(remote.treeId, csrf(input), input.signal);
    }
  }
  if (resolution === "cloud") {
    const data = cloudArchive(input.data, cloudTrees);
    const mappings = cloudTrees.map(({ remote, syncKey, data: snapshot }) => ({
      localTreeId: snapshot.trees[0]!.id,
      remoteTreeId: remote.treeId,
      revision: remote.revision,
      syncKey,
      lastSyncedUpdatedAt: snapshot.trees[0]!.updatedAt
    }));
    return { data, mappings, phase: "upToDate", pendingChanges: 0 };
  }

  if (!input.canWrite) throw new Error("Preserving both copies requires write access.");
  let data = cloudArchive(input.data, cloudTrees);
  const mappings: SyncMapping[] = cloudTrees.map((cloudTree) => ({
    localTreeId: cloudTree.data.trees[0]!.id,
    remoteTreeId: cloudTree.remote.treeId,
    revision: cloudTree.remote.revision,
    syncKey: cloudTree.syncKey,
    lastSyncedUpdatedAt: cloudTree.data.trees[0]!.updatedAt
  }));
  for (const localTree of input.data.trees) {
    const previousIds = new Set(data.trees.map((tree) => tree.id));
    data = mergeImportedData(treeSlice(input.data, localTree.id), { into: data });
    const imported = data.trees.find((tree) => !previousIds.has(tree.id));
    if (!imported) throw new Error("Device family data could not be preserved.");
    mappings.push(await uploadNewTree(input, data, imported.id));
  }
  return { data, mappings, phase: "upToDate", pendingChanges: 0 };
};

export async function reconcileAccountSync(input: AccountSyncInput): Promise<AccountSyncResult> {
  const listed = await input.client.listTrees(input.signal);
  const remotes = listed.filter((tree) => tree.status === "active");
  const deletedRemoteIds = new Set(listed.filter((tree) => tree.status === "deleted").map((tree) => tree.treeId));
  const deletedMapping = input.mappings.find((mapping) => deletedRemoteIds.has(mapping.remoteTreeId));
  if (deletedMapping) {
    const data = input.data.trees.some((tree) => tree.id === deletedMapping.localTreeId)
      ? withoutTree(input.data, deletedMapping.localTreeId)
      : input.data;
    return {
      data,
      mappings: input.mappings.filter((mapping) => mapping !== deletedMapping),
      phase: "pending",
      pendingChanges: 1
    };
  }
  if (input.resolution) return resolveCopies(input, remotes);

  if (input.mappings.length === 0) {
    const hasCloudData = remotes.some((tree) => tree.revision > 0);
    const hasLocalData = input.data.trees.length > 0 && !isPristineDefault(input.data);
    if (!hasCloudData) {
      if (input.canWrite) return resolveCopies({ ...input, resolution: "device" }, remotes);
      const pendingChanges = input.data.trees.length + remotes.length;
      return { data: input.data, mappings: [], phase: pendingChanges ? "pending" : "upToDate", pendingChanges };
    }
    if (!hasLocalData) return resolveCopies({ ...input, resolution: "cloud" }, remotes);
    if (input.canWrite) return resolveCopies({ ...input, resolution: "both" }, remotes);
    return {
      data: input.data,
      mappings: [],
      phase: "pending",
      pendingChanges: input.data.trees.length
    };
  }

  const remoteById = new Map(remotes.map((tree) => [tree.treeId, tree]));
  const mappingByLocal = new Map(input.mappings.map((mapping) => [mapping.localTreeId, mapping]));
  const mappingByRemote = new Map(input.mappings.map((mapping) => [mapping.remoteTreeId, mapping]));
  let data = input.data;

  const localById = new Map(data.trees.map((tree) => [tree.id, tree]));
  const unmappedLocal = data.trees.filter((tree) => !mappingByLocal.has(tree.id));
  const unmappedRemote = remotes.filter((tree) => !mappingByRemote.has(tree.treeId));
  const staleMappings = input.mappings.filter((mapping) => !remoteById.has(mapping.remoteTreeId) && localById.has(mapping.localTreeId));
  const divergent = input.mappings.some((mapping) => {
    const local = localById.get(mapping.localTreeId);
    const remote = remoteById.get(mapping.remoteTreeId);
    if (!local || !remote) return false;
    const localChanged = local.updatedAt !== mapping.lastSyncedUpdatedAt;
    return remote.revision < mapping.revision || (localChanged && remote.revision > mapping.revision);
  });
  const hasConflict = staleMappings.length > 0 || divergent || (unmappedLocal.length > 0 && unmappedRemote.length > 0);
  if (hasConflict) {
    const cloudData = cloudArchive(data, await loadCloudTrees(input.client, remotes, input.mappings, input.signal));
    return {
      data: input.data,
      mappings: input.mappings,
      phase: "conflict",
      pendingChanges: unmappedLocal.length + staleMappings.length + (divergent ? 1 : 0),
      local: summary(input.data),
      cloud: summary(cloudData)
    };
  }

  let mappings = input.mappings.filter((mapping) => remoteById.has(mapping.remoteTreeId) || localById.has(mapping.localTreeId));
  let pendingChanges = 0;
  for (const mapping of [...mappings]) {
    const local = data.trees.find((tree) => tree.id === mapping.localTreeId);
    const remote = remoteById.get(mapping.remoteTreeId);
    if (!local && remote) {
      if (!input.canWrite) { pendingChanges += 1; continue; }
      await beforeMutation(input);
      await input.client.deleteTree(remote.treeId, csrf(input), input.signal);
      mappings = mappings.filter((candidate) => candidate !== mapping);
      return { data, mappings, phase: "pending", pendingChanges: 1 };
    }
    if (!local || !remote) continue;
    if (remote.revision > mapping.revision) {
      const downloaded = await downloadRemoteTreeSnapshot(input.client, remote.treeId, mapping.syncKey, input.signal);
      data = replaceTree(data, mapping.localTreeId, downloaded.data);
      mappings = mappings.map((candidate) => candidate === mapping ? {
        ...candidate,
        revision: downloaded.revision,
        lastSyncedUpdatedAt: downloaded.data.trees[0]!.updatedAt
      } : candidate);
      return { data, mappings, phase: "pending", pendingChanges: 1 };
    }
    if (local.updatedAt !== mapping.lastSyncedUpdatedAt) {
      if (!input.canWrite) { pendingChanges += 1; continue; }
      await beforeMutation(input);
      const uploaded = await uploadLocalTreeSnapshot(
        input.client,
        data,
        local.id,
        remote.treeId,
        mapping.revision,
        mapping.syncKey,
        csrf(input),
        input.signal
      );
      mappings = mappings.map((candidate) => candidate === mapping ? { ...candidate, ...uploaded } : candidate);
      return { data, mappings, phase: "pending", pendingChanges: 1 };
    }
  }

  for (const remote of unmappedRemote) {
    if (remote.revision === 0) { pendingChanges += 1; continue; }
    const syncKey = await input.client.getTreeKey(remote.treeId, input.signal);
    const downloaded = await downloadRemoteTreeSnapshot(input.client, remote.treeId, syncKey, input.signal);
    const localTreeId = downloaded.data.trees[0]!.id;
    if (data.trees.some((tree) => tree.id === localTreeId)) throw new Error("Cloud tree identity already exists on this device.");
    data = replaceTree(data, localTreeId, downloaded.data);
    mappings.push({
      localTreeId,
      remoteTreeId: remote.treeId,
      revision: downloaded.revision,
      syncKey,
      lastSyncedUpdatedAt: downloaded.data.trees[0]!.updatedAt
    });
    return { data, mappings, phase: "pending", pendingChanges: 1 };
  }
  for (const local of unmappedLocal) {
    if (!input.canWrite) { pendingChanges += 1; continue; }
    mappings.push(await uploadNewTree(input, data, local.id));
    return { data, mappings, phase: "pending", pendingChanges: 1 };
  }
  return { data, mappings, phase: pendingChanges ? "pending" : "upToDate", pendingChanges };
}
