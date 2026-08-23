import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  decryptAppData,
  decryptLocalValue,
  encryptAppData,
  encryptLocalValue,
  generateLocalEncryptionKey,
  isEncryptedAppData,
  type EncryptedAppData,
  type EncryptedLocalValue
} from "./cryptoStorage";
import type { AppData } from "./types";

const DATABASE_NAME = "heritg";
const DATABASE_VERSION = 4;
const STORE_NAME = "appData";
const STATE_KEY = "state";
const KEY_STORE_NAME = "encryptionKeys";
const LOCAL_KEY = "localDataKey";
const SHARE_STORE_NAME = "shareManagement";
const SHARE_STATE_KEY = "records";
const SHARE_CONTEXT = "heritg:share-management:v1";
const SHARE_LIMIT_STORE_NAME = "shareLimit";
const SHARE_SLOT_KEY = "active";
const SHARE_RESERVATION_MS = 15 * 60 * 1000;

export interface ManagedShare {
  shareId: string;
  deletionToken: string;
  treeId: string;
  treeTitle: string;
  createdAt: string;
  expiresAt: string | null;
}

type ShareSlot =
  | { state: "reserved"; token: string; reservedUntil: string }
  | { state: "active"; expiresAt: string | null };

interface HeritgDatabase extends DBSchema {
  appData: {
    key: typeof STATE_KEY;
    value: AppData | EncryptedAppData;
  };
  encryptionKeys: {
    key: typeof LOCAL_KEY;
    value: CryptoKey;
  };
  shareManagement: {
    key: typeof SHARE_STATE_KEY;
    value: EncryptedLocalValue;
  };
  shareLimit: {
    key: typeof SHARE_SLOT_KEY;
    value: ShareSlot;
  };
}

let databasePromise: Promise<IDBPDatabase<HeritgDatabase>> | undefined;
let encryptionKeyPromise: Promise<CryptoKey> | undefined;

const database = () => {
  databasePromise ??= openDB<HeritgDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SHARE_LIMIT_STORE_NAME)) {
        db.createObjectStore(SHARE_LIMIT_STORE_NAME);
      }
    }
  });
  return databasePromise;
};

const encryptionKey = () => {
  encryptionKeyPromise ??= database().then(async (db) => {
    const stored = await db.get(KEY_STORE_NAME, LOCAL_KEY);
    if (stored) return stored;
    const generated = await generateLocalEncryptionKey();
    await db.put(KEY_STORE_NAME, generated, LOCAL_KEY);
    return generated;
  });
  return encryptionKeyPromise;
};

export async function loadAppData(): Promise<AppData | undefined> {
  const stored = await (await database()).get(STORE_NAME, STATE_KEY);
  if (!stored) return undefined;
  if (!isEncryptedAppData(stored)) return stored;
  return decryptAppData(stored, await encryptionKey());
}

export async function saveAppData(data: AppData): Promise<void> {
  const encrypted = await encryptAppData(data, await encryptionKey());
  await (await database()).put(STORE_NAME, encrypted, STATE_KEY);
}

const shareIdPattern = /^[A-Za-z0-9_-]{22}$/u;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

const validManagedShare = (value: unknown): value is ManagedShare => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ManagedShare>;
  return typeof item.shareId === "string" && shareIdPattern.test(item.shareId) &&
    typeof item.deletionToken === "string" && tokenPattern.test(item.deletionToken) &&
    typeof item.treeId === "string" && Boolean(item.treeId) &&
    typeof item.treeTitle === "string" && Boolean(item.treeTitle) &&
    typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) &&
    (item.expiresAt === null || (typeof item.expiresAt === "string" && Number.isFinite(Date.parse(item.expiresAt))));
};

const activeExpiry = (records: readonly ManagedShare[]) => {
  if (!records.length) return undefined;
  if (records.some((record) => record.expiresAt === null)) return null;
  return records.reduce((latest, record) => record.expiresAt! > latest ? record.expiresAt! : latest, "");
};

const syncManagedShareSlot = async (records: readonly ManagedShare[], now = new Date()) => {
  const db = await database();
  const transaction = db.transaction(SHARE_LIMIT_STORE_NAME, "readwrite");
  const store = transaction.objectStore(SHARE_LIMIT_STORE_NAME);
  const expiry = activeExpiry(records);
  if (expiry !== undefined) {
    await store.put({ state: "active", expiresAt: expiry }, SHARE_SLOT_KEY);
  } else {
    const current = await store.get(SHARE_SLOT_KEY);
    if (!current || current.state === "active" || Date.parse(current.reservedUntil) <= now.getTime()) {
      await store.delete(SHARE_SLOT_KEY);
    }
  }
  await transaction.done;
};

export async function loadManagedShares(now = new Date()): Promise<ManagedShare[]> {
  const db = await database();
  const stored = await db.get(SHARE_STORE_NAME, SHARE_STATE_KEY);
  if (!stored || !isEncryptedAppData(stored)) return [];
  const decoded = await decryptLocalValue<unknown>(stored, await encryptionKey(), SHARE_CONTEXT);
  if (!Array.isArray(decoded)) return [];
  const active = decoded.filter(validManagedShare).filter((item) =>
    item.expiresAt === null || Date.parse(item.expiresAt) > now.getTime()
  );
  if (active.length !== decoded.length) await saveManagedShares(active);
  else await syncManagedShareSlot(active, now);
  return active.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveManagedShares(records: readonly ManagedShare[]): Promise<void> {
  if (!records.every(validManagedShare)) throw new Error("Share management data is invalid.");
  const encrypted = await encryptLocalValue(records, await encryptionKey(), SHARE_CONTEXT);
  const db = await database();
  const transaction = db.transaction([SHARE_STORE_NAME, SHARE_LIMIT_STORE_NAME], "readwrite");
  await transaction.objectStore(SHARE_STORE_NAME).put(encrypted, SHARE_STATE_KEY);
  const limitStore = transaction.objectStore(SHARE_LIMIT_STORE_NAME);
  const expiry = activeExpiry(records);
  if (expiry === undefined) await limitStore.delete(SHARE_SLOT_KEY);
  else await limitStore.put({ state: "active", expiresAt: expiry }, SHARE_SLOT_KEY);
  await transaction.done;
}

export async function reserveManagedShareSlot(now = new Date()): Promise<string | undefined> {
  const db = await database();
  const transaction = db.transaction(SHARE_LIMIT_STORE_NAME, "readwrite");
  const store = transaction.objectStore(SHARE_LIMIT_STORE_NAME);
  const current = await store.get(SHARE_SLOT_KEY);
  const blocked = current?.state === "active"
    ? current.expiresAt === null || Date.parse(current.expiresAt) > now.getTime()
    : current?.state === "reserved" && Date.parse(current.reservedUntil) > now.getTime();
  if (blocked) {
    await transaction.done;
    return undefined;
  }
  const token = crypto.randomUUID();
  await store.put({
    state: "reserved",
    token,
    reservedUntil: new Date(now.getTime() + SHARE_RESERVATION_MS).toISOString()
  }, SHARE_SLOT_KEY);
  await transaction.done;
  return token;
}

export async function releaseManagedShareSlot(token: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction(SHARE_LIMIT_STORE_NAME, "readwrite");
  const store = transaction.objectStore(SHARE_LIMIT_STORE_NAME);
  const current = await store.get(SHARE_SLOT_KEY);
  if (current?.state === "reserved" && current.token === token) {
    await store.delete(SHARE_SLOT_KEY);
  }
  await transaction.done;
}

export const loadData = loadAppData;
export const saveData = saveAppData;
