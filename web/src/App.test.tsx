import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialAppData } from "./domain";
import type { TreeCanvasProps } from "./ExcalidrawTreeCanvas";

const mocks = vi.hoisted(() => ({ openPaywall: vi.fn(), store: undefined as unknown, canvasProps: undefined as TreeCanvasProps | undefined }));

vi.mock("./TreeCanvas", () => ({ TreeCanvas: (props: TreeCanvasProps) => { mocks.canvasProps = props; return null; } }));

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
  it("shows the view switch beside visibility on an empty canvas with numbered guidance", async () => {
    const data = createInitialAppData();
    data.trees = [{ id: "empty", title: "Empty family", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
    data.selectedTreeId = "empty";
    data.people = [];
    data.relationships = [];
    mocks.store = { data, actions: {}, isLoading: false };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    const tools = container.querySelector('.canvas-view-tools')!;
    const trigger = tools.querySelector<HTMLButtonElement>('.family-view-summary')!;
    expect(tools.querySelector('.canvas-visibility-toggle')).not.toBeNull();
    expect(trigger.textContent).toBe("Full");
    expect(trigger.getAttribute('aria-describedby')).toBe('family-view-onboarding');
    expect([...container.querySelectorAll('.tutorial-step')].map((step) => step.textContent)).toEqual(['1', '2', '3', '4']);
    await act(async () => trigger.click());
    expect(container.querySelector('#family-view-onboarding')).toBeNull();
    expect(container.querySelector('.family-view-empty')?.textContent).toContain('Add a person');
    const focusedButton = tools.querySelector<HTMLButtonElement>('.family-view-switch button')!;
    expect([...tools.querySelectorAll('.family-view-switch button')].map((button) => button.textContent)).toEqual(['Focus', 'Full', 'Fan']);
    await act(async () => focusedButton.click());
    expect(trigger.textContent).toBe('Focus');
    expect(container.querySelector('.family-view-options')).toBeNull();
    await act(async () => tools.querySelector<HTMLButtonElement>('.canvas-visibility-toggle')!.click());
    expect(container.querySelector('.family-view-controls')).toBeNull();
    expect(container.querySelectorAll('.tutorial-step')).toHaveLength(0);
    await act(async () => tools.querySelector<HTMLButtonElement>('.canvas-visibility-toggle')!.click());
    expect(container.querySelector('.family-view-summary')?.textContent).toBe('Focus');
    await act(async () => root.unmount());
  });

  it("keeps expanded family depths across selection and view changes until explicitly reset", async () => {
    const data = createInitialAppData();
    data.trees = [{ id: "tree", title: "Test family", createdAt: "2026-01-01", updatedAt: "2026-01-01", lastSelectedPersonId: "p2" }];
    data.selectedTreeId = "tree";
    data.people = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index}`, treeId: "tree", displayName: `Person ${index}`, gender: "unspecified" as const,
      createdAt: "2026-01-01", birthDatePrecision: "year" as const, notes: "", addressLine: "",
      city: "", province: "", country: "", postalCode: ""
    }));
    data.relationships = data.people.slice(1).map((person, index) => ({
      id: `edge${index}`, treeId: "tree", fromPersonId: index === 4 ? "p1" : `p${index}`, toPersonId: person.id,
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01"
    }));
    mocks.store = { data, actions: { selectPerson: (id?: string) => { data.trees[0].lastSelectedPersonId = id; } }, isLoading: false };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const openMenu = async () => { if (!container.querySelector('.family-view-options')) await act(async () => container.querySelector<HTMLButtonElement>('.family-view-summary')!.click()); };
    const click = async (text: string) => {
      await openMenu();
      await act(async () => {
        const button = [...container.querySelectorAll("button")].find((button) => button.textContent === text || button.getAttribute("aria-label") === text)!;
        button.click();
      });
    };
    const select = async (id: string) => act(async () => {
      mocks.canvasProps!.onSelectPerson(id);
      root.render(<App />);
    });
    await act(async () => root.render(<App />));
    await act(async () => container.querySelector<HTMLButtonElement>('.family-view-summary')!.click());
    await click("More ancestors");
    await click("More descendants");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p2", ancestors: 2, descendants: 2 });
    await select("p2");
    await select("p1");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p1", ancestors: 2, descendants: 2 });
    await act(async () => { mocks.canvasProps!.onDeselectPerson(); root.render(<App />); });
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p1", ancestors: 2, descendants: 2 });
    // Selection can also change through store actions outside the canvas.
    await act(async () => { data.trees[0].lastSelectedPersonId = "p3"; root.render(<App />); });
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p3", ancestors: 2, descendants: 2 });
    await click("Full tree");
    await select("p2");
    await click("Focused family");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p2", ancestors: 2, descendants: 2 });
    const siblings = () => container.querySelector<HTMLInputElement>('.family-siblings-toggle input')!;
    await openMenu();
    expect(siblings().checked).toBe(false);
    await act(async () => siblings().click());
    expect(mocks.canvasProps?.familyFocus?.siblings).toBe(true);
    await select("p0");
    expect(siblings().checked).toBe(true);
    expect(siblings().disabled).toBe(false);
    await select("p2");
    await click("Full tree");
    await click("Focused family");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p2", ancestors: 2, descendants: 2, siblings: true });
    for (const label of ['Fan']) {
      await click(label);
      expect(container.querySelector('.family-explorer')?.getAttribute('aria-label')).toBe(label);
      expect(container.querySelector('.canvas-chart-layer')?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('.canvas-controls')).toBeNull();
      expect(mocks.canvasProps?.people).toHaveLength(6);
      expect(data.people).toHaveLength(6);
    }
    await click("Focused family");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p2", ancestors: 2, descendants: 2, siblings: true });
    expect(container.querySelector(".canvas-chart-layer")?.getAttribute("aria-hidden")).toBe("false");
    expect(container.querySelector(".family-explorer")).toBeNull();
    expect(container.querySelector(".canvas-controls")).not.toBeNull();
    await click("Reset view");
    expect(mocks.canvasProps?.familyFocus).toEqual({ personId: "p2", ancestors: 1, descendants: 1 });
    await act(async () => root.unmount());
  });

  it("preserves the browsing anchor on deselect and clears old limits when returning to the full tree", async () => {
    const data = createInitialAppData();
    data.trees = [{ id: "tree", title: "Test family", createdAt: "2026-01-01", updatedAt: "2026-01-01", lastSelectedPersonId: "person" }];
    data.selectedTreeId = "tree";
    data.people = [{ id: "person", treeId: "tree", displayName: "Person", gender: "unspecified", createdAt: "2026-01-01", birthDatePrecision: "year", notes: "", addressLine: "", city: "", province: "", country: "", postalCode: "" }];
    mocks.store = { data, actions: { selectPerson: (id?: string) => { data.trees[0].lastSelectedPersonId = id; } }, isLoading: false };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const click = async (text: string) => {
      const find = () => [...container.querySelectorAll("button")].find((button) => button.textContent === text || button.getAttribute("aria-label") === text);
      if (!find()) await act(async () => container.querySelector<HTMLButtonElement>('.family-view-summary')!.click());
      await act(async () => find()!.click());
    };
    await act(async () => root.render(<App />));
    expect(mocks.canvasProps?.familyFocus?.personId).toBe("person");
    expect(container.querySelector('.family-view-switch')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('.family-view-summary')!.click());
    await act(async () => { mocks.canvasProps!.onDeselectPerson(); root.render(<App />); });
    expect(mocks.canvasProps?.selectedPersonId).toBeUndefined();
    expect(mocks.canvasProps?.familyFocus?.personId).toBe("person");
    await act(async () => { mocks.canvasProps!.onSelectPerson("person"); root.render(<App />); });
    await click("Full tree");
    await click("Branch depth");
    const select = container.querySelector('.generation-popover select') as HTMLSelectElement;
    await act(async () => { select.value = "0"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocks.canvasProps?.generationLimits.ancestors).toBe(0);
    await click("Focused family");
    await click("Full tree");
    expect(mocks.canvasProps?.familyFocus).toBeUndefined();
    expect(mocks.canvasProps?.generationLimits).toEqual({ ancestors: null, descendants: null });
    await act(async () => root.unmount());
  });
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
