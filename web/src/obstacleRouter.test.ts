import { describe, expect, it } from "vitest";
import { preferredRoute, routeBetweenPeople, routeCrossingCount } from "./obstacleRouter";
import { hasCollinearOverlap, routeIsClear, segmentsForPoints, type RouteObstacle } from "./connectionGeometry";

describe("crossing-aware relationship corridors", () => {
  it("attaches offset marriage ports to the circle rather than the avatar's bounding square", () => {
    const left = { x: -130, y: 0 }, right = { x: 130, y: 0 }, endpoints = new Set(["left", "right"]);
    const obstacles: RouteObstacle[] = [
      ...[left, right].map((person, index) => ({ kind: "avatar" as const, ownerId: index ? "right" : "left",
        rect: { x: person.x - 32, y: -32, width: 64, height: 64 } })),
      { kind: "relationshipLabel", ownerId: "other", rect: { x: -2, y: -2, width: 4, height: 4 } }
    ];
    const route = routeBetweenPeople(left, right, endpoints, obstacles, [], 32)!;
    expect(route).toHaveLength(1);
    expect(route[0].start.y).toBe(-12);
    for (const [point, person] of [[route[0].start, left], [route[0].end, right]]) {
      expect(Math.hypot(point.x - person.x, point.y - person.y)).toBeCloseTo(32, 9);
    }
    expect(routeIsClear(route, obstacles, endpoints)).toBe(true);
  });

  it("does not sort the archive for an already-clear rail or marriage", () => {
    let identityReads = 0;
    const obstacles: RouteObstacle[] = Array.from({ length: 128 }, (_, index) => ({
      kind: "nodeLabel", get ownerId() { identityReads++; return `distant-${index}`; },
      rect: { x: index * 300, y: 1000, width: 180, height: 60 }
    }));
    const start = { x: 0, y: 0 }, end = { x: 400, y: 0 };
    expect(preferredRoute(start, end, obstacles, new Set(), [], true)).toEqual([{ start, end }]);
    expect(routeBetweenPeople(start, end, new Set(), obstacles, [], 32))
      .toEqual([{ start: { x: 32, y: 0 }, end: { x: 368, y: 0 } }]);
    expect(identityReads).toBe(0);
  });

  it("does not rescan obstacles for additional ports that cannot beat a clear marriage line", () => {
    let reads = 0;
    const obstacles: RouteObstacle[] = [-130, 130].map((x, index) => ({
      ownerId: index ? "right" : "left", kind: "avatar",
      get rect() { reads++; return { x: x - 32, y: -32, width: 64, height: 64 }; }
    }));
    const left = { x: -130, y: 0 }, right = { x: 130, y: 0 }, endpoints = new Set(["left", "right"]);
    const direct = routeBetweenPeople(left, right, endpoints, obstacles, [], 32);
    const directReads = reads;
    reads = 0;
    const losingPorts = Array.from({ length: 100 }, (_, index) => ({
      start: { x: left.x, y: -32 }, end: { x: right.x, y: -32 }, penalty: index
    }));
    expect(routeBetweenPeople(left, right, endpoints, obstacles, [], 32, losingPorts)).toEqual(direct);
    expect(direct).toEqual([{ start: { x: -98, y: 0 }, end: { x: 98, y: 0 } }]);
    expect(reads).toBe(directReads);
  });

  it("takes a longer clear family rail while retaining the original T-joins", () => {
    const start = { x: 0, y: 0 }, end = { x: 400, y: 0 };
    const occupied = [
      { start: { x: 0, y: -200 }, end: { x: 0, y: 200 } },
      { start: { x: 400, y: -200 }, end: { x: 400, y: 200 } },
      { start: { x: 200, y: -100 }, end: { x: 200, y: 100 } }
    ];
    const before = JSON.stringify(occupied);
    const ordinary = preferredRoute(start, end, [], new Set(), occupied)!;
    const clearer = preferredRoute(start, end, [], new Set(), occupied, true)!;
    expect(routeCrossingCount(ordinary, occupied)).toBeGreaterThan(0);
    expect(routeCrossingCount(clearer, occupied)).toBeLessThan(routeCrossingCount(ordinary, occupied));
    expect(clearer[0].start).toEqual(start);
    expect(clearer.at(-1)!.end).toEqual(end);
    expect(clearer[0].start.y).toBe(clearer[0].end.y);
    expect(clearer.at(-1)!.start.y).toBe(clearer.at(-1)!.end.y);
    expect(hasCollinearOverlap(clearer, occupied)).toBe(false);
    expect(JSON.stringify(occupied)).toBe(before);
  });

  it("keeps already-clear rails and the direction of a detoured vertical person stem", () => {
    const start = { x: 0, y: 0 }, end = { x: 0, y: 400 };
    const occupied = [{ start: { x: -100, y: 200 }, end: { x: 100, y: 200 } }];
    expect(preferredRoute(start, { x: 400, y: 0 }, [], new Set(), occupied, true))
      .toEqual(preferredRoute(start, { x: 400, y: 0 }, [], new Set(), occupied));
    const route = preferredRoute(start, end, [], new Set(), occupied, true)!;
    expect(routeCrossingCount(route, occupied)).toBe(0);
    expect(route[0].start).toEqual(start);
    expect(route[0].end.x).toBe(start.x);
    expect(route[0].end.y).toBeGreaterThan(start.y);
    expect(route.at(-1)!.end).toEqual(end);
    expect(route.at(-1)!.start.x).toBe(end.x);
    expect(route.at(-1)!.start.y).toBeLessThan(end.y);
  });

  it("counts a crossing once even when either line is split at the intersection", () => {
    const horizontal = segmentsForPoints([{ x: -20, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }]);
    const vertical = [{ start: { x: 0, y: -20 }, end: { x: 0, y: 0 } },
      { start: { x: 0, y: 0 }, end: { x: 0, y: 20 } }];
    expect(routeCrossingCount(horizontal, vertical)).toBe(1);
    expect(routeCrossingCount(vertical, horizontal)).toBe(1);
  });

  it("permits a common terminal but penalizes an unrelated T-shaped meeting", () => {
    const horizontal = segmentsForPoints([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(routeCrossingCount(horizontal, segmentsForPoints([{ x: 0, y: -20 }, { x: 0, y: 0 }]))).toBe(0);
    expect(routeCrossingCount(horizontal, segmentsForPoints([{ x: 10, y: -20 }, { x: 10, y: 0 }]))).toBe(1);
  });

  it("takes a clear partner port instead of a shorter path through an earlier union", () => {
    const endpoints = new Set(["left", "right"]);
    const obstacles: RouteObstacle[] = [-130, 130].map((x, index) => ({ ownerId: index ? "right" : "left",
      kind: "avatar", rect: { x: x - 32, y: -32, width: 64, height: 64 } }));
    const occupied = segmentsForPoints([
      { x: -358, y: 0 }, { x: -348, y: 0 }, { x: -348, y: -40 },
      { x: 88, y: -40 }, { x: 88, y: 0 }, { x: 98, y: 0 }
    ]);
    const before = JSON.stringify({ obstacles, occupied });
    const route = routeBetweenPeople({ x: -130, y: 0 }, { x: 130, y: 0 }, endpoints, obstacles, occupied, 32)!;
    expect(route).toBeDefined();
    expect(routeCrossingCount(route, occupied)).toBe(0);
    expect(routeIsClear(route, obstacles, endpoints)).toBe(true);
    expect(routeBetweenPeople({ x: -130, y: 0 }, { x: 130, y: 0 }, endpoints, [...obstacles].reverse(), occupied, 32)).toEqual(route);
    expect(JSON.stringify({ obstacles, occupied })).toBe(before);
  });
});
