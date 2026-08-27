import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "./AccountSettings";
import { GOOGLE_IDENTITY_SCRIPT, type GoogleIdentity } from "./accountAuth";
import { createTranslator } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const token = "a".repeat(43);
const state = "b".repeat(43);
const profile = { name: "Test User", email: "person@example.com" };

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const mount = async (language: "en" | "id" = "en") => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AccountSettings
        googleClientId="123456789012-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com"
        language={language}
        t={createTranslator(language)}
      />
    );
  });
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
};

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  vi.useRealTimers();
  container?.remove();
  document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)?.remove();
  delete window.google;
  document.cookie = "heritg_csrf=; Max-Age=0; Path=/";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  root = undefined;
  container = undefined;
});

describe("account settings", () => {
  it("prepares Google automatically and renders the accepted profile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/google")) {
        return new Response(JSON.stringify({
          accountId: "c".repeat(22),
          ...profile,
          csrfToken: token,
          expiresAt: "2026-09-23T10:10:00.000Z"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        nonce: token,
        state,
        expiresAt: "2026-08-23T10:10:00.000Z"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await mount();
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    expect(script).not.toBeNull();
    expect(container?.querySelector('input[type="email"]')).toBeNull();
    expect(container?.textContent).not.toContain("Continue with email");

    const initialize = vi.fn();
    const renderButton = vi.fn();
    window.google = {
      accounts: { id: { initialize, renderButton, disableAutoSelect: vi.fn() } }
    } as GoogleIdentity;
    await act(async () => {
      script?.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      nonce: token,
      auto_select: false,
      ux_mode: "popup"
    }));
    expect(renderButton).toHaveBeenCalledOnce();

    const callback = initialize.mock.calls[0]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => {
      callback?.({ credential: "google-proof" });
      callback?.({ credential: "replayed-proof" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/google"))).toHaveLength(1);
    expect(container?.textContent).toContain("Signed in");
    expect(container?.textContent).toContain(profile.name);
    expect(container?.textContent).toContain(profile.email);
  });

  it("retries with fresh login material and resets Google Identity", async () => {
    let googleRequests = 0;
    let loginMaterialRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/google")) {
        googleRequests += 1;
        return googleRequests === 1
          ? new Response(JSON.stringify({ error: { code: "service_unavailable", message: "Retry" } }), { status: 503 })
          : new Response(JSON.stringify({
            accountId: "c".repeat(22),
            ...profile,
            csrfToken: token,
            expiresAt: "2026-09-23T10:10:00.000Z"
          }), { status: 200 });
      }
      loginMaterialRequests += 1;
      return new Response(JSON.stringify({
        nonce: (loginMaterialRequests === 1 ? "d" : "e").repeat(43),
        state: (loginMaterialRequests === 1 ? "f" : "g").repeat(43),
        expiresAt: "2026-08-23T10:10:00.000Z"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const initialize = vi.fn();
    const renderButton = vi.fn();
    const cancel = vi.fn();
    const disableAutoSelect = vi.fn();

    await mount();
    window.google = { accounts: { id: { initialize, renderButton, cancel, disableAutoSelect } } } as GoogleIdentity;
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    await act(async () => {
      script?.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    const firstCallback = initialize.mock.calls[0]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => {
      firstCallback?.({ credential: "first-proof" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container?.textContent).toContain("Google sign-in could not be prepared");

    const retry = [...(container?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes("Try again"));
    await act(async () => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    await act(async () => Promise.resolve());

    expect(cancel).toHaveBeenCalledOnce();
    expect(disableAutoSelect).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(renderButton).toHaveBeenCalledTimes(2);
    expect(initialize.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ nonce: "d".repeat(43) }));
    expect(initialize.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ nonce: "e".repeat(43) }));

    const secondCallback = initialize.mock.calls[1]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => {
      secondCallback?.({ credential: "second-proof" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container?.textContent).toContain("Signed in");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/login-nonce"))).toHaveLength(2);
  });

  it("ignores a Google credential delivered after unmount", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({
      nonce: token,
      state,
      expiresAt: "2026-08-23T10:10:00.000Z"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await mount();
    const initialize = vi.fn();
    window.google = {
      accounts: { id: { initialize, renderButton: vi.fn(), disableAutoSelect: vi.fn() } }
    } as GoogleIdentity;
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    await act(async () => {
      script?.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    const callback = initialize.mock.calls[0]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => root?.unmount());
    root = undefined;
    callback?.({ credential: "late-google-proof" });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/google"))).toHaveLength(0);
  });

  it("restores profile fields and requires confirmation before account deletion", async () => {
    document.cookie = `heritg_csrf=${token}; Path=/`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session")) {
        return new Response(JSON.stringify({
          accountId: "c".repeat(22),
          ...profile,
          expiresAt: "2026-09-23T10:10:00.000Z"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await mount();
    expect(container?.textContent).toContain(profile.name);
    expect(container?.textContent).toContain(profile.email);

    const deleteButton = [...(container?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.includes("Delete account"));
    await act(async () => deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container?.textContent).toContain("Your local family tree is not deleted");

    const confirmButton = [...(container?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.includes("Permanently delete"));
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/account", expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ "x-csrf-token": token })
    }));
    expect(container?.querySelector('input[type="email"]')).toBeNull();
  });
});
