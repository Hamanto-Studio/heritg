import { describe, expect, it, vi } from "vitest";

import { STAGING_DNS, configureStagingDns } from "./configure-staging-dns.mjs";

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
      .mockImplementationOnce(() => response({ id: "record-id" }));

    const result = await configureStagingDns("test-token", fetchMock);
    const createCall = fetchMock.mock.calls[2];
    const body = JSON.parse(createCall[1].body);

    expect(result.action).toBe("created");
    expect(body).toMatchObject({
      name: STAGING_DNS.name,
      type: "CNAME",
      content: STAGING_DNS.content,
      proxied: false
    });
  });

  it("is idempotent for the exact existing record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{ ...STAGING_DNS, content: `${STAGING_DNS.content}.` }]));

    await expect(configureStagingDns("test-token", fetchMock))
      .resolves.toMatchObject({ action: "unchanged" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to replace a conflicting record", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([{ id: "zone-id" }]))
      .mockImplementationOnce(() => response([{
        type: "A",
        name: STAGING_DNS.name,
        content: "192.0.2.1",
        proxied: false
      }]));

    await expect(configureStagingDns("test-token", fetchMock)).rejects.toThrow("refusing to replace");
  });
});
