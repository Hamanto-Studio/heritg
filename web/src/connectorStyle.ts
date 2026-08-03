import {
  ROUTE_EPSILON,
  pointOnSegment,
  pointsEqual,
  segmentOrientation,
  type RoutePoint,
  type RouteSegment
} from "./connectionGeometry";

export const CONNECTOR_STYLE = {
  width: 2,
  cornerRadius: 12,
  junctionRadius: 2,
  crossingRadius: 5,
  familyColor: "#9c825f",
  partnerColor: "#b47c76",
  siblingColor: "#78956c",
  siblingDash: "6 7"
} as const;

const stableCoordinate = (value: number) => {
  const normalized = Math.abs(value) < ROUTE_EPSILON ? 0 : value;
  return Number(normalized.toFixed(3));
};

const pointKey = (point: RoutePoint) =>
  `${stableCoordinate(point.x)}:${stableCoordinate(point.y)}`;

const comparePoints = (left: RoutePoint, right: RoutePoint) =>
  left.y - right.y || left.x - right.x;

const directionFrom = (point: RoutePoint, other: RoutePoint) => {
  if (other.x < point.x - ROUTE_EPSILON) return "left";
  if (other.x > point.x + ROUTE_EPSILON) return "right";
  if (other.y < point.y - ROUTE_EPSILON) return "up";
  if (other.y > point.y + ROUTE_EPSILON) return "down";
  return undefined;
};

/** Returns only real T- and cross-junctions, never bends or person endpoints. */
export const branchJunctions = (segments: readonly RouteSegment[]) => {
  const candidates = new Map<string, RoutePoint>();
  segments.forEach(({ start, end }) => {
    candidates.set(pointKey(start), start);
    candidates.set(pointKey(end), end);
  });
  segments.forEach((segment, index) => {
    segments.slice(index + 1).forEach((other) => {
      const segmentDirection = segmentOrientation(segment);
      const otherDirection = segmentOrientation(other);
      if (!segmentDirection || !otherDirection || segmentDirection === otherDirection) return;
      const horizontal = segmentDirection === "horizontal" ? segment : other;
      const vertical = segmentDirection === "vertical" ? segment : other;
      const intersection = { x: vertical.start.x, y: horizontal.start.y };
      if (pointOnSegment(intersection, horizontal) && pointOnSegment(intersection, vertical)) {
        candidates.set(pointKey(intersection), intersection);
      }
    });
  });
  return [...candidates.values()]
    .filter((point) => {
      const directions = new Set<string>();
      segments.forEach((segment) => {
        if (!pointOnSegment(point, segment)) return;
        const startDirection = directionFrom(point, segment.start);
        const endDirection = directionFrom(point, segment.end);
        if (startDirection) directions.add(startDirection);
        if (endDirection) directions.add(endDirection);
      });
      return directions.size >= 3;
    })
    .sort(comparePoints);
};

const simplifyPoints = (rawPoints: readonly RoutePoint[]) => {
  const points = rawPoints.reduce<RoutePoint[]>((result, point) => {
    if (!result.length || !pointsEqual(result[result.length - 1], point)) {
      result.push(point);
    }
    return result;
  }, []);
  for (let index = 1; index < points.length - 1;) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if ((previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y)) {
      points.splice(index, 1);
    } else {
      index += 1;
    }
  }
  return points;
};

interface GraphEdge {
  index: number;
  startKey: string;
  endKey: string;
}

interface GraphNode {
  point: RoutePoint;
  edgeIndexes: number[];
}

/**
 * Joins an orthogonal segment network into the longest safe paths it can draw.
 * Branch points remain path endpoints so family rails keep their exact topology,
 * while ordinary elbows become rounded points on one continuous connector.
 */
