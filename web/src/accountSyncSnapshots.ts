import type { AccountSyncClient } from "./accountSync";
import { MAX_SYNC_PLAINTEXT_BYTES, decryptSyncSnapshot, encryptSyncSnapshot } from "./accountSyncCrypto";
import { exportCanonicalHeritgArchive, importHeritgArchive } from "./heritgArchive";
import type { AppData } from "./types";

export interface UploadedTreeSnapshot {
  revision: number;
  lastSyncedUpdatedAt: string;
}

export interface DownloadedTreeSnapshot {
  revision: number;
  data: AppData;
}

export async function uploadLocalTreeSnapshot(
  client: AccountSyncClient,
  data: AppData,
  localTreeId: string,
  remoteTreeId: string,
  baseRevision: number,
  syncKey: string,
  csrfToken: string,
  signal?: AbortSignal
): Promise<UploadedTreeSnapshot> {
  const tree = data.trees.find((candidate) => candidate.id === localTreeId);
  if (!tree) throw new Error("Local sync tree was not found.");
  const plaintext = await exportCanonicalHeritgArchive(data, localTreeId);
  if (plaintext.byteLength > MAX_SYNC_PLAINTEXT_BYTES) throw new Error("Sync snapshot plaintext is too large.");
  const allocation = await client.allocateSnapshot(remoteTreeId, baseRevision, plaintext.byteLength + 36, csrfToken, signal);
  const envelope = await encryptSyncSnapshot(plaintext, syncKey, remoteTreeId, allocation.targetRevision);
  await client.uploadSnapshot(allocation, envelope, signal);
  const revision = await client.completeSnapshot(remoteTreeId, allocation.uploadId, csrfToken, signal);
  if (revision !== allocation.targetRevision) throw new Error("Sync completion revision did not match its allocation.");
  return { revision, lastSyncedUpdatedAt: tree.updatedAt };
}

export async function downloadRemoteTreeSnapshot(
  client: AccountSyncClient,
  remoteTreeId: string,
  syncKey: string,
  signal?: AbortSignal
): Promise<DownloadedTreeSnapshot> {
  const metadata = await client.getSnapshot(remoteTreeId, signal);
  const envelope = await client.downloadSnapshot(metadata, signal);
  const plaintext = await decryptSyncSnapshot(envelope, syncKey, remoteTreeId, metadata.revision);
  if (plaintext.byteLength > MAX_SYNC_PLAINTEXT_BYTES) throw new Error("Sync snapshot plaintext is too large.");
  const data = await importHeritgArchive(plaintext);
  if (data.trees.length !== 1) throw new Error("Sync snapshot must contain exactly one tree.");
  return { revision: metadata.revision, data };
}
