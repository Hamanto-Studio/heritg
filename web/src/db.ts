import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { AppData } from "./types";

const DATABASE_NAME = "heritg";
const DATABASE_VERSION = 1;
const STORE_NAME = "appData";
const STATE_KEY = "state";

interface HeritgDatabase extends DBSchema {
  appData: {
    key: typeof STATE_KEY;
    value: AppData;
  };
}

let databasePromise: Promise<IDBPDatabase<HeritgDatabase>> | undefined;

const database = () => {
  databasePromise ??= openDB<HeritgDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
  return databasePromise;
};

export async function loadAppData(): Promise<AppData | undefined> {
  return (await database()).get(STORE_NAME, STATE_KEY);
}

export async function saveAppData(data: AppData): Promise<void> {
  await (await database()).put(STORE_NAME, data, STATE_KEY);
}

export const loadData = loadAppData;
export const saveData = saveAppData;
