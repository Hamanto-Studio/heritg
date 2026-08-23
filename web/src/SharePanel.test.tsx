// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTranslator } from "./i18n";
import { SharePanel } from "./SharePanel";
import { loadManagedShares } from "./db";
import type { AppData, FamilyTree } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./db", () => ({
  loadManagedShares: vi.fn().mockResolvedValue([]),
  saveManagedShares: vi.fn().mockResolvedValue(undefined)
}));

const tree: FamilyTree = {
  id: "tree",
  title: "Example Family",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const data: AppData = {
  version: 1,
  trees: [tree],
  people: [],
  relationships: [],
  selectedTreeId: tree.id,
  language: "en",
  viewports: {}
};

describe("SharePanel methods", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.mocked(loadManagedShares).mockResolvedValue([]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <SharePanel
          data={data}
          exportPng={vi.fn().mockResolvedValue(undefined)}
          exportSvg={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
          onCopied={vi.fn()}
          onError={vi.fn()}
          onExported={vi.fn()}
          peopleCount={1}
          t={createTranslator("en")}
          tree={tree}
        />
      );
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("presents separate HERITG and GEDCOM workflows with clear use cases", () => {
    const choices = [...container.querySelectorAll<HTMLButtonElement>(".share-method-choice")];
    expect(choices.map((choice) => choice.textContent)).toEqual([
      expect.stringContaining("Web link"),
      expect.stringContaining("HERITG backup"),
      expect.stringContaining("GEDCOM export"),
      expect.stringContaining("Images")
    ]);
    expect(choices[0].getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("Create a new link");
    const details = () => container.querySelector(".share-method-content")?.textContent;
    expect(details()).not.toContain("GEDCOM export (.ged)");

    act(() => choices[1].click());
    expect(details()).toContain("Recommended");
    expect(details()).toContain("HERITG backup (.heritg)");
    expect(details()).toContain("photos, notes, places, dates");
    expect(details()).not.toContain("GEDCOM export (.ged)");

    act(() => choices[2].click());
    expect(details()).toContain("For other apps");
    expect(details()).toContain("GEDCOM export (.ged)");
    expect(details()).toContain("widely supported");
    expect(details()).not.toContain("HERITG backup (.heritg)");

    act(() => choices[3].click());
    expect(details()).toContain("Download HD PNG");
    expect(details()).toContain("Download SVG");
    expect(details()).not.toContain("GEDCOM export (.ged)");
  });

  it("limits the Free plan to one active link across every canvas on this device", async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(loadManagedShares).mockResolvedValue([{
      shareId: "S".repeat(22),
      deletionToken: "D".repeat(43),
      treeId: "another-tree",
      treeTitle: "Another Family",
      createdAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z"
    }]);

    await act(async () => {
      root.render(
        <SharePanel
          data={data}
          exportPng={vi.fn().mockResolvedValue(undefined)}
          exportSvg={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
          onCopied={vi.fn()}
          onError={vi.fn()}
          onExported={vi.fn()}
          peopleCount={1}
          t={createTranslator("en")}
          tree={tree}
        />
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Another Family");
    expect(container.textContent).toContain("one active link per device");
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Create encrypted link"));
    expect(createButton?.disabled).toBe(true);
  });
});
