import { act, createRef } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SvgTreeCanvas } from "./SvgTreeCanvas";
import type { TreeCanvasHandle } from "./TreeCanvas";
import type { FamilyFocus } from "./focusedFamily";
import * as chartExport from "./chartExport";
import * as images from "./images";
import { DEFAULT_EXPORT_PRIVACY_SELECTION } from "./exportPrivacy";
import { prepareTree, type TreePreparationRequest, type TreePreparationResult } from "./treePreparation";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import type {
  AppData,
  FamilyRelationship,
  Person,
  RelationshipLanguage,
  ViewportState
} from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const person: Person = {
  id: "person",
  treeId: "tree",
  displayName: "Example Person",
  gender: "unspecified",
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDatePrecision: "year",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: ""
};

class ImmediateResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([], this);
    void target;
  }

  disconnect() {}
  unobserve() {}
}

class ImmediateTreeWorker {
  onmessage: ((event: MessageEvent<TreePreparationResult>) => void) | null = null;
  onerror: (() => void) | null = null;

  postMessage(request: TreePreparationRequest) {
    this.onmessage?.(new MessageEvent("message", { data: prepareTree(request) }));
  }

  terminate() {}
}

class PendingTreeWorker extends ImmediateTreeWorker {
  static latest: PendingTreeWorker;
  request?: TreePreparationRequest;

  constructor() {
    super();
    PendingTreeWorker.latest = this;
  }

  override postMessage(request: TreePreparationRequest) {
    this.request = request;
  }

  respond() {
    if (this.request) super.postMessage(this.request);
  }
}

