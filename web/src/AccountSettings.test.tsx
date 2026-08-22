import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "./AccountSettings";
import { GOOGLE_IDENTITY_SCRIPT, type GoogleIdentity } from "./accountAuth";
import { createTranslator } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const token = "a".repeat(43);
const state = "b".repeat(43);

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
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
  it("loads Google Identity only after the user prepares sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session")) {
        return new Response(JSON.stringify({
          error: { code: "unauthenticated", message: "Authentication required" }
        }), { status: 401 });
      }
      if (String(input).endsWith("/google")) {
        return new Response(JSON.stringify({
          accountId: "c".repeat(22),
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
        />
      );
    });

    expect(document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)).toBeNull();
    const prepare = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Set up Google sign-in"));
    expect(prepare).toBeDefined();

    await act(async () => {
      prepare?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    expect(script).not.toBeNull();

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

    await act(async () => {
      root?.render(
        <AccountSettings
          googleClientId="staging.apps.googleusercontent.com"
          language="id"
          t={createTranslator("id")}
        />
      );
    });
    expect(renderButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ locale: "id" }));

    const callback = initialize.mock.calls[0]?.[0]?.callback as ((value: { credential: string }) => void) | undefined;
    await act(async () => {
      callback?.({ credential: "google-proof" });
      callback?.({ credential: "replayed-proof" });
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/google"))).toHaveLength(1);
    expect(container.textContent).toContain("Sudah masuk");
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
      .find((button) => button.textContent?.includes("Set up Google sign-in"));
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
      root?.render(<AccountSettings language="en" t={createTranslator("en")} />);
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
    expect(container.textContent).toContain("Set up Google sign-in");
  });
});
