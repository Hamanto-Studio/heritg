import {
  expandRect, hasForbiddenIntersection, ROUTE_CLEARANCE, routeIsClear, segmentOrientation,
  type RouteObstacle, type RouteSegment
} from "./connectionGeometry";

/** One routing search's obstacles are fixed. Do not retain this checker across
 * edits or label placement; each search creates its own short-lived indexes. */
export function createRouteClearance(obstacles: readonly RouteObstacle[], endpointIds: ReadonlySet<string>) {
  const indexAxis = (axis: "x" | "y") => {
    const entries = obstacles.map((obstacle) => {
      const rect = expandRect(obstacle.rect, ROUTE_CLEARANCE);
      return { obstacle, lower: rect[axis], upper: rect[axis] + rect[axis === "x" ? "width" : "height"], maxUpper: 0 };
    }).sort((a, b) => a.lower - b.lower);
    let upper = -Infinity;
    for (const entry of entries) entry.maxUpper = upper = Math.max(upper, entry.upper);
    return entries;
  };
  let xIndex: ReturnType<typeof indexAxis> | undefined, yIndex: ReturnType<typeof indexAxis> | undefined;
  let checked = false;
  return (segments: readonly RouteSegment[]) => {
    // Most already-clear household rails succeed on the first check. Only
    // repeated detour searches in larger archives pay for the spatial index.
    if (!checked || obstacles.length < 64) {
      checked = true;
      return routeIsClear(segments, obstacles, endpointIds);
    }
    return segments.length > 0 && segments.every((segment) => {
      const orientation = segmentOrientation(segment);
      if (!orientation) return true; // Same predicate as routeIsClear; validity is checked separately.
      const horizontal = orientation === "horizontal", coordinate = horizontal ? segment.start.y : segment.start.x;
      const entries = horizontal ? yIndex ??= indexAxis("y") : xIndex ??= indexAxis("x");
      let low = 0, high = entries.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle].lower <= coordinate) low = middle + 1;
        else high = middle;
      }
      // Every omitted obstacle lies entirely off this line's fixed axis.
      // Keep the existing precise clearance and avatar-terminal rules for
      // all possible hits, including tolerance-boundary contacts.
      for (let i = low - 1; i >= 0 && entries[i].maxUpper >= coordinate; i--) {
        const entry = entries[i];
        if (entry.upper >= coordinate && hasForbiddenIntersection(segment, entry.obstacle, endpointIds)) return false;
      }
      return true;
    });
  };
}
