import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SvgTreeCanvas } from "./SvgTreeCanvas";
import type { Person } from "./types";

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

describe("SvgTreeCanvas", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
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

  const renderCanvas = (onSelectPerson = vi.fn()) => {
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
        people={[person]}
        relationships={[]}
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
      .toBe("Example Person");
    expect(container.querySelector('[data-canvas-action="add"]')).not.toBeNull();
  });

  it("selects a person through the retained HTML hit target", () => {
    const onSelectPerson = renderCanvas();
    const hitTarget = container.querySelector<HTMLButtonElement>('[data-canvas-person="person"]')!;

    act(() => hitTarget.click());

    expect(onSelectPerson).toHaveBeenCalledWith("person");
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
