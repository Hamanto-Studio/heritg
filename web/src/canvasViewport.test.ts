import { describe, expect, it } from "vitest";

import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  clampZoom,
  fitSceneRect,
  interpolateViewport,
  panViewport,
  sceneToViewport,
  zoomViewportAt
} from "./canvasViewport";
import type { Point, SceneRect, Size, ViewportState } from "./canvasViewport";

const expectPointCloseTo = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
};

describe("clampZoom", () => {
  it("keeps zoom inside the canvas limits", () => {
    expect(clampZoom(0)).toBe(MIN_CANVAS_ZOOM);
    expect(clampZoom(MIN_CANVAS_ZOOM)).toBe(MIN_CANVAS_ZOOM);
    expect(clampZoom(0.75)).toBe(0.75);
    expect(clampZoom(MAX_CANVAS_ZOOM)).toBe(MAX_CANVAS_ZOOM);
    expect(clampZoom(20)).toBe(MAX_CANVAS_ZOOM);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(MIN_CANVAS_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_CANVAS_ZOOM);
  });

  it("rejects NaN rather than leaking it into viewport state", () => {
    expect(() => clampZoom(Number.NaN)).toThrow(RangeError);
  });
});

describe("sceneToViewport", () => {
  it("matches Excalidraw's (scene + scroll) * zoom semantics", () => {
    const viewport: ViewportState = { scrollX: -40, scrollY: 15, zoom: 1.5 };

    expect(sceneToViewport({ x: 100, y: -5 }, viewport)).toEqual({ x: 90, y: 15 });
    expect(sceneToViewport({ x: 40, y: -15 }, viewport)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomViewportAt", () => {
  it("preserves the scene point under the viewport pointer", () => {
    const viewport: ViewportState = { scrollX: -125, scrollY: 80, zoom: 0.75 };
    const pointer = { x: 320, y: 180 };
    const scenePoint = {
      x: pointer.x / viewport.zoom - viewport.scrollX,
      y: pointer.y / viewport.zoom - viewport.scrollY
    };

    const zoomed = zoomViewportAt(viewport, pointer, 1.4);

    expect(zoomed.zoom).toBe(1.4);
    expectPointCloseTo(sceneToViewport(scenePoint, zoomed), pointer);
    expect(viewport).toEqual({ scrollX: -125, scrollY: 80, zoom: 0.75 });
  });

  it("preserves the pointer anchor after clamping requested zoom", () => {
    const viewport: ViewportState = { scrollX: 25, scrollY: -30, zoom: 1 };
    const pointer = { x: 90, y: 240 };
    const scenePoint = {
      x: pointer.x / viewport.zoom - viewport.scrollX,
      y: pointer.y / viewport.zoom - viewport.scrollY
    };

    const zoomedOut = zoomViewportAt(viewport, pointer, 0.001);
    const zoomedIn = zoomViewportAt(viewport, pointer, 100);

    expect(zoomedOut.zoom).toBe(MIN_CANVAS_ZOOM);
    expect(zoomedIn.zoom).toBe(MAX_CANVAS_ZOOM);
    expectPointCloseTo(sceneToViewport(scenePoint, zoomedOut), pointer);
    expectPointCloseTo(sceneToViewport(scenePoint, zoomedIn), pointer);
  });
});

describe("panViewport", () => {
  it("converts viewport pixels to scene scroll and moves content by that exact delta", () => {
    const viewport: ViewportState = { scrollX: -20, scrollY: 35, zoom: 0.5 };
    const scenePoint = { x: 70, y: 10 };
    const before = sceneToViewport(scenePoint, viewport);

    const panned = panViewport(viewport, { x: 30, y: -45 });

    expect(panned).toEqual({ scrollX: 40, scrollY: -55, zoom: 0.5 });
    expectPointCloseTo(sceneToViewport(scenePoint, panned), {
      x: before.x + 30,
      y: before.y - 45
    });
  });
});

describe("fitSceneRect", () => {
  const viewportSize: Size = { width: 1000, height: 600 };

  const expectCentered = (
    sceneRect: SceneRect,
    viewport: ViewportState,
    size: Size = viewportSize
  ) => {
    expectPointCloseTo(sceneToViewport({
      x: sceneRect.x + sceneRect.width / 2,
      y: sceneRect.y + sceneRect.height / 2
    }, viewport), { x: size.width / 2, y: size.height / 2 });
  };

  it("fits the limiting axis to the requested fraction and centers the scene", () => {
    const sceneRect: SceneRect = { x: 100, y: -50, width: 400, height: 400 };

    const fitted = fitSceneRect(sceneRect, viewportSize, {
      viewportFactor: 0.8,
      minZoom: 0.08,
      maxZoom: 1.8
    });

    expect(fitted.zoom).toBeCloseTo(1.2, 12);
    expect(sceneRect.height * fitted.zoom).toBeCloseTo(viewportSize.height * 0.8, 12);
    expect(sceneRect.width * fitted.zoom).toBeLessThanOrEqual(viewportSize.width * 0.8);
    expectCentered(sceneRect, fitted);
  });

  it("honors custom minimum and maximum zoom while retaining centering", () => {
    const largeRect: SceneRect = { x: -5000, y: 200, width: 10000, height: 5000 };
    const smallRect: SceneRect = { x: 12, y: 30, width: 10, height: 20 };

    const minimumFit = fitSceneRect(largeRect, viewportSize, {
      viewportFactor: 0.8,
      minZoom: 0.25,
      maxZoom: 1.4
    });
    const maximumFit = fitSceneRect(smallRect, viewportSize, {
      viewportFactor: 0.8,
      minZoom: 0.25,
      maxZoom: 1.4
    });

    expect(minimumFit.zoom).toBe(0.25);
    expect(maximumFit.zoom).toBe(1.4);
    expectCentered(largeRect, minimumFit);
    expectCentered(smallRect, maximumFit);
  });

  it("uses global zoom limits for defaults and degenerate rectangles", () => {
    const pointRect: SceneRect = { x: 40, y: -20, width: 0, height: 0 };
    const lineRect: SceneRect = { x: 10, y: 15, width: 0, height: 12000 };

    const pointFit = fitSceneRect(pointRect, viewportSize, { viewportFactor: 0.82 });
    const lineFit = fitSceneRect(lineRect, viewportSize, { viewportFactor: 0.82 });

    expect(pointFit.zoom).toBe(MAX_CANVAS_ZOOM);
    expect(lineFit.zoom).toBe(MIN_CANVAS_ZOOM);
    expectCentered(pointRect, pointFit);
    expectCentered(lineRect, lineFit);
  });

  it("rejects dimensions and options that cannot define a fit", () => {
    const sceneRect: SceneRect = { x: 0, y: 0, width: 100, height: 100 };

    expect(() => fitSceneRect(sceneRect, { width: 0, height: 600 }, {
      viewportFactor: 0.8
    })).toThrow(RangeError);
    expect(() => fitSceneRect({ ...sceneRect, width: -1 }, viewportSize, {
      viewportFactor: 0.8
    })).toThrow(RangeError);
    expect(() => fitSceneRect(sceneRect, viewportSize, {
      viewportFactor: 0
    })).toThrow(RangeError);
    expect(() => fitSceneRect(sceneRect, viewportSize, {
      viewportFactor: 0.8,
      minZoom: 1.2,
      maxZoom: 0.5
    })).toThrow(RangeError);
  });
});

describe("interpolateViewport", () => {
  const from: ViewportState = { scrollX: -100, scrollY: 50, zoom: 0.4 };
  const to: ViewportState = { scrollX: 300, scrollY: -150, zoom: 1.6 };

  it("linearly interpolates every viewport component", () => {
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    expect(interpolateViewport(from, to, 0.25)).toEqual({
      scrollX: 0,
      scrollY: 0,
      zoom: 0.7000000000000001
    });
    expect(interpolateViewport(from, to, 1)).toEqual(to);
  });

  it("clamps animation progress to its endpoint states", () => {
    expect(interpolateViewport(from, to, -1)).toEqual(from);
    expect(interpolateViewport(from, to, 2)).toEqual(to);
    expect(from).toEqual({ scrollX: -100, scrollY: 50, zoom: 0.4 });
    expect(to).toEqual({ scrollX: 300, scrollY: -150, zoom: 1.6 });
  });
});
