import { describe, expect, it } from "vitest";

import {
  connectorPaths,
  roundedConnectorPath,
  roundedConnectorPoints
} from "./connectorStyle";
import type { RouteSegment } from "./connectionGeometry";

describe("modern connector rendering", () => {
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
