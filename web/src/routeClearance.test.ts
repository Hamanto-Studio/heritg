import { describe, expect, it } from "vitest";
import { createRouteClearance } from "./routeClearance";
import { routeIsClear, ROUTE_CLEARANCE, ROUTE_EPSILON, type RouteObstacle, type RouteSegment } from "./connectionGeometry";

const farObstacles = (): RouteObstacle[] => Array.from({ length: 128 }, (_, i) => ({
  kind: "nodeLabel", ownerId: `distant-${i}`,
  rect: { x: 1000 + i * 300, y: 1000 + i * 300, width: 180, height: 60 }
}));

describe("search-local route clearance index", () => {
  it("matches the exhaustive predicate for shuffled obstacles, clearance boundaries and both line directions", () => {
    let seed = 431;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const obstacles: RouteObstacle[] = Array.from({ length: 128 }, (_, i) => ({
      ownerId: `person-${i}`, kind: (["avatar", "nodeLabel", "relationshipLabel", "addControl", "editControl"] as const)[i % 5],
      rect: { x: Math.floor(random() * 4000) - 2000, y: Math.floor(random() * 4000) - 2000,
        width: 32 + Math.floor(random() * 300), height: 32 + Math.floor(random() * 200) }
    }));
    const routes: RouteSegment[][] = [];
    for (const { rect } of obstacles) {
      for (const axis of ["x", "y"] as const) {
        const vertical = axis === "x", dimension = vertical ? "width" : "height";
        for (const coordinate of [rect[axis] - ROUTE_CLEARANCE, rect[axis], rect[axis] + rect[dimension], rect[axis] + rect[dimension] + ROUTE_CLEARANCE]) {
          for (const epsilon of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
            const position = coordinate + epsilon * ROUTE_EPSILON;
            const start = vertical ? { x: position, y: -3000 } : { x: -3000, y: position };
            const end = vertical ? { x: position, y: 3000 } : { x: 3000, y: position };
            routes.push([{ start, end }], [{ start: end, end: start }]);
          }
        }
      }
    }
    const before = JSON.stringify(obstacles), endpoints = new Set(obstacles.slice(0, 40).map((obstacle) => obstacle.ownerId));
    for (const input of [obstacles, [...obstacles].reverse()]) {
      const clear = createRouteClearance(input, endpoints);
      expect(clear([])).toBe(false);
      for (const route of routes) expect(clear(route)).toBe(routeIsClear(route, input, endpoints));
    }
    expect(JSON.stringify(obstacles)).toBe(before);
  });

  it("retains circle sockets, node-label exits and ownership restrictions", () => {
    const obstacles: RouteObstacle[] = [...farObstacles(),
      { kind: "avatar", ownerId: "person", rect: { x: -32, y: -32, width: 64, height: 64 } },
      { kind: "nodeLabel", ownerId: "person", rect: { x: -70, y: 44, width: 140, height: 40 } }
    ];
    const offsetY = -Math.sqrt(32 ** 2 - 24 ** 2);
    const cases = [
      { start: { x: -24, y: offsetY }, end: { x: -24, y: -200 } },
      { start: { x: -24, y: offsetY }, end: { x: -24, y: 0 } },
      { start: { x: 32, y: 0 }, end: { x: 200, y: 0 } },
      { start: { x: 0, y: 86 }, end: { x: 0, y: 200 } },
      { start: { x: 0, y: 86 }, end: { x: 100, y: 86 } },
      { start: { x: -200, y: 0 }, end: { x: 200, y: 0 } }
    ];
    for (const endpoints of [new Set(["person"]), new Set<string>()]) {
      const clear = createRouteClearance(obstacles, endpoints);
      clear([]);
      for (const segment of cases) {
        expect(clear([segment])).toBe(routeIsClear([segment], obstacles, endpoints));
        expect(clear([{ start: segment.end, end: segment.start }])).toBe(routeIsClear([segment], obstacles, endpoints));
      }
    }
    expect(createRouteClearance(obstacles, new Set(["person"]))([cases[0]])).toBe(true);
    expect(createRouteClearance(obstacles, new Set())([cases[0]])).toBe(false);
  });

  it("avoids repeatedly inspecting distant rectangles and never caches across label placement", () => {
    let reads = 0;
    const obstacles = farObstacles().map((obstacle) => ({ ...obstacle, get rect() { reads++; return obstacle.rect; } }));
    const route = [{ start: { x: -100, y: 0 }, end: { x: 500, y: 0 } }];
    const clear = createRouteClearance(obstacles, new Set());
    expect(clear(route)).toBe(true);
    expect(reads).toBeGreaterThan(0);
    expect(clear(route)).toBe(true); // Build the horizontal index once.
    reads = 0;
    expect(clear(route)).toBe(true);
    expect(reads).toBe(0);
    const withLabel: RouteObstacle[] = [...obstacles, { kind: "relationshipLabel", ownerId: "new-label",
      rect: { x: 100, y: -10, width: 80, height: 20 } }];
    const afterPlacement = createRouteClearance(withLabel, new Set());
    expect(afterPlacement(route)).toBe(false);
    expect(afterPlacement(route)).toBe(false);
  });

  it("keeps the same empty, point, diagonal and near-axis predicate as the exhaustive check", () => {
    const obstacles = farObstacles(), clear = createRouteClearance(obstacles, new Set());
    clear([]);
    const routes: RouteSegment[][] = [[], [{ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }],
      [{ start: { x: 0, y: 0 }, end: { x: 2000, y: 2000 } }],
      [{ start: { x: 990, y: 1000 }, end: { x: 990.0005, y: 2000 } }],
      [{ start: { x: 1000, y: 990 }, end: { x: 2000, y: 990.0005 } }]];
    for (const route of routes) expect(clear(route)).toBe(routeIsClear(route, obstacles));
  });
});
