import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  decryptAppData,
  encryptAppData,
  generateLocalEncryptionKey,
  isEncryptedAppData,
  type EncryptedAppData
} from "./cryptoStorage";
import type { AppData } from "./types";

const DATABASE_NAME = "heritg";
const DATABASE_VERSION = 2;
const STORE_NAME = "appData";
const STATE_KEY = "state";
const KEY_STORE_NAME = "encryptionKeys";
const LOCAL_KEY = "localDataKey";

interface HeritgDatabase extends DBSchema {
  appData: {
    key: typeof STATE_KEY;
    value: AppData | EncryptedAppData;
  };
  encryptionKeys: {
    key: typeof LOCAL_KEY;
    value: CryptoKey;
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

export const loadData = loadAppData;
export const saveData = saveAppData;
