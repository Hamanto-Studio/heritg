import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SvgTreeCanvas } from "./SvgTreeCanvas";
import { prepareTree, type TreePreparationRequest, type TreePreparationResult } from "./treePreparation";
import type { FamilyRelationship, Person } from "./types";

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
      callback(performance.now());
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
    canvasRelationships: FamilyRelationship[] = []
  ) => {
    act(() => root.render(
      <SvgTreeCanvas
        actionsVisible
        generationLimits={{ ancestors: null, descendants: null }}
        language="en"
        onAddRelative={vi.fn()}
        onCanvasInteract={vi.fn()}
        onDeselectPerson={vi.fn()}
        onEditPerson={vi.fn()}
        onSelectPerson={onSelectPerson}
        onViewportChange={vi.fn()}
        people={canvasPeople}
        relationships={canvasRelationships}
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
    expect(container.querySelector('[data-canvas-action="add"]')).not.toBeNull();
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

  it("changes the transformed scene through pointer-centered wheel zoom", () => {
    renderCanvas();
    const host = container.querySelector<HTMLElement>(".svg-canvas-host")!;
    const scene = container.querySelector<SVGGElement>(".svg-tree-scene")!;
    const initialTransform = scene.style.transform;

    act(() => host.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 300,
      ctrlKey: true,
      deltaY: -20
    })));

    expect(scene.style.transform).not.toBe(initialTransform);
  });
});
