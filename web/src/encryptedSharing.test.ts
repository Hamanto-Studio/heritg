// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { exportCanonicalHeritgArchive, importHeritgArchive, sharedViewFor } from "./heritgArchive";
import {
  createEncryptedShare,
  encryptedShareTestHelpers,
  loadEncryptedShare,
  parseEncryptedShareLocation,
  prepareEncryptedShareData,
  SHARE_ENVELOPE_VERSION,
  ShareDecryptionError,
  SharePasswordRequiredError,
  sharePasswordMeetsRequirements,
  sharePasswordRequirements
} from "./encryptedSharing";
import type { AppData } from "./types";

const shareId = "AAECAwQFBgcICQoLDA0ODw";

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

describe("password-protected share protocol", () => {
  it("removes unchecked personal details before encryption", async () => {
    const source = structuredClone(syntheticData);
    source.people[0].photoDataUrl = "data:image/png;base64,iVBORw0KGgoBAgM=";
    source.people.push({
      ...source.people[0],
      id: "person-share-partner",
      displayName: "Synthetic Partner",
      birthDate: undefined,
      photoDataUrl: undefined
    });
    source.relationships.push({
      id: "relationship-share-fixture",
      treeId: "tree-share-fixture",
      fromPersonId: "person-share-fixture",
      toPersonId: "person-share-partner",
      kind: "partner",
      subtype: "formerPartner",
      createdAt: "2026-08-03T00:00:00.000Z",
      marriageDate: "2020-01-02",
      divorceDate: "2021-02-03"
    });
    const prepared = prepareEncryptedShareData(source, "tree-share-fixture", {
      birthDates: false,
      relationshipDates: false,
      photos: false,
      ages: true
    }, new Date("2026-08-03T00:00:00.000Z"));

    expect(prepared.data.people[0]).toMatchObject({
      birthDate: undefined,
      photoDataUrl: undefined
    });
    expect(prepared.data.relationships[0]).toMatchObject({
      marriageDate: undefined,
      divorceDate: undefined
    });
    expect(prepared.sharedView.ageByPersonId).toEqual({ "person-share-fixture": 26 });

    const archive = await exportCanonicalHeritgArchive(
      prepared.data,
      "tree-share-fixture",
      "2026-08-03T00:00:00.000Z",
      { sharedView: prepared.sharedView }
    );
    const restored = await importHeritgArchive(archive);
    expect(restored.people[0]).toMatchObject({ birthDate: undefined, photoDataUrl: undefined });
    expect(restored.relationships[0]?.marriageDate).toBeUndefined();
    expect(restored.relationships[0]?.divorceDate).toBeUndefined();
    expect(sharedViewFor(restored)?.ageByPersonId).toEqual({ "person-share-fixture": 26 });
  });

  it("rejects legacy fragment-key links before contacting the API", () => {
    expect(parseEncryptedShareLocation(`/s/${shareId}`, "")).toEqual({ shareId });
    expect(() => parseEncryptedShareLocation(`/s/${shareId}`, "#k=legacy-key"))
      .toThrow(/unsupported legacy key/i);
  });

  it("allocates before encryption and never sends the password", async () => {
    const calls: Array<{ url: string; body?: BodyInit | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body });
      if (String(input) === "/api/v1/share-uploads") {
        return response({
          shareId,
          deletionToken: "A".repeat(43),
          uploadUrl: "https://storage.googleapis.com/synthetic/upload",
          requiredHeaders: {
            "content-type": "application/vnd.heritg.share",
            "x-goog-if-generation-match": "0",
            "x-goog-meta-heritg-envelope": SHARE_ENVELOPE_VERSION,
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
      origin: "https://heritg.us",
      password: "SharePassword123!"
    });

    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/share-uploads",
      "https://storage.googleapis.com/synthetic/upload",
      "/api/v1/share-uploads/complete"
    ]);
    expect(created.url).toBe(`https://heritg.us/s/${shareId}`);
    expect(JSON.stringify(calls)).not.toContain("SharePassword123!");
    expect(JSON.parse(String(calls[0]?.body))).toMatchObject({ envelopeVersion: SHARE_ENVELOPE_VERSION, expiryDays: 30 });
  });

  it("requires a strong password before allocating a new share", async () => {
    expect(sharePasswordMeetsRequirements("Abc12345")).toBe(false);
    expect(sharePasswordMeetsRequirements("Abc1234!")).toBe(true);
    expect(sharePasswordMeetsRequirements("Åbcdef1?")).toBe(true);
    expect(sharePasswordMeetsRequirements("Abc1234")).toBe(false);
    expect(sharePasswordRequirements("lowercase")).toEqual({
      minimumLength: true,
      lowercase: true,
      uppercase: false,
      number: false,
      special: false
    });
    await expect(createEncryptedShare(syntheticData, "tree-share-fixture", { password: "short" }))
      .rejects.toThrow(/at least 8 characters/i);
  });

  it("requires the password to decrypt a new share and never sends it to the service", async () => {
    const archive = await exportCanonicalHeritgArchive(syntheticData, "tree-share-fixture");
    const decomposedPassword = "Cafe\u0301Tree1";
    const composedPassword = "Caf\u00e9Tree1";
    const envelope = await encryptedShareTestHelpers.encryptArchive(archive, shareId, decomposedPassword);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/")
      ? response({
        downloadUrl: "https://storage.googleapis.com/synthetic/password-envelope",
        downloadExpiresAt: "2026-08-03T00:05:00.000Z",
        envelopeVersion: SHARE_ENVELOPE_VERSION,
        ciphertextBytes: envelope.byteLength,
        shareExpiresAt: "2026-09-02T00:00:00.000Z"
      })
      : new Response(envelope.slice().buffer as ArrayBuffer));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    await expect(loadEncryptedShare(`/s/${shareId}`, "", fetchImpl))
      .rejects.toBeInstanceOf(SharePasswordRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(loadEncryptedShare(`/s/${shareId}`, "", fetchImpl, undefined, "WrongPassword123"))
      .rejects.toBeInstanceOf(ShareDecryptionError);
    const loaded = await loadEncryptedShare(`/s/${shareId}`, "", fetchImpl, undefined, composedPassword);
    expect(loaded.data.trees[0]?.title).toBe("Synthetic Share Fixture");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(decomposedPassword);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(composedPassword);
  });

  it("revokes an allocation when its encrypted upload fails", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/v1/share-uploads") {
        return response({
          shareId,
          deletionToken: "A".repeat(43),
          uploadUrl: "https://storage.googleapis.com/synthetic/upload",
          requiredHeaders: { "content-type": "application/vnd.heritg.share" },
          shareExpiresAt: "2026-09-02T00:00:00.000Z"
        }, 201);
      }
      if (url.includes("storage.googleapis.com")) return new Response(null, { status: 503 });
      if (url === "/api/v1/share-revocations") return response({});
      return response({}, 500);
    }) as unknown as typeof fetch;

    await expect(createEncryptedShare(syntheticData, "tree-share-fixture", { fetchImpl, password: "SharePassword123!" }))
      .rejects.toThrow(/upload was rejected/i);
    expect(calls).toEqual([
      "/api/v1/share-uploads",
      "https://storage.googleapis.com/synthetic/upload",
      "/api/v1/share-revocations"
    ]);
  });
});
