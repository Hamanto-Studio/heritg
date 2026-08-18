import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Translator } from "./i18n";
import type { AppActions } from "./store";
import { TreeSidebar } from "./TreeSidebar";
import type { AppData } from "./types";

const data: AppData = {
  version: 1,
  trees: [],
  people: [],
  relationships: [],
  language: "en",
  viewports: {}
};

const t = ((key: string) => key) as Translator;
const actions = {} as AppActions;
const copyData: AppData = {
  ...data,
  trees: [{
    id: "tree-a",
    title: "Sukamto Family",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z"
  }],
  people: [
    {
      id: "latifa", treeId: "tree-a", displayName: "Latifa Nabila Harfiya",
      gender: "female", createdAt: "2026-08-18T00:00:00.000Z",
      birthDatePrecision: "exact", notes: "", addressLine: "", city: "",
      province: "", country: "", postalCode: ""
    },
    {
      id: "robi", treeId: "tree-a", displayName: "Robihamanto",
      gender: "male", createdAt: "2026-08-18T00:00:00.000Z",
      birthDatePrecision: "exact", notes: "", addressLine: "", city: "",
      province: "", country: "", postalCode: ""
    },
    {
      id: "child", treeId: "tree-a", displayName: "Shared child",
      gender: "unspecified", createdAt: "2026-08-18T00:00:00.000Z",
      birthDatePrecision: "exact", notes: "", addressLine: "", city: "",
      province: "", country: "", postalCode: ""
    }
  ],
  relationships: [
    {
      id: "union", treeId: "tree-a", fromPersonId: "latifa", toPersonId: "robi",
      kind: "partner", subtype: "spouse", createdAt: "2026-08-18T00:00:00.000Z"
    },
    {
      id: "latifa-child", treeId: "tree-a", fromPersonId: "latifa", toPersonId: "child",
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-08-18T00:00:00.000Z"
    },
    {
      id: "robi-child", treeId: "tree-a", fromPersonId: "robi", toPersonId: "child",
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-08-18T00:00:00.000Z"
    }
  ],
  selectedTreeId: "tree-a"
};
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TreeSidebar file import", () => {
  it("uses an unrestricted native file input for iOS and iPadOS", () => {
    act(() => root.render(
      <TreeSidebar
        actions={actions}
        data={data}
        onClose={vi.fn()}
        onError={vi.fn()}
        onImported={vi.fn()}
        onShowHelp={vi.fn()}
        onShowPrivacy={vi.fn()}
        open
        t={t}
      />
    ));

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.hasAttribute("accept")).toBe(false);
    expect(input?.closest("label")?.classList.contains("import-file-control")).toBe(true);
  });
});

describe("TreeSidebar family copies", () => {
  it("previews a focused copy and excludes the selected focus partner by default", () => {
    const copyFocusedTree = vi.fn(() => "tree-copy");
    const onClose = vi.fn();
    act(() => root.render(
      <TreeSidebar
        actions={{ ...actions, copyFocusedTree }}
        data={copyData}
        onClose={onClose}
        onError={vi.fn()}
        onImported={vi.fn()}
        onShowHelp={vi.fn()}
        onShowPrivacy={vi.fn()}
        open
        t={t}
      />
    ));

    act(() => container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sukamto Family: treeActions"]'
    )?.click());
    const copyAction = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("makeFamilyCopy"));
    act(() => copyAction?.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const latifaInput = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .find((input) => input.closest("label")?.textContent?.includes("Latifa Nabila Harfiya"));
    act(() => latifaInput?.click());

    const partnerCheckbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(partnerCheckbox?.checked).toBe(true);
    expect(partnerCheckbox?.closest("label")?.textContent).toContain("Robihamanto");
    expect(dialog.textContent).toContain("familyCopyCounts");

    const createButton = [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("createFamilyCopy"));
    act(() => createButton?.click());

    expect(copyFocusedTree).toHaveBeenCalledWith(
      "tree-a",
      "familyCopyDefaultName",
      "latifa",
      ["robi"]
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
