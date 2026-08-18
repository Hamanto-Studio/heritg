import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  loadAppData: vi.fn(),
  saveAppData: vi.fn()
}));

vi.mock("./db", () => dbMocks);

import {
  addRelationship,
  createInitialAppData,
  createPerson
} from "./domain";
import {
  AppProvider,
  useAppStore,
  type AppActions
} from "./store";
import type { AppData } from "./types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let actions: AppActions | undefined;
let renderedData: AppData | null = null;

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

function StoreProbe() {
  const store = useAppStore();
  useEffect(() => {
    actions = store.actions;
    renderedData = store.data;
  }, [store.actions, store.data]);
  return null;
}

const family = () => {
  let data = createInitialAppData("en", {
    id: "tree-a",
    now: "2026-01-01T00:00:00.000Z"
  });
  for (const [id, displayName] of [
    ["target", "Target"],
    ["active", "Active spouse"],
    ["former", "Former partner"],
    ["child", "Child"],
    ["unlinked", "Unlinked child"]
  ] as const) {
    data = createPerson(data, "tree-a", { displayName }, {
      id,
      now: "2026-01-02T00:00:00.000Z"
    });
  }
  data = addRelationship(data, "target", "active", "wife", "2020-01-01", {
    id: "active-union",
    now: "2026-01-03T00:00:00.000Z"
  });
  data = addRelationship(data, "target", "former", "formerPartner", undefined, {
    id: "former-union",
    now: "2026-01-03T00:00:00.000Z"
  });
  return addRelationship(data, "target", "child", "son", undefined, {
    id: "child-link",
    now: "2026-01-03T00:00:00.000Z"
  });
};

const currentActions = () => {
  if (!actions) throw new Error("Store actions were not rendered.");
  return actions;
};

const currentData = () => {
  if (!renderedData) throw new Error("Store data was not loaded.");
  return renderedData;
};

beforeEach(async () => {
  actions = undefined;
  renderedData = null;
  dbMocks.loadAppData.mockResolvedValueOnce(family());
  dbMocks.saveAppData.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(AppProvider, null, createElement(StoreProbe)));
  });
  currentActions();
  currentData();
});

afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe("atomic relationship store actions", () => {
  it("publishes and persists a complete focused family copy atomically", async () => {
    dbMocks.saveAppData.mockClear();
    let copiedTreeId = "";

    act(() => {
      copiedTreeId = currentActions().copyFocusedTree(
        "tree-a",
        "Target Family",
        "target"
      );
    });

    const copiedTree = currentData().trees.find((tree) => tree.id === copiedTreeId)!;
    const copiedPeople = currentData().people.filter((person) => person.treeId === copiedTreeId);
    expect(currentData().selectedTreeId).toBe(copiedTreeId);
    expect(copiedTree.lastSelectedPersonId).toBeDefined();
    expect(copiedPeople.map((person) => person.displayName).sort()).toEqual([
      "Active spouse", "Child", "Former partner", "Target"
    ]);
    expect(currentData().people.filter((person) => person.treeId === "tree-a")).toHaveLength(5);

    await vi.waitFor(() => expect(dbMocks.saveAppData).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTreeId: copiedTreeId,
        trees: expect.arrayContaining([expect.objectContaining({ id: copiedTreeId })])
      })
    ));
  });

  it("publishes selection immediately and persists it after the interaction", async () => {
    vi.useFakeTimers();
    dbMocks.saveAppData.mockClear();

    act(() => currentActions().selectPerson("target"));

    expect(currentData().trees[0].lastSelectedPersonId).toBe("target");
    expect(dbMocks.saveAppData).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(dbMocks.saveAppData).toHaveBeenCalledWith(expect.objectContaining({
      trees: [expect.objectContaining({ lastSelectedPersonId: "target" })]
    }));
  });

  it("persists viewport changes without publishing a graph update", async () => {
    const before = currentData();
    dbMocks.saveAppData.mockClear();

    act(() => {
      currentActions().setViewport("tree-a", { scrollX: 10, scrollY: 20, zoom: 1.5 });
    });

    expect(currentData()).toBe(before);
    await vi.waitFor(() => expect(dbMocks.saveAppData).toHaveBeenCalledWith(
      expect.objectContaining({
        viewports: { "tree-a": { scrollX: 10, scrollY: 20, zoom: 1.5 } }
      })
    ));
  });

  it("does not overwrite a newer viewport after a published update", async () => {
    dbMocks.saveAppData.mockClear();

    act(() => {
      currentActions().renameTree("tree-a", "Renamed tree");
      currentActions().setViewport("tree-a", { scrollX: 30, scrollY: 40, zoom: 2 });
    });

    await vi.waitFor(() => {
      const saved = dbMocks.saveAppData.mock.calls.at(-1)?.[0];
      expect(saved?.trees[0].title).toBe("Renamed tree");
      expect(saved?.viewports["tree-a"]).toEqual({ scrollX: 30, scrollY: 40, zoom: 2 });
    });
  });

  it("creates a relative and both active co-parent edges atomically", () => {
    let relativeId = "";
    act(() => {
      relativeId = currentActions().createRelative(
        "tree-a",
        "target",
        { displayName: "Foster daughter" },
        "fosterDaughter",
        undefined,
        "active"
      );
    });

    expect(currentData().people.find((person) => person.id === relativeId)).toMatchObject({
      displayName: "Foster daughter",
      gender: "female"
    });
    expect(currentData().relationships.filter((relationship) =>
      relationship.toPersonId === relativeId
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPersonId: "target", subtype: "fosterParent" }),
      expect.objectContaining({ fromPersonId: "active", subtype: "fosterParent" })
    ]));
  });

  it("links an existing relative through an active co-parent in one update", () => {
    act(() => {
      currentActions().linkRelative(
        "target",
        "unlinked",
        "ward",
        undefined,
        "active"
      );
    });

    expect(currentData().relationships.filter((relationship) =>
      relationship.toPersonId === "unlinked"
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPersonId: "target", subtype: "guardian" }),
      expect.objectContaining({ fromPersonId: "active", subtype: "guardian" })
    ]));
  });

  it("rejects former unions and disallowed roles without partial mutation", () => {
    const before = currentData();
    expect(() => currentActions().createRelative(
      "tree-a",
      "target",
      { displayName: "Rejected child" },
      "daughter",
      undefined,
      "former"
    )).toThrow(/active partner or spouse/i);
    expect(currentData()).toBe(before);

    expect(() => currentActions().linkRelative(
      "target",
      "unlinked",
      "stepdaughter",
      undefined,
      "active"
    )).toThrow(/does not allow a co-parent/i);
    expect(currentData()).toBe(before);
  });

  it("replaces staged edits atomically and rolls back a failed replacement", () => {
    const before = currentData();
    expect(() => currentActions().savePerson(
      "target",
      { displayName: "Must not persist" },
      ["child-link"],
      [{ relativePersonId: "target", role: "brother" }]
    )).toThrow(/cannot be related to themselves/i);
    expect(currentData()).toBe(before);

    act(() => {
      currentActions().savePerson(
        "target",
        { displayName: "Updated target" },
        ["child-link"],
        [{ relativePersonId: "child", role: "adoptiveSon" }]
      );
    });
    expect(currentData().people.find((person) => person.id === "target")?.displayName)
      .toBe("Updated target");
    expect(currentData().relationships.find((relationship) =>
      relationship.fromPersonId === "target" && relationship.toPersonId === "child"
    )).toMatchObject({ subtype: "adoptiveParent" });
    expect(currentData().relationships.some((relationship) => relationship.id === "child-link"))
      .toBe(false);
  });

  it("passes divorce dates through atomic relationship actions", () => {
    act(() => {
      currentActions().addRelationship(
        "child", "former", "formerPartner", "2012-01-02", "2020-03-04"
      );
    });
    expect(currentData().relationships.find((relationship) =>
      relationship.fromPersonId === "child" || relationship.toPersonId === "child"
    )).toBeDefined();
    expect(currentData().relationships).toContainEqual(expect.objectContaining({
      subtype: "formerPartner",
      marriageDate: "2012-01-02",
      divorceDate: "2020-03-04"
    }));
  });
});
