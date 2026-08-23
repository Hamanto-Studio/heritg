import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountAuthError, verifyEmailLogin, type LoginResult } from "./accountAuth";
import { EmailAuthCallback, prepareEmailCallback } from "./EmailAuthCallback";
import { createTranslator } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const token = "a".repeat(43);
const result: LoginResult = {
  accountId: "c".repeat(22),
  csrfToken: "b".repeat(43),
  expiresAt: "2026-09-23T10:10:00.000Z"
};
let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  root = undefined;
  container = undefined;
});

const mount = async (verification?: Promise<LoginResult>, language: "en" | "id" = "en") => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<EmailAuthCallback onContinue={vi.fn()} t={createTranslator(language)} verification={verification} />);
  });
};

describe("email authentication callback", () => {
  it("scrubs an exact fragment before verifying once and shows success", async () => {
    const replaceState = vi.fn();
    const entry = prepareEmailCallback({ hash: `#token=${token}`, pathname: "/auth/email" }, { replaceState, state: null });
    expect(entry).toEqual({ isCallback: true, token });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/email");

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input; void _init;
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const verification = verifyEmailLogin(entry.token!, undefined, fetchMock);
    await mount(verification);
    await act(async () => verification);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain("You are signed in");
    expect(container?.textContent).toContain("Open Account settings");
    await act(async () => root?.render(
      <EmailAuthCallback onContinue={vi.fn()} t={createTranslator("en")} verification={verification} />
    ));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts and canonicalizes both callback path forms", () => {
    for (const pathname of ["/auth/email", "/auth/email/"]) {
      const replaceState = vi.fn();
      expect(prepareEmailCallback(
        { hash: `#token=${token}`, pathname },
        { replaceState, state: null }
      )).toEqual({ isCallback: true, token });
      expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/email");
    }
  });

  it("scrubs malformed fragments on callback paths but ignores malformed paths", async () => {
    const replaceState = vi.fn();
    expect(prepareEmailCallback(
      { hash: `#token=${token}&next=/`, pathname: "/auth/email/" },
      { replaceState, state: null }
    )).toEqual({ isCallback: true, token: undefined });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/email");

    replaceState.mockClear();
    expect(prepareEmailCallback(
      { hash: `#token=${token}`, pathname: "/auth/email/extra" },
      { replaceState, state: null }
    )).toEqual({ isCallback: false });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/email/extra");

    await mount();
    expect(container?.textContent).toContain("expired or invalid");
    expect(container?.textContent).not.toContain(token);
  });

  it("presents only backend 401 as an expired, invalid, or replayed link", async () => {
    await mount(Promise.reject(new AccountAuthError(401, "unauthenticated")));
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("expired or invalid");
  });

  it.each([403, 404, 410, 500])("presents backend %i as an operational error", async (status) => {
    await mount(Promise.reject(new AccountAuthError(status, "service_unavailable")));
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("Sign-in could not be completed");
  });

  it("renders Indonesian callback copy when selected", async () => {
    await mount(Promise.resolve(result), "id");
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("Anda sudah masuk");
  });

  it("shows safe verification errors and ignores completion after unmount", async () => {
    let rejectVerification: ((error: unknown) => void) | undefined;
    const verification = new Promise<LoginResult>((_resolve, reject) => {
      rejectVerification = reject;
    });
    await mount(verification);
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => rejectVerification?.(new Error("network")));
    expect(container?.textContent).toBe("");

    container?.remove();
    container = undefined;
    await mount(Promise.reject(new Error("network")));
    await act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Sign-in could not be completed");
  });
});
