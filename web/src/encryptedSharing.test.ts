// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import fixture from "./fixtures/htgshr01.json";
import {
  createEncryptedShare,
  encryptedShareTestHelpers,
  loadEncryptedShare,
  parseEncryptedShareLocation,
  SHARE_ENVELOPE_VERSION
} from "./encryptedSharing";
import type { AppData } from "./types";

const syntheticData: AppData = {
  version: 1,
  trees: [{
    id: "tree-share-fixture",
    title: "Synthetic Share Fixture",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    lastSelectedPersonId: "person-share-fixture"
  }],
  people: [{
    id: "person-share-fixture",
    treeId: "tree-share-fixture",
    displayName: "Synthetic Person",
    gender: "unspecified",
    createdAt: "2026-08-03T00:00:00.000Z",
    birthDate: "2000-01-01",
    birthDatePrecision: "exact",
    notes: "Synthetic protocol fixture only",
    addressLine: "",
    city: "",
    province: "",
    country: "",
    postalCode: ""
  }],
  relationships: [],
  selectedTreeId: "tree-share-fixture",
  language: "en",
  viewports: { "tree-share-fixture": { scrollX: 0, scrollY: 0, zoom: 1 } }
};

const response = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", ...headers }
});

describe("HTGSHR01 browser protocol", () => {
  it("opens the backend compatibility fixture without persisting its key", async () => {
    const envelope = encryptedShareTestHelpers.base64UrlToBytes(fixture.envelopeBase64Url, fixture.envelopeBytes);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/share-downloads") {
        return response({
          downloadUrl: "https://storage.googleapis.com/synthetic/envelope",
          downloadExpiresAt: "2026-08-03T00:05:00.000Z",
          envelopeVersion: SHARE_ENVELOPE_VERSION,
          ciphertextBytes: fixture.envelopeBytes,
          shareExpiresAt: "2026-09-02T00:00:00.000Z"
        });
      }
      return new Response(envelope.slice().buffer as ArrayBuffer, { status: 200 });
    });

    const loaded = await loadEncryptedShare(
      `/s/${fixture.shareId}`,
      `#k=${fixture.keyBase64Url}`,
      fetchMock as unknown as typeof fetch
    );

    expect(loaded.data.trees[0]?.title).toBe("Synthetic Share Fixture");
    expect(loaded.data.people[0]?.displayName).toBe("Synthetic Person");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(fixture.keyBase64Url);
  });

  it("fails safely for a missing or wrong fragment key", async () => {
    expect(() => parseEncryptedShareLocation(`/s/${fixture.shareId}`, "")).toThrow(/missing/i);
    const wrongKey = "__________________________________________8";
    const envelope = encryptedShareTestHelpers.base64UrlToBytes(fixture.envelopeBase64Url, fixture.envelopeBytes);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/")
      ? response({
        downloadUrl: "https://storage.googleapis.com/synthetic/envelope",
        downloadExpiresAt: "2026-08-03T00:05:00.000Z",
        envelopeVersion: SHARE_ENVELOPE_VERSION,
        ciphertextBytes: fixture.envelopeBytes,
        shareExpiresAt: "2026-09-02T00:00:00.000Z"
      })
      : new Response(envelope.slice().buffer as ArrayBuffer)) as unknown as typeof fetch;
    await expect(loadEncryptedShare(`/s/${fixture.shareId}`, `#k=${wrongKey}`, fetchImpl)).rejects.toThrow(/wrong key|modified/i);
  });

  it("allocates before encryption and never sends the fragment key", async () => {
    const calls: Array<{ url: string; body?: BodyInit | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body });
      if (String(input) === "/api/v1/share-uploads") {
        return response({
          shareId: fixture.shareId,
          deletionToken: fixture.keyBase64Url,
          uploadUrl: "https://storage.googleapis.com/synthetic/upload",
          requiredHeaders: {
            "content-type": "application/vnd.heritg.share",
            "x-goog-if-generation-match": "0",
            "x-goog-meta-heritg-envelope": "HTGSHR01",
            "x-goog-meta-heritg-state": "immutable"
          },
          uploadExpiresAt: "2026-08-03T00:15:00.000Z",
          shareExpiresAt: "2026-09-02T00:00:00.000Z"
        }, 201);
      }
      if (String(input).includes("storage.googleapis.com")) {
        return new Response(null, { status: 200, headers: { "x-goog-generation": "123" } });
      }
      return response({ status: "active", expiresAt: "2026-09-02T00:00:00.000Z" });
    }) as unknown as typeof fetch;

    const created = await createEncryptedShare(syntheticData, "tree-share-fixture", {
      fetchImpl,
      origin: "https://heritgapp.hamanto.com"
    });

    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/share-uploads",
      "https://storage.googleapis.com/synthetic/upload",
      "/api/v1/share-uploads/complete"
    ]);
    expect(created.url).toMatch(new RegExp(`^https://heritgapp\\.hamanto\\.com/s/${fixture.shareId}#k=[A-Za-z0-9_-]{43}$`));
    const key = created.url.split("#k=")[1];
    expect(JSON.stringify(calls)).not.toContain(key);
    expect(JSON.parse(String(calls[0]?.body))).toMatchObject({ envelopeVersion: "HTGSHR01", expiryDays: 30 });
  });
});