export const connectorPaths = (segments: readonly RouteSegment[]) => {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const ensureNode = (point: RoutePoint) => {
    const key = pointKey(point);
    if (!nodes.has(key)) nodes.set(key, { point, edgeIndexes: [] });
    return key;
  };

  segments.forEach((segment, index) => {
    if (pointsEqual(segment.start, segment.end)) return;
    const startKey = ensureNode(segment.start);
    const endKey = ensureNode(segment.end);
    const edgeIndex = edges.length;
    edges.push({ index, startKey, endKey });
    nodes.get(startKey)?.edgeIndexes.push(edgeIndex);
    nodes.get(endKey)?.edgeIndexes.push(edgeIndex);
  });

  const visited = new Set<number>();
  const results: Array<{ points: RoutePoint[]; segmentIndexes: number[] }> = [];
  const otherKey = (edge: GraphEdge, key: string) =>
    edge.startKey === key ? edge.endKey : edge.startKey;
  const sortedEdges = (key: string, indexes: readonly number[]) =>
    [...indexes].sort((left, right) => {
      const leftPoint = nodes.get(otherKey(edges[left], key))?.point;
      const rightPoint = nodes.get(otherKey(edges[right], key))?.point;
      return leftPoint && rightPoint ? comparePoints(leftPoint, rightPoint) : left - right;
    });

  const walk = (startKey: string, firstEdgeIndex: number) => {
    const pathPoints: RoutePoint[] = [nodes.get(startKey)!.point];
    const segmentIndexes: number[] = [];
    let currentKey = startKey;
    let edgeIndex = firstEdgeIndex;
    while (!visited.has(edgeIndex)) {
      visited.add(edgeIndex);
      const edge = edges[edgeIndex];
      segmentIndexes.push(edge.index);
      currentKey = otherKey(edge, currentKey);
      const currentNode = nodes.get(currentKey)!;
      pathPoints.push(currentNode.point);
      if (currentNode.edgeIndexes.length !== 2) break;
      const next = sortedEdges(currentKey, currentNode.edgeIndexes)
        .find((candidate) => !visited.has(candidate));
      if (next === undefined) break;
      edgeIndex = next;
    }
    const points = simplifyPoints(pathPoints);
    if (points.length > 1) results.push({ points, segmentIndexes });
  };

  [...nodes.entries()]
    .filter(([, node]) => node.edgeIndexes.length !== 2)
    .sort(([, left], [, right]) => comparePoints(left.point, right.point))
    .forEach(([key, node]) => {
      sortedEdges(key, node.edgeIndexes).forEach((edgeIndex) => {
        if (!visited.has(edgeIndex)) walk(key, edgeIndex);
      });
    });

  edges.forEach((edge, edgeIndex) => {
    if (!visited.has(edgeIndex)) walk(edge.startKey, edgeIndex);
  });

  return results;
};

const pathNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const distance = (left: RoutePoint, right: RoutePoint) =>
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

const pointToward = (from: RoutePoint, to: RoutePoint, amount: number): RoutePoint => ({
  x: from.x + Math.sign(to.x - from.x) * Math.min(amount, Math.abs(to.x - from.x)),
  y: from.y + Math.sign(to.y - from.y) * Math.min(amount, Math.abs(to.y - from.y))
});

const quadraticPoint = (
  start: RoutePoint,
  control: RoutePoint,
  end: RoutePoint,
  progress: number
): RoutePoint => {
  const remaining = 1 - progress;
  return {
    x: remaining * remaining * start.x +
      2 * remaining * progress * control.x +
      progress * progress * end.x,
    y: remaining * remaining * start.y +
      2 * remaining * progress * control.y +
      progress * progress * end.y
  };
};

/** Samples the same restrained corner arcs for Excalidraw's polyline renderer. */
export const roundedConnectorPoints = (
  points: readonly RoutePoint[],
  radius = CONNECTOR_STYLE.cornerRadius,
  curveSteps = 4
) => {
  if (points.length < 3) return [...points];
  const result: RoutePoint[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const isCorner = previous.x !== next.x && previous.y !== next.y;
    if (!isCorner) {
      result.push(current);
      continue;
    }
    const cornerRadius = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2);
    const before = pointToward(current, previous, cornerRadius);
    const after = pointToward(current, next, cornerRadius);
    result.push(before);
    for (let step = 1; step < curveSteps; step += 1) {
      result.push(quadraticPoint(before, current, after, step / curveSteps));
    }
    result.push(after);
  }
  result.push(points[points.length - 1]);
  return result;
};

/** Builds a crisp SVG path with restrained rounded corners for image export. */
export const roundedConnectorPath = (
  points: readonly RoutePoint[],
  offsetX = 0,
  offsetY = 0,
  radius = CONNECTOR_STYLE.cornerRadius
) => {
  if (points.length < 2) return "";
  const translated = points.map(({ x, y }) => ({ x: x + offsetX, y: y + offsetY }));
  const commands = [`M ${pathNumber(translated[0].x)} ${pathNumber(translated[0].y)}`];
  for (let index = 1; index < translated.length - 1; index += 1) {
    const previous = translated[index - 1];
    const current = translated[index];
    const next = translated[index + 1];
    const isCorner = previous.x !== next.x && previous.y !== next.y;
    if (!isCorner) {
      commands.push(`L ${pathNumber(current.x)} ${pathNumber(current.y)}`);
      continue;
    }
    const cornerRadius = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2);
    const before = pointToward(current, previous, cornerRadius);
    const after = pointToward(current, next, cornerRadius);
    commands.push(
      `L ${pathNumber(before.x)} ${pathNumber(before.y)}`,
      `Q ${pathNumber(current.x)} ${pathNumber(current.y)} ${pathNumber(after.x)} ${pathNumber(after.y)}`
    );
  }
  const last = translated[translated.length - 1];
  commands.push(`L ${pathNumber(last.x)} ${pathNumber(last.y)}`);
  return commands.join(" ");
};
