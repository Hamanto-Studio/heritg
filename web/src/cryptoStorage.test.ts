import { describe, expect, it } from "vitest";

import {
  decryptAppData,
  encryptAppData,
  generateLocalEncryptionKey,
  isEncryptedAppData
} from "./cryptoStorage";
import type { AppData } from "./types";

const familyData = (): AppData => ({
  version: 1,
  language: "en",
  trees: [],
  people: [],
  relationships: [],
  viewports: {}
});

describe("encrypted browser storage", () => {
  it("round-trips app data with a non-extractable AES-GCM key", async () => {
    const key = await generateLocalEncryptionKey();
    const encrypted = await encryptAppData(familyData(), key);

    expect(key.extractable).toBe(false);
    expect(isEncryptedAppData(encrypted)).toBe(true);
    expect(await decryptAppData(encrypted, key)).toEqual(familyData());
  });

  it("uses a fresh IV and ciphertext for every save", async () => {
    const key = await generateLocalEncryptionKey();
    const first = await encryptAppData(familyData(), key);
    const second = await encryptAppData(familyData(), key);

    expect([...first.iv]).not.toEqual([...second.iv]);
    expect([...new Uint8Array(first.ciphertext)])
      .not.toEqual([...new Uint8Array(second.ciphertext)]);
  });
});
