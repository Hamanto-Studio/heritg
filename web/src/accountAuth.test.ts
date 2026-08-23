import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountAuthError,
  GOOGLE_IDENTITY_SCRIPT,
  deleteAccount,
  getAccountSession,
  getLoginMaterial,
  isConservativeEmail,
  loadGoogleIdentity,
  loginWithGoogle,
  logoutAccount,
  maskEmail,
  parseRetryAfterSeconds,
  readCsrfCookie,
<<<<<<< HEAD
  requestEmailLogin,
  verifyEmailLogin,
=======
  requestPasswordlessEmail,
>>>>>>> fcd9ccd (Web: Add Heritg Family plan preview)
  type GoogleIdentity
} from "./accountAuth";

const token = "a".repeat(43);
const state = "b".repeat(43);
const accountId = "c".repeat(22);
const expiresAt = "2026-09-21T10:00:00.000Z";
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("account authentication API", () => {
  it("allocates login material with included credentials and no cache", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ nonce: token, state, expiresAt });
    });

    await expect(getLoginMaterial(undefined, fetchMock)).resolves.toEqual({ nonce: token, state, expiresAt });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/login-nonce", expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error"
    }));
  });

  it("exchanges only the Google proof and allocated nonce state", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ accountId, csrfToken: token, expiresAt });
    });

    await loginWithGoogle("google-proof", { nonce: token, state }, undefined, fetchMock);
    const [, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error("Expected login request options");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init).not.toHaveProperty("origin");
    expect(JSON.parse(String(init.body))).toEqual({ idToken: "google-proof", nonce: token, state });
    expect(init.credentials).toBe("include");
  });

  it("requests an email link with the exact accepted response contract", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "accepted" }, 202));

    await expect(requestEmailLogin("person@example.com", undefined, fetchMock)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/email/request", expect.objectContaining({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ email: "person@example.com" })
    }));

    const expanded = vi.fn(async () => jsonResponse({ status: "accepted", accountExists: true }, 202));
    await expect(requestEmailLogin("person@example.com", undefined, expanded)).rejects.toMatchObject({
      status: 502,
      code: "invalid_response"
    });
  });

  it("verifies only an exact fragment token and strictly parses login results", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ accountId, csrfToken: token, expiresAt });
    });

    await expect(verifyEmailLogin(state, undefined, fetchMock)).resolves.toEqual({ accountId, csrfToken: token, expiresAt });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ token: state });
    expect(init).toEqual(expect.objectContaining({ credentials: "include", cache: "no-store", referrerPolicy: "no-referrer" }));

    await expect(verifyEmailLogin("short", undefined, fetchMock)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires exact email statuses and JSON media types", async () => {
    const acceptedAtWrongStatus = vi.fn(async () => jsonResponse({ status: "accepted" }, 200));
    await expect(requestEmailLogin("person@example.com", undefined, acceptedAtWrongStatus))
      .rejects.toMatchObject({ status: 502, code: "invalid_response" });

    const requestWrongMediaType = vi.fn(async () => new Response(JSON.stringify({ status: "accepted" }), {
      status: 202,
      headers: { "content-type": "text/plain" }
    }));
    await expect(requestEmailLogin("person@example.com", undefined, requestWrongMediaType))
      .rejects.toMatchObject({ status: 502, code: "invalid_response" });

    const login = { accountId, csrfToken: token, expiresAt };
    const verifiedAtWrongStatus = vi.fn(async () => jsonResponse(login, 202));
    await expect(verifyEmailLogin(state, undefined, verifiedAtWrongStatus))
      .rejects.toMatchObject({ status: 502, code: "invalid_response" });

    const verifyWrongMediaType = vi.fn(async () => new Response(JSON.stringify(login), {
      status: 200,
      headers: { "content-type": "text/html" }
    }));
    await expect(verifyEmailLogin(state, undefined, verifyWrongMediaType))
      .rejects.toMatchObject({ status: 502, code: "invalid_response" });
  });

  it("parses Retry-After delta seconds and HTTP dates", () => {
    expect(parseRetryAfterSeconds("45", 0)).toBe(45);
    expect(parseRetryAfterSeconds("Thu, 01 Jan 1970 00:01:00 GMT", 30_000)).toBe(30);
    expect(parseRetryAfterSeconds("invalid", 0)).toBeUndefined();
  });

  it("restores sessions with included credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ accountId, expiresAt });
    });

    await expect(getAccountSession(undefined, fetchMock)).resolves.toEqual({ accountId, expiresAt });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/session", expect.objectContaining({
      method: "GET",
      credentials: "include"
    }));
  });

  it("requests a passwordless email without persisting its address", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ status: "accepted" }, 202);
    });

    await requestPasswordlessEmail("family@example.com", "https://staging.heritg.us/", undefined, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/magic-links", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "family@example.com", returnTo: "https://staging.heritg.us/" })
    }));
  });

  it("logs out with the CSRF header and an empty JSON object", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ status: "logged_out" });
    });

    await logoutAccount(token, undefined, fetchMock);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toEqual(expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token
      }
    }));
  });

  it("deletes the account with the CSRF header", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ status: "deleted" });
    });

    await deleteAccount(token, undefined, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/account", expect.objectContaining({
      method: "DELETE",
      credentials: "include",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token
      }
    }));
  });

  it("rejects malformed or expanded response objects", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ accountId, expiresAt, unexpected: true });
    });
    await expect(getAccountSession(undefined, fetchMock)).rejects.toMatchObject({
      status: 502,
      code: "invalid_response"
    });
  });

  it("returns safe status errors without including proof material", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return jsonResponse({ error: { code: "unauthenticated", message: "Invalid proof" } }, 401);
    });

    const error = await loginWithGoogle("private-google-proof", { nonce: token, state }, undefined, fetchMock)
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AccountAuthError);
    expect(error).toMatchObject({ status: 401, code: "unauthenticated" });
    expect(String(error)).not.toContain("private-google-proof");
    expect(String(error)).not.toContain(token);
  });
});