describe("SvgTreeCanvas", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
    vi.stubGlobal("Worker", ImmediateTreeWorker);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(performance.now() + 1000);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderCanvas = (
    onSelectPerson = vi.fn(),
    selectedPersonId?: string,
    canvasPeople: Person[] = [person],
    canvasRelationships: FamilyRelationship[] = [],
    initialViewport?: ViewportState,
    relationshipLanguage?: RelationshipLanguage,
    language: AppData["language"] = "en",
    familyFocus?: FamilyFocus,
    canvasRef?: React.Ref<TreeCanvasHandle>,
    actionsVisible = true
  ) => {
    act(() => root.render(
      <SvgTreeCanvas
        familyFocus={familyFocus}
        ref={canvasRef}
        actionsVisible={actionsVisible}
        generationLimits={{ ancestors: null, descendants: null }}
        initialViewport={initialViewport}
        language={language}
        onAddRelative={vi.fn()}
        onCanvasInteract={vi.fn()}
        onDeselectPerson={vi.fn()}
        onEditPerson={vi.fn()}
        onSelectPerson={onSelectPerson}
        onViewportChange={vi.fn()}
        people={canvasPeople}
        relationships={canvasRelationships}
        relationshipLanguage={relationshipLanguage}
        selectedPersonId={selectedPersonId}
        t={(key) => key}
        treeId="tree"
        treeTitle="Family"
      />
    ));
    return onSelectPerson;
  };

  it("mounts an SVG scene with accessible person and action controls", () => {
    renderCanvas();

    expect(container.querySelector(".svg-tree-canvas")).not.toBeNull();
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-canvas-person="person"]')?.ariaLabel)
      .toBe("Example Person, unspecified");
    expect(container.querySelector('[data-canvas-action]')).toBeNull();
  });

  it("clips the hit layer without creating an independently scrollable focus container", () => {
    const style = document.createElement("style");
    style.textContent = ["canvas-actions.css", "svg-canvas.css"]
      .map((file) => readFileSync(`src/${file}`, "utf8")).join("\n");
    document.head.append(style);
    try {
      renderCanvas();
      // Real-browser coverage checks Tab/Enter too: overflow:hidden allows
      // focus to scroll this layer even though the SVG camera does not move.
      expect(getComputedStyle(container.querySelector(".canvas-actions")!).overflow).toBe("clip");
      expect(container.querySelector<HTMLButtonElement>(".canvas-person-hit")!.tabIndex).toBe(0);
    } finally {
      style.remove();
    }
  });

  it("keeps Connections in Full only and lets its list scroll without moving the canvas", () => {
    const child = { ...person, id: "child", displayName: "Child" };
    const relationships: FamilyRelationship[] = [{ id: "pc", treeId: "tree", createdAt: "2026", kind: "parent",
      subtype: "biologicalParent", fromPersonId: person.id, toPersonId: child.id }];
    const select = vi.fn();
    renderCanvas(select, person.id, [person, child], relationships);
    act(() => container.querySelector<HTMLButtonElement>(".canvas-connections-trigger")!.click());
    const transform = container.querySelector(".svg-tree-scene")!.getAttribute("transform");
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 90 });
    act(() => container.querySelector(".canvas-connections-panel")!.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(false);
    expect(container.querySelector(".svg-tree-scene")!.getAttribute("transform")).toBe(transform);
    act(() => container.querySelector<HTMLButtonElement>(".canvas-connections-panel li button")!.click());
    expect(select).toHaveBeenCalledWith(child.id);
    renderCanvas(select, person.id, [person, child], relationships, undefined, "en", "en", { personId: person.id, ancestors: 1, descendants: 1 });
    expect(container.querySelector(".canvas-connections")).toBeNull();
    expect(container.querySelector(".is-traced")).toBeNull();
    renderCanvas(select, person.id, [person, child], relationships, undefined, "en", "en", undefined, undefined, false);
    expect(container.querySelector(".canvas-connections")).toBeNull();
  });

  it("refits migrated Full corridors if the saved viewport contains no family member", () => {
    const data = indonesianFamilyFixture(31, "compound");
    renderCanvas(vi.fn(), undefined, data.people, data.relationships, { scrollX: 900000, scrollY: 900000, zoom: 1 });
    const transform = container.querySelector('.svg-tree-scene')!.getAttribute('transform')!;
    expect(transform).not.toContain('900000');
    expect(container.querySelectorAll('[data-person-id]')).toHaveLength(31);
  });

  it("preserves a saved Full corridor viewport that still shows a person", () => {
    const data = indonesianFamilyFixture(31, "compound");
    const prepared = prepareTree({ ...data, requestKey: "viewport", generationLimits: { ancestors: null, descendants: null },
      language: "en", relationshipLanguage: "en", controlsVisible: false });
    const target = prepared.geometryLayout.people[0], saved = { scrollX: 400 - target.x, scrollY: 200 - target.y, zoom: 1 };
    renderCanvas(vi.fn(), undefined, data.people, data.relationships, saved);
    expect(container.querySelector('.svg-tree-scene')?.getAttribute('transform'))
      .toBe(`translate(${saved.scrollX} ${saved.scrollY}) scale(1)`);
  });

  it.each([390, 1000])("opens a 500-person Full tree readably at %ipx without filtering its explicit overview", (width) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    const data = indonesianFamilyFixture(500, "shared-parent-sets"), ref = createRef<TreeCanvasHandle>();
    const select = vi.fn();
    renderCanvas(select, undefined, data.people, data.relationships, undefined, "id", "id", undefined, ref);
    const scale = () => Number(container.querySelector('.svg-tree-scene')!.getAttribute('transform')!.match(/scale\(([^)]+)\)/)![1]);
    const ids = () => [...container.querySelectorAll('[data-canvas-person]')].map((node) => node.getAttribute('data-canvas-person'));
    expect(scale()).toBeGreaterThanOrEqual(0.85);
    expect(ids().sort()).toEqual(data.people.map((person) => person.id).sort());
    expect(select).not.toHaveBeenCalled();
    act(() => ref.current!.fitAll());
    expect(scale()).toBeLessThan(0.1);
    expect(ids()).toHaveLength(500);
    act(() => ref.current!.focusPerson(data.people[2].id));
    expect(scale()).toBeGreaterThanOrEqual(0.85);
    expect(ids()).toHaveLength(500);
    // Three full 500-person jsdom renders compete with the routing stress suite
    // on CI. This checks behavior, not wall-clock rendering performance.
  }, 30_000);

  it("animates focused-family changes and lets manual zoom interrupt the camera", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => { frames.set(++sequence, callback); return sequence; });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
    const other = { ...person, id: "child", displayName: "Synthetic Child" };
    const grandchild = { ...person, id: "grandchild", displayName: "Synthetic Grandchild" };
    const edges: FamilyRelationship[] = [{ id: "edge", treeId: "tree", fromPersonId: person.id, toPersonId: other.id,
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01" },
    { id: "next-edge", treeId: "tree", fromPersonId: other.id, toPersonId: grandchild.id,
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01" }];
    const ref = createRef<TreeCanvasHandle>();
    renderCanvas(vi.fn(), person.id, [person, other, grandchild], edges, undefined, "en", "en", { personId: person.id, ancestors: 1, descendants: 1 }, ref);
    expect(frames.size).toBe(0);
    renderCanvas(vi.fn(), other.id, [person, other, grandchild], edges, undefined, "en", "en", { personId: other.id, ancestors: 1, descendants: 1 }, ref);
    expect(frames.size).toBe(1);
    const scene = container.querySelector('.svg-tree-scene')!;
    const start = scene.getAttribute('transform');
    const [id, frame] = [...frames][0]; frames.delete(id);
    act(() => frame(180));
    expect(scene.getAttribute('transform')).not.toBe(start);
    expect(frames.size).toBe(1);
    act(() => ref.current!.zoomIn());
    expect(cancel).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("fits immediately without animation when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const ref = createRef<TreeCanvasHandle>();
    renderCanvas(vi.fn(), person.id, [person], [], undefined, "en", "en", undefined, ref);
    vi.mocked(window.requestAnimationFrame).mockClear();
    act(() => { ref.current!.focusPerson(person.id); ref.current!.fitAll(); });
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector('.svg-tree-scene')?.getAttribute('transform')).toContain('scale(');
  });

  it.each([390, 1000])("keeps expanded Focus readable at %ipx, with an explicit complete Fit overview", (width) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    const data = indonesianFamilyFixture(15, "remarried"), ref = createRef<TreeCanvasHandle>();
    const show = (id: string) => renderCanvas(vi.fn(), id, data.people, data.relationships, undefined, "id", "id",
      { personId: id, ancestors: 2, descendants: 2, siblings: true }, ref);
    show(data.rootId);
    const scale = () => Number(container.querySelector('.svg-tree-scene')!.getAttribute('transform')!.match(/scale\(([^)]+)\)/)![1]);
    const rendered = () => [...container.querySelectorAll('[data-canvas-person]')].map((p) => p.getAttribute('data-canvas-person'));
    const relatives = rendered();
    expect(relatives.length).toBeGreaterThan(10);
    expect(scale()).toBeGreaterThanOrEqual(0.85);
    act(() => ref.current!.fitAll());
    expect(scale()).toBeLessThan(0.85);
    expect(rendered()).toEqual(relatives);
    // Exploring again restores readable framing without changing depth.
    show(data.people[1].id);
    expect(scale()).toBeGreaterThanOrEqual(0.85);
    expect(rendered()).toContain(data.people[1].id);
  });

  it("retains the visible family while the next focus is being prepared", () => {
    vi.stubGlobal("Worker", PendingTreeWorker);
    const other = { ...person, id: "other", displayName: "Other Family" };
    renderCanvas(vi.fn(), person.id, [person, other], [], undefined, "en", "en", { personId: person.id, ancestors: 1, descendants: 1 });
    act(() => PendingTreeWorker.latest.respond());
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
    renderCanvas(vi.fn(), other.id, [person, other], [], undefined, "en", "en", { personId: other.id, ancestors: 1, descendants: 1 });
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
    expect(container.querySelector('.canvas-preparing')).not.toBeNull();
    act(() => PendingTreeWorker.latest.respond());
    expect(container.querySelector('[data-person-id="other"]')).not.toBeNull();
    expect(container.querySelector('.canvas-preparing')).toBeNull();
  });

  it("does not let a resize fit the old Full tree after the focused family loads", () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("Worker", PendingTreeWorker);
      vi.stubGlobal("innerWidth", 1000);
      const members = Array.from({ length: 100 }, (_, i) => ({ ...person, id: `p${i}` }));
      const ref = createRef<TreeCanvasHandle>();
      renderCanvas(vi.fn(), undefined, members, [], undefined, "en", "en", undefined, ref);
      act(() => PendingTreeWorker.latest.respond());
      vi.stubGlobal("innerWidth", 390);
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
      renderCanvas(vi.fn(), "p0", members, [], undefined, "en", "en", { personId: "p0", ancestors: 2, descendants: 2 }, ref);
      act(() => PendingTreeWorker.latest.respond());
      act(() => vi.advanceTimersByTime(500));
      const transform = container.querySelector('.svg-tree-scene')!.getAttribute('transform')!;
      expect(Number(transform.match(/scale\(([^)]+)\)/)![1])).toBeGreaterThan(0.5);
      expect(container.querySelectorAll('[data-canvas-person]')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the latest Full selection readable when the viewport crosses a phone breakpoint", () => {
    vi.useFakeTimers();
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal("ResizeObserver", class extends ImmediateResizeObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); resize = callback; }
    });
    try {
      vi.stubGlobal("innerWidth", 1000);
      const members = Array.from({ length: 100 }, (_, i) => ({ ...person, id: `p${i}` }));
      renderCanvas(vi.fn(), "p0", members);
      renderCanvas(vi.fn(), "p99", members);
      vi.stubGlobal("innerWidth", 390);
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
      act(() => { resize!([], {} as ResizeObserver); vi.advanceTimersByTime(500); });
      const transform = container.querySelector('.svg-tree-scene')!.getAttribute('transform')!;
      expect(Number(transform.match(/scale\(([^)]+)\)/)![1])).toBeGreaterThanOrEqual(0.85);
      expect(container.querySelector('[data-canvas-person][aria-pressed="true"]')?.getAttribute("data-canvas-person")).toBe("p99");
      expect(container.querySelectorAll('[data-canvas-person]')).toHaveLength(100);
    } finally { vi.useRealTimers(); }
  });

  it.each([2, 30])("shows plus and pencil only on the selected person in a %i-person tree", (count) => {
    const members = Array.from({ length: count }, (_, index) => ({ ...person, id: `p${index}` }));
    renderCanvas(vi.fn(), undefined, members);
    expect(container.querySelectorAll('[data-canvas-person]')).toHaveLength(count);
    expect(container.querySelectorAll('[data-canvas-action]')).toHaveLength(0);
    for (const selected of ["p0", "p1"]) {
      renderCanvas(vi.fn(), selected, members);
      const actions = [...container.querySelectorAll('[data-canvas-action]')];
      expect(actions.map((button) => button.getAttribute('data-canvas-action'))).toEqual(['add', 'edit']);
      expect(actions.every((button) => button.getAttribute('data-person-id') === selected)).toBe(true);
    }
    renderCanvas(vi.fn(), "p1", members, [], undefined, "en", "en", undefined, undefined, false);
    expect(container.querySelector('[data-canvas-action]')).toBeNull();
    renderCanvas(vi.fn(), undefined, members);
    expect(container.querySelector('[data-canvas-action]')).toBeNull();
  });

  it("changes the family window without dropping unrelated people from chart exports", async () => {
    const other = { ...person, id: "other", displayName: "Another branch", photoDataUrl: "data:image/png;base64,test" };
    const ref = createRef<TreeCanvasHandle>();
    const chart = vi.spyOn(chartExport, "buildChartSvg").mockReturnValue({ svg: "<svg/>", width: 10, height: 10 });
    vi.spyOn(chartExport, "chartSvgToPng").mockResolvedValue(new Blob());
    vi.spyOn(images, "downloadBlob").mockImplementation(() => {});
    renderCanvas(vi.fn(), "person", [person, other], [], undefined, "en", "en", { personId: "person", ancestors: 1, descendants: 1 }, ref);
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
    expect(container.querySelector('[data-person-id="other"]')).toBeNull();
    await ref.current!.exportSvg(DEFAULT_EXPORT_PRIVACY_SELECTION);
    await ref.current!.exportPng(DEFAULT_EXPORT_PRIVACY_SELECTION);
    for (const call of chart.mock.calls) {
      expect(call[0].people.map((item) => item.id).sort()).toEqual(["other", "person"]);
      expect(call[0].people.find((item) => item.id === "other")?.photoDataUrl).toBe(other.photoDataUrl);
    }
    renderCanvas(vi.fn(), undefined, [person, other], [], undefined, "en", "en", { personId: "person", ancestors: 1, descendants: 1 });
    expect(container.querySelector('[data-person-id="other"]')).toBeNull();
    renderCanvas(vi.fn(), "other", [person, other], [], undefined, "en", "en", { personId: "other", ancestors: 1, descendants: 1 });
    expect(container.querySelector('[data-person-id="person"]')).toBeNull();
    expect(container.querySelector('[data-person-id="other"]')).not.toBeNull();
    renderCanvas(vi.fn(), undefined, [person, other]);
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
    expect(container.querySelector('[data-person-id="other"]')).not.toBeNull();
  });

  it("keeps the focused person below the toolbar when expanding a deep branch", () => {
    const members = Array.from({ length: 10 }, (_, index) => ({ ...person, id: `p${index}` }));
    const edges: FamilyRelationship[] = members.slice(1).map((member, index) => ({
      id: `edge${index}`, treeId: "tree", fromPersonId: members[index].id, toPersonId: member.id,
      kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01"
    }));
    renderCanvas(vi.fn(), "p0", members, edges, undefined, "en", "en", { personId: "p0", ancestors: 1, descendants: 9 });
    const transform = container.querySelector('.svg-tree-scene')!.getAttribute('transform')!;
    const [, , y, zoom] = transform.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)!;
    const circle = container.querySelector('[data-person-id="p0"] circle')!;
    const screenY = Number(circle.getAttribute('cy')) * Number(zoom) + Number(y);
    expect(screenY).toBeGreaterThanOrEqual(160 + 48);
    expect(screenY).toBeLessThanOrEqual(600 - 140);
  });

  it("keeps the current city in worker preparation and renders it", () => {
    renderCanvas(vi.fn(), undefined, [{ ...person, city: "Jakarta" }]);

    expect(container.querySelector(".svg-person-city")?.textContent).toBe("Jakarta");
  });

  it("keeps names and photos rendered at the minimum zoom", () => {
    renderCanvas(
      vi.fn(),
      undefined,
      [{ ...person, photoDataUrl: "data:image/png;base64,AA==" }],
      [],
      { scrollX: 0, scrollY: 0, zoom: 0.08 }
    );

    expect(container.querySelector<SVGGElement>(".svg-tree-scene")?.getAttribute("transform"))
      .toContain("scale(0.08)");
    expect(container.querySelector(".svg-person-name")?.textContent).toBe("Example Person");
    expect(container.querySelector(".svg-person image")).not.toBeNull();
  });

  it("shows a status indicator while tree preparation runs in the worker", () => {
    vi.stubGlobal("Worker", PendingTreeWorker);
    renderCanvas();

    expect(container.querySelector('[role="status"]')?.textContent).toBe("preparingTree");
    expect(container.querySelector('[data-person-id="person"]')).toBeNull();

    act(() => PendingTreeWorker.latest.respond());

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-person-id="person"]')).not.toBeNull();
  });

  it("selects a person through the retained HTML hit target", () => {
    const onSelectPerson = renderCanvas();
    const hitTarget = container.querySelector<HTMLButtonElement>('[data-canvas-person="person"]')!;

    act(() => hitTarget.click());

    expect(onSelectPerson).toHaveBeenCalledWith("person");
  });

  it("hides the selected-person role when the tree has only one person", () => {
    renderCanvas(vi.fn(), person.id);

    expect(container.querySelector(".svg-person-role")).toBeNull();
  });

  it("preserves derived birth-order badges from worker preparation", () => {
    const parent = (id: string): Person => ({ ...person, id, displayName: id });
    const child = (id: string, birthDate: string): Person => ({
      ...parent(id),
      birthDate,
      birthDatePrecision: "exact"
    });
    const canvasPeople = [
      parent("father"), parent("mother"),
      child("oldest", "1990-01-01"), child("youngest", "1992-01-01")
    ];
    const canvasRelationships: FamilyRelationship[] = ["oldest", "youngest"].flatMap((childId) =>
      ["father", "mother"].map((parentId) => ({
        id: `${parentId}-${childId}`,
        treeId: "tree",
        fromPersonId: parentId,
        toPersonId: childId,
        kind: "parent" as const,
        subtype: "biologicalParent" as const,
        createdAt: person.createdAt
      }))
    );

    renderCanvas(vi.fn(), undefined, canvasPeople, canvasRelationships);

    expect(container.querySelector('[data-birth-order="1"]')).not.toBeNull();
    expect(container.querySelector('[data-birth-order="2"]')).not.toBeNull();
    const oldestHit = container.querySelector<HTMLButtonElement>('[data-canvas-person="oldest"]');
    expect(oldestHit?.title).toBe("First child");
    expect(oldestHit?.ariaLabel).toContain("First child");
  });

  it("preserves a manual birth-order badge through worker preparation", () => {
    renderCanvas(vi.fn(), undefined, [{ ...person, birthOrderOverride: 3 }], []);

    expect(container.querySelector('[data-birth-order="3"]')).not.toBeNull();
    const hitTarget = container.querySelector<HTMLButtonElement>('[data-canvas-person="person"]');
    expect(hitTarget?.title).toBe("Third child");
  });

  it("renders the selected regional Javanese relationship terminology", () => {
    const parent = { ...person, id: "parent", displayName: "Parent" };
    const focus = {
      ...person,
      id: "focus",
      displayName: "Focus",
      birthOrderOverride: 2
    };
    const sibling = {
      ...person,
      id: "sibling",
      displayName: "Sibling",
      gender: "male" as const,
      birthOrderOverride: 1
    };
    const relationships: FamilyRelationship[] = [focus, sibling].map((child) => ({
      id: `parent-${child.id}`,
      treeId: "tree",
      fromPersonId: parent.id,
      toPersonId: child.id,
      kind: "parent",
      subtype: "biologicalParent",
      createdAt: person.createdAt
    }));

    renderCanvas(
      vi.fn(),
      focus.id,
      [parent, focus, sibling],
      relationships,
      undefined,
      "jv-yogyakarta",
      "en"
    );

    expect(container.querySelector('[data-person-id="sibling"] .svg-person-role')?.textContent)
      .toBe("Kangmas");
  });

  it("changes the transformed scene through pointer-centered wheel zoom", () => {
    renderCanvas();
    const host = container.querySelector<HTMLElement>(".svg-canvas-host")!;
    const scene = container.querySelector<SVGGElement>(".svg-tree-scene")!;
    const initialTransform = scene.getAttribute("transform");

    act(() => host.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 300,
      ctrlKey: true,
      deltaY: -20
    })));

    expect(scene.getAttribute("transform")).not.toBe(initialTransform);
  });
});
