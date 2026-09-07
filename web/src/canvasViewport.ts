import type { ViewportState } from "./types";

export type { ViewportState } from "./types";

// Wide 500-person trees can exceed 90,000 scene units. Fit-all must not clip
// most of the family just because its natural overview is below eight percent.
export const MIN_CANVAS_ZOOM = 0.001;
export const MAX_CANVAS_ZOOM = 1.8;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SceneRect extends Point, Size {}

export interface FitViewportOptions {
  viewportFactor: number;
  minZoom?: number;
  maxZoom?: number;
}

export const clampZoom = (zoom: number): number => {
  if (Number.isNaN(zoom)) throw new RangeError("Zoom must be a number.");
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
};

export const sceneToViewport = (point: Point, viewport: ViewportState): Point => ({
  x: (point.x + viewport.scrollX) * viewport.zoom,
  y: (point.y + viewport.scrollY) * viewport.zoom
});

export const zoomViewportAt = (
  viewport: ViewportState,
  viewportPoint: Point,
  zoom: number
): ViewportState => {
  const nextZoom = clampZoom(zoom);
  return {
    scrollX: viewport.scrollX + viewportPoint.x * (1 / nextZoom - 1 / viewport.zoom),
    scrollY: viewport.scrollY + viewportPoint.y * (1 / nextZoom - 1 / viewport.zoom),
    zoom: nextZoom
  };
};

/** Moves rendered content by the supplied viewport-pixel delta. */
export const panViewport = (
  viewport: ViewportState,
  viewportDelta: Point
): ViewportState => ({
  scrollX: viewport.scrollX + viewportDelta.x / viewport.zoom,
  scrollY: viewport.scrollY + viewportDelta.y / viewport.zoom,
  zoom: viewport.zoom
});

export const fitSceneRect = (
  sceneRect: SceneRect,
  viewportSize: Size,
  options: FitViewportOptions
): ViewportState => {
  if (
    !Number.isFinite(sceneRect.x) ||
    !Number.isFinite(sceneRect.y) ||
    !Number.isFinite(sceneRect.width) ||
    !Number.isFinite(sceneRect.height) ||
    sceneRect.width < 0 ||
    sceneRect.height < 0
  ) {
    throw new RangeError("Scene rectangle must have finite coordinates and non-negative dimensions.");
  }
  if (
    !Number.isFinite(viewportSize.width) ||
    !Number.isFinite(viewportSize.height) ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0
  ) {
    throw new RangeError("Viewport dimensions must be finite and positive.");
  }
  if (!Number.isFinite(options.viewportFactor) || options.viewportFactor <= 0) {
    throw new RangeError("Viewport factor must be finite and positive.");
  }

  const minZoom = clampZoom(options.minZoom ?? MIN_CANVAS_ZOOM);
  const maxZoom = clampZoom(options.maxZoom ?? MAX_CANVAS_ZOOM);
  if (minZoom > maxZoom) throw new RangeError("Minimum zoom cannot exceed maximum zoom.");

  const widthZoom = sceneRect.width === 0
    ? Number.POSITIVE_INFINITY
    : viewportSize.width * options.viewportFactor / sceneRect.width;
  const heightZoom = sceneRect.height === 0
    ? Number.POSITIVE_INFINITY
    : viewportSize.height * options.viewportFactor / sceneRect.height;
  const naturalZoom = Math.min(widthZoom, heightZoom);
  const zoom = Math.min(maxZoom, Math.max(minZoom, naturalZoom));
  const sceneCenterX = sceneRect.x + sceneRect.width / 2;
  const sceneCenterY = sceneRect.y + sceneRect.height / 2;

  return {
    scrollX: viewportSize.width / (2 * zoom) - sceneCenterX,
    scrollY: viewportSize.height / (2 * zoom) - sceneCenterY,
    zoom
  };
};

export const interpolateViewport = (
  from: ViewportState,
  to: ViewportState,
  progress: number
): ViewportState => {
  const amount = Math.min(1, Math.max(0, progress));
  return {
    scrollX: from.scrollX + (to.scrollX - from.scrollX) * amount,
    scrollY: from.scrollY + (to.scrollY - from.scrollY) * amount,
    zoom: from.zoom + (to.zoom - from.zoom) * amount
  };
};
/** Minimum touch targets overlap at Full-tree overview zoom. Resolve pointer
 * selections by visible distance, not which transparent button paints last.
 * Keyboard activation keeps the explicitly focused person's identity. */
export function nearestCanvasPerson(people: readonly (Point & { id: string })[], viewport: ViewportState, pointer: Point) {
  let nearest: string | undefined, distance = Infinity;
  for (const person of people) {
    const screen = sceneToViewport(person, viewport);
    const candidate = (screen.x - pointer.x) ** 2 + (screen.y - pointer.y) ** 2;
    if (candidate < distance || candidate === distance && (!nearest || person.id < nearest)) {
      nearest = person.id; distance = candidate;
    }
  }
  return nearest;
}