describe("account browser boundaries", () => {
  it("validates and masks email conservatively", () => {
    expect(isConservativeEmail("person@example.com")).toBe(true);
    expect(isConservativeEmail(" person@example.com ")).toBe(false);
    expect(isConservativeEmail("person@example")).toBe(false);
    expect(isConservativeEmail("person..name@example.com")).toBe(false);
    expect(maskEmail("person@example.com")).toBe("p***@example.com");
    expect(maskEmail("invalid")).toBeUndefined();
  });

  it("reads only exact valid CSRF cookie names", () => {
    expect(readCsrfCookie(`other=x; __Host-heritg_csrf=${token}`)).toBe(token);
    expect(readCsrfCookie(`heritg_csrf=${token}`)).toBe(token);
    expect(readCsrfCookie(`prefix_heritg_csrf=${token}`)).toBeUndefined();
    expect(readCsrfCookie("__Host-heritg_csrf=short")).toBeUndefined();
    expect(readCsrfCookie("__Host-heritg_csrf=%ZZ")).toBeUndefined();
  });

  it("removes a failed script and shares the successful retry between callers", async () => {
    delete window.google;
    vi.useFakeTimers();
    const stalled = loadGoogleIdentity();
    const stalledRejection = expect(stalled).rejects.toMatchObject({ code: "identity_unavailable" });
    await vi.advanceTimersByTimeAsync(10_000);
    await stalledRejection;
    vi.useRealTimers();
    expect(document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)).toBeNull();

    const failed = loadGoogleIdentity();
    const failedScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    failedScript?.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toMatchObject({ code: "identity_unavailable" });
    expect(failedScript?.isConnected).toBe(false);

    const retry = loadGoogleIdentity();
    const concurrent = loadGoogleIdentity();
    expect(concurrent).toBe(retry);

    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    expect(script?.async).toBe(true);
    expect(script?.src).toBe(GOOGLE_IDENTITY_SCRIPT);

    const identity = {
      accounts: { id: { initialize: vi.fn(), renderButton: vi.fn(), disableAutoSelect: vi.fn() } }
    } as unknown as GoogleIdentity;
    window.google = identity;
    script?.dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(identity);
  });
});
