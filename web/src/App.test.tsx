import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialAppData } from "./domain";

const mocks = vi.hoisted(() => ({ openPaywall: vi.fn(), store: undefined as unknown }));

vi.mock("./store", () => ({ useAppStore: () => mocks.store }));
vi.mock("./TreeSidebar", () => ({ TreeSidebar: () => null }));
vi.mock("./SettingsDialog", () => ({
  SettingsDialog: () => <section data-testid="settings">Account settings</section>
}));
vi.mock("./ProProvider", () => ({
  usePro: () => ({
    account: { status: "signedOut" },
    configured: false,
    error: undefined,
    openPaywall: mocks.openPaywall,
    paywallOpen: false,
    subscription: { status: "unavailable" },
    sync: { enabled: false, pendingChanges: 0, phase: "unavailable" }
  })
}));

import { App } from "./App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  mocks.openPaywall.mockClear();
});

describe("App account settings transition", () => {
  it("opens Settings after email verification even when no local tree exists", async () => {
    const data = createInitialAppData();
    mocks.store = {
      data: { ...data, trees: [], selectedTreeId: undefined },
      actions: {},
      isLoading: false,
      error: null
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<App initialPanel="settings" />));

    expect(container.querySelector('[data-testid="settings"]')?.textContent).toBe("Account settings");
    await act(async () => root.unmount());
  });

  it("opens the Family+ paywall directly from the workspace button", async () => {
    const data = createInitialAppData();
    mocks.store = {
      data: { ...data, trees: [], selectedTreeId: undefined },
      actions: {},
      isLoading: false,
      error: null
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));

    const familyButton = container.querySelector<HTMLButtonElement>('[aria-label="Heritg Family+"]');
    expect(familyButton).not.toBeNull();
    await act(async () => familyButton?.click());
    expect(mocks.openPaywall).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
