import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptSyncSnapshot, encryptSyncSnapshot } from "./accountSyncCrypto";

const treeId = "A".repeat(22);
const syncKey = "A".repeat(43);
const plaintext = new TextEncoder().encode("interoperable snapshot");
const vectorHex = "48544753594e3031000102030405060708090a0be1a547377292ff9cb01930899823ad62351cdbf2d0e9e0c93ace70e27100ac815e5ba1477661";

const hex = (bytes: Uint8Array): string => [...bytes]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

afterEach(() => vi.restoreAllMocks());

describe("HTGSYN01", () => {
  it("matches a deterministic AES-256-GCM interoperability vector", async () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      bytes.set(Uint8Array.from({ length: 12 }, (_, index) => index));
      return array;
    });

    const envelope = await encryptSyncSnapshot(plaintext, syncKey, treeId, 7);

    expect(hex(envelope)).toBe(vectorHex);
    expect(hex(await decryptSyncSnapshot(envelope, syncKey, treeId, 7))).toBe(hex(plaintext));
  });

  it("rejects ciphertext tampering and tree or revision mismatches", async () => {
    const envelope = await encryptSyncSnapshot(plaintext, syncKey, treeId, 7);
    const tampered = envelope.slice();
    tampered[tampered.length - 1] ^= 1;

    await expect(decryptSyncSnapshot(tampered, syncKey, treeId, 7)).rejects.toThrow(/authentication/i);
    await expect(decryptSyncSnapshot(envelope, syncKey, "B".repeat(22), 7)).rejects.toThrow(/authentication/i);
    await expect(decryptSyncSnapshot(envelope, syncKey, treeId, 8)).rejects.toThrow(/authentication/i);
  });

  it("uses a fresh 12-byte IV for every encryption", async () => {
    const first = await encryptSyncSnapshot(plaintext, syncKey, treeId, 1);
    const second = await encryptSyncSnapshot(plaintext, syncKey, treeId, 1);

    expect(first.slice(8, 20)).not.toEqual(second.slice(8, 20));
    expect(hex(first.slice(0, 8))).toBe(hex(new TextEncoder().encode("HTGSYN01")));
  });

  it("rejects malformed keys, IDs, revisions, markers, and sizes", async () => {
    await expect(encryptSyncSnapshot(plaintext, "short", treeId, 1)).rejects.toThrow(/key/i);
    await expect(encryptSyncSnapshot(plaintext, syncKey, "bad", 1)).rejects.toThrow(/binding/i);
    await expect(encryptSyncSnapshot(plaintext, syncKey, treeId, 0)).rejects.toThrow(/binding/i);
    await expect(decryptSyncSnapshot(new Uint8Array(35), syncKey, treeId, 1)).rejects.toThrow(/envelope/i);
    const wrongMarker = new Uint8Array(36);
    await expect(decryptSyncSnapshot(wrongMarker, syncKey, treeId, 1)).rejects.toThrow(/envelope/i);
  });
});
