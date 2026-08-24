import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings, createEmailCooldownState } from "./AccountSettings";
import { GOOGLE_IDENTITY_SCRIPT, type GoogleIdentity } from "./accountAuth";
import { createTranslator } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const token = "a".repeat(43);
const state = "b".repeat(43);

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  window.turnstile = {
    render: vi.fn((_element, options) => {
      options.callback("verified-human");
      return "test-widget";
    }),
    remove: vi.fn()
  };
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  vi.useRealTimers();
  container?.remove();
  document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)?.remove();
  delete window.google;
  delete window.turnstile;
  document.cookie = "heritg_csrf=; Max-Age=0; Path=/";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  root = undefined;
  container = undefined;
});

describe("account settings", () => {
  it("hides email login when staging has no Turnstile configuration", () => {
    const markup = renderToStaticMarkup(<AccountSettings googleClientId="staging.apps.googleusercontent.com" language="en" t={createTranslator("en")} />);
    expect(markup).toContain("Continue with Google");
    expect(markup).not.toContain("Continue with email");
  });

  it("preloads Google Identity so the first Google button click starts sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(input).endsWith("/session")) {
        return new Response(JSON.stringify({
          error: { code: "unauthenticated", message: "Authentication required" }
        }), { status: 401 });
      }
      if (String(input).endsWith("/google")) {
        return new Response(JSON.stringify({
          accountId: "c".repeat(22),
          name: "Test User",
          email: "person@example.com",
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

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <AccountSettings
          googleClientId="staging.apps.googleusercontent.com"
          language="en"
          t={createTranslator("en")}
          turnstileSiteKey="test-site-key"
        />
      );
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    expect(script).not.toBeNull();
    expect(container.querySelector('[aria-label="Continue with Google"]')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();

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
      client_id: "staging.apps.googleusercontent.com",
      nonce: token,
      auto_select: false,
      ux_mode: "popup"
    }));
    expect(renderButton).toHaveBeenCalledOnce();
    expect(renderButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ text: "continue_with" }));

    await act(async () => {
      root?.render(
        <AccountSettings
          googleClientId="staging.apps.googleusercontent.com"
          language="id"
          t={createTranslator("id")}
          turnstileSiteKey="test-site-key"
        />
      );
    });
    expect(container.textContent).toContain("Lanjut pakai email");
    expect(renderButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ locale: "id" }));

    const callback = initialize.mock.calls[0]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => {
      callback?.({ credential: "google-proof" });
      callback?.({ credential: "replayed-proof" });
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/google"))).toHaveLength(1);
    expect(container.textContent).toContain("Udah login");
    expect(container.textContent).toContain("Test User");
    expect(container.textContent).toContain("person@example.com");
  });

  it("ignores a GIS credential delivered after unmount", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({
        nonce: token,
        state,
        expiresAt: "2026-08-23T10:10:00.000Z"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <AccountSettings
          googleClientId="staging.apps.googleusercontent.com"
          language="en"
          t={createTranslator("en")}
        />
      );
    });
    const prepare = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with Google"));
    await act(async () => {
      prepare?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

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

  it("requires confirmation before permanently deleting an account", async () => {
    document.cookie = `heritg_csrf=${token}; Path=/`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session")) {
        return new Response(JSON.stringify({
          accountId: "c".repeat(22),
          name: "Test User",
          email: "person@example.com",
          expiresAt: "2026-09-23T10:10:00.000Z"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings googleClientId="staging.apps.googleusercontent.com" language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });

    const deleteButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Delete account"));
    await act(async () => deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Your local family tree is not deleted");

    const confirmButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Permanently delete"));
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/account", expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ "x-csrf-token": token })
    }));
    expect(container.textContent).toContain("Continue with email");
  });

  it("shows one sign-in method at a time and keeps Google primary", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/login-nonce")
      ? new Response(JSON.stringify({
        nonce: token,
        state,
        expiresAt: "2026-08-23T10:10:00.000Z"
      }), { status: 200 })
      : new Response(JSON.stringify({
        error: { code: "unauthenticated", message: "Authentication required" }
      }), { status: 401 })));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings googleClientId="staging.apps.googleusercontent.com" language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });

    expect(container.querySelector('[aria-label="Continue with Google"]')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelectorAll(".account-method-divider")).toHaveLength(1);
    const chooseEmail = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with email"));
    await act(async () => chooseEmail?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelectorAll(".account-method-divider")).toHaveLength(1);

    const chooseGoogle = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with Google"));
    await act(async () => chooseGoogle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).toContain("Continue with email");
  });

  it("uses one generic email flow, rejects invalid input, and enforces resend cooldown", async () => {
    vi.useFakeTimers();
    const cooldownState = createEmailCooldownState();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(input).endsWith("/email/request")) {
        return new Response(JSON.stringify({ status: "accepted" }), {
          status: 202,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        error: { code: "unauthenticated", message: "Authentication required" }
      }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings cooldownState={cooldownState} language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });

    const chooseEmail = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with email"));
    await act(async () => chooseEmail?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = container.querySelector<HTMLInputElement>('input[type="email"]');
    const form = container.querySelector("form");
    if (!input || !form) throw new Error("Expected email form");
    expect(input.labels?.[0]?.textContent).toContain("Email address");
    expect(container.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
    const setInputValue = (value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => {
      setInputValue("invalid");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("Enter a valid email address");
    expect(fetchMock.mock.calls.filter(([request]) => String(request).endsWith("/email/request"))).toHaveLength(0);

    await act(async () => {
      setInputValue("new-or-existing@example.com");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    const emailRequests = fetchMock.mock.calls.filter(([request]) => String(request).endsWith("/email/request"));
    expect(emailRequests).toHaveLength(1);
    expect(JSON.parse(String(emailRequests[0]?.[1]?.body))).toEqual({
      email: "new-or-existing@example.com",
      turnstileToken: "verified-human"
    });
    expect(container.textContent).toContain("n***@example.com");
    expect(container.textContent).not.toContain("new-or-existing@example.com");

    const resend = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Resend in"));
    expect(resend?.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(resend?.disabled).toBe(false);
    await act(async () => {
      resend?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.filter(([request]) => String(request).endsWith("/email/request"))).toHaveLength(2);

    await act(async () => root?.unmount());
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings cooldownState={cooldownState} language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });
    const remountedChooseEmail = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with email"));
    await act(async () => remountedChooseEmail?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const remountedContinue = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Try again in"));
    expect(remountedContinue?.disabled).toBe(true);
    expect(container.textContent).not.toContain("new-or-existing@example.com");

    vi.setSystemTime(Date.now() + 120_000);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(remountedContinue?.disabled).toBe(false);
  });

  it("uses Retry-After on rate limiting without persisting the email", async () => {
    vi.useFakeTimers();
    const cooldownState = createEmailCooldownState();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/email/request")) {
        return new Response(JSON.stringify({ error: { code: "rate_limited", message: "Wait" } }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "90" }
        });
      }
      return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Required" } }), {
        status: 401
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings cooldownState={cooldownState} language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });
    const chooseEmail = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with email"));
    await act(async () => chooseEmail?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = container.querySelector<HTMLInputElement>('input[type="email"]');
    const form = container.querySelector("form");
    if (!input || !form) throw new Error("Expected email form");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "limited@example.com");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Try again in 90s"));
    expect(retry?.disabled).toBe(true);

    await act(async () => root?.unmount());
    expect(container.textContent).not.toContain("limited@example.com");
    root = createRoot(container);
    await act(async () => {
      root?.render(<AccountSettings cooldownState={cooldownState} language="en" t={createTranslator("en")} turnstileSiteKey="test-site-key" />);
    });
    const remountedChooseEmail = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Continue with email"));
    await act(async () => remountedChooseEmail?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Try again in 90s");
  });
});
