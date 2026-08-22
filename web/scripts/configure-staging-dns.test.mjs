import { describe, expect, it, vi } from "vitest";

import {
  LEGACY_BETA_DNS,
  STAGING_DNS,
  configureStagingDns,
  removeLegacyBetaDns
} from "./configure-staging-dns.mjs";

const response = (result) => Promise.resolve({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ success: true, result })
});

describe("configure staging DNS", () => {
  it("creates the exact DNS-only CNAME when no record exists", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([]))
      .mockImplementationOnce(() => response({ id: "record-id", ...STAGING_DNS }));

    const result = await configureStagingDns("test-token", fetchMock);
    const createCall = fetchMock.mock.calls[2];
    const body = JSON.parse(createCall[1].body);

    expect(result.action).toBe("created");
    expect(createCall[0]).toContain("/zones/zone-id/dns_records");
    expect(createCall[1].method).toBe("POST");
    expect(body).toMatchObject({
      name: STAGING_DNS.name,
      type: STAGING_DNS.type,
      content: STAGING_DNS.content,
      proxied: false
    });
  });

  it("is idempotent for the exact existing staging record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{
        id: "record-id",
        ...STAGING_DNS,
        content: `${STAGING_DNS.content}.`
      }]));

    await expect(configureStagingDns("test-token", fetchMock))
      .resolves.toMatchObject({ action: "unchanged" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to replace a conflicting staging record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{
        id: "record-id",
        type: "A",
        name: STAGING_DNS.name,
        content: "192.0.2.1",
        proxied: false
      }]));

    await expect(configureStagingDns("test-token", fetchMock))
      .rejects.toThrow("refusing to replace");
  });

  it("removes only the exact legacy beta record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{ id: "beta-record", ...LEGACY_BETA_DNS }]))
      .mockImplementationOnce(() => response({ id: "beta-record" }));

    await expect(removeLegacyBetaDns("test-token", fetchMock))
      .resolves.toMatchObject({ action: "removed" });
    expect(fetchMock.mock.calls[2][0]).toContain("/dns_records/beta-record");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("refuses to remove a changed beta record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{
        id: "beta-record",
        ...LEGACY_BETA_DNS,
        content: "unexpected.example.com"
      }]));

    await expect(removeLegacyBetaDns("test-token", fetchMock))
      .rejects.toThrow("refusing to remove");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
