import { describe, expect, it } from "vitest";

import {
  branchJunctions,
  connectorPaths,
  roundedConnectorPath,
  roundedConnectorPoints
} from "./connectorStyle";
import type { RouteSegment } from "./connectionGeometry";

describe("modern connector rendering", () => {
  it("shows junction dots only where at least three connector directions meet", () => {
    const bend: RouteSegment[] = [
      { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
      { start: { x: 40, y: 0 }, end: { x: 40, y: 60 } }
    ];
    const personEndpoint: RouteSegment[] = [
      { start: { x: 0, y: 0 }, end: { x: 0, y: 60 } }
    ];
    const branch: RouteSegment[] = [
      ...bend,
      { start: { x: 40, y: 0 }, end: { x: 80, y: 0 } }
    ];
    const crossing: RouteSegment[] = [
      { start: { x: 0, y: 30 }, end: { x: 80, y: 30 } },
      { start: { x: 40, y: 0 }, end: { x: 40, y: 60 } }
    ];

    expect(branchJunctions(bend)).toEqual([]);
    expect(branchJunctions(personEndpoint)).toEqual([]);
    expect(branchJunctions(branch)).toEqual([{ x: 40, y: 0 }]);
    expect(branchJunctions(crossing)).toEqual([{ x: 40, y: 30 }]);
  });

  it("joins ordinary elbows into one path but stops at family branch points", () => {
    const segments: RouteSegment[] = [
      { start: { x: 0, y: 0 }, end: { x: 0, y: 40 } },
      { start: { x: 0, y: 40 }, end: { x: 80, y: 40 } },
      { start: { x: 80, y: 40 }, end: { x: 80, y: 100 } },
      { start: { x: 0, y: 40 }, end: { x: -80, y: 40 } }
    ];

    const paths = connectorPaths(segments);

    expect(paths).toHaveLength(3);
    expect(paths.flatMap(({ segmentIndexes }) => segmentIndexes).sort()).toEqual([0, 1, 2, 3]);
    expect(paths.some(({ points }) => points.length === 3)).toBe(true);
  });

  it("creates controlled rounded corners without moving connector endpoints", () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 80, y: 40 }];
    const sampled = roundedConnectorPoints(points);
    const svgPath = roundedConnectorPath(points);

    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
    expect(sampled).toContainEqual({ x: 0, y: 28 });
    expect(sampled).toContainEqual({ x: 12, y: 40 });
    expect(svgPath).toBe("M 0 0 L 0 28 Q 0 40 12 40 L 80 40");
  });
});
