import {
  ROUTE_CLEARANCE,
  ROUTE_EPSILON,
  compareText,
  expandRect,
  hasCollinearOverlap,
  hasForbiddenIntersection,
  isAvatarCircleTerminal,
  pointsEqual,
  rectsIntersect,
  relationshipLabelRect,
  segmentIntersectsRect,
  segmentLength,
  segmentOrientation,
  segmentsForPoints,
  type PlannedRelationshipLabel,
  type RouteObstacle,
  type RoutePoint,
  type RouteSegment
} from "./connectionGeometry";
import { createRouteClearance } from "./routeClearance";

const COORDINATE_PADDING = 2;
const BEND_PENALTY = 24;
const CROSSING_PENALTY = 1024;

/** Prefer a clear union corridor over a slightly shorter crossing. Endpoint
 * joins are not crossings; split segments must count one intersection once. */
export const routeCrossingCount = (route: readonly RouteSegment[], occupied: readonly RouteSegment[]) => {
  const points: RoutePoint[] = [];
  for (const segment of route) for (const other of occupied) {
    const horizontal = segmentOrientation(segment) === "horizontal" ? segment : other;
    const vertical = horizontal === segment ? other : segment;
    if (segmentOrientation(horizontal) !== "horizontal" || segmentOrientation(vertical) !== "vertical") continue;
    const x = vertical.start.x, y = horizontal.start.y;
    if (x < Math.min(horizontal.start.x, horizontal.end.x) - ROUTE_EPSILON ||
        x > Math.max(horizontal.start.x, horizontal.end.x) + ROUTE_EPSILON ||
        y < Math.min(vertical.start.y, vertical.end.y) - ROUTE_EPSILON ||
        y > Math.max(vertical.start.y, vertical.end.y) + ROUTE_EPSILON) continue;
    const point = { x, y };
    const commonTerminal = [route[0]?.start, route.at(-1)?.end].some((end) => end && pointsEqual(end, point)) &&
      [other.start, other.end].some((end) => pointsEqual(end, point));
    if (!commonTerminal && !points.some((existing) => pointsEqual(existing, point))) points.push(point);
  }
  return points.length;
};

const uniqueNumbers = (values: readonly number[]) => {
  const result: number[] = [];
  const buckets = new Map<number, number[]>();
  for (const value of values) {
    const bucket = Math.floor(value / ROUTE_EPSILON);
    if ([bucket - 1, bucket, bucket + 1].some((key) =>
      buckets.get(key)?.some((existing) => Math.abs(existing - value) < ROUTE_EPSILON))) continue;
    result.push(value);
    const members = buckets.get(bucket) ?? [];
    members.push(value); buckets.set(bucket, members);
  }
  return result;
};

export const sortedObstacles = (obstacles: readonly RouteObstacle[]) => [...obstacles].sort(
  (left, right) => compareText(`${left.kind}:${left.ownerId}`, `${right.kind}:${right.ownerId}`) ||
    left.rect.y - right.rect.y || left.rect.x - right.rect.x ||
    left.rect.height - right.rect.height || left.rect.width - right.rect.width
);

const terminalContact = (point: RoutePoint, obstacle: RouteObstacle) => {
  if (isAvatarCircleTerminal(point, obstacle)) return true;
  const { x, y, width, height } = obstacle.rect;
  if (obstacle.kind === "avatar") {
    return (((Math.abs(point.x - x) < ROUTE_EPSILON ||
      Math.abs(point.x - x - width) < ROUTE_EPSILON) &&
      point.y >= y - ROUTE_EPSILON && point.y <= y + height + ROUTE_EPSILON) ||
      ((Math.abs(point.y - y) < ROUTE_EPSILON ||
      Math.abs(point.y - y - height) < ROUTE_EPSILON) &&
      point.x >= x - ROUTE_EPSILON && point.x <= x + width + ROUTE_EPSILON));
  }
  return obstacle.kind === "nodeLabel" &&
    Math.abs(point.y - y - height - 2) < ROUTE_EPSILON &&
    point.x >= x - ROUTE_EPSILON && point.x <= x + width + ROUTE_EPSILON;
};

const endpointIsBlocked = (
  point: RoutePoint,
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string>
) => obstacles.some((obstacle) => {
  const rect = expandRect(obstacle.rect, ROUTE_CLEARANCE);
  const inside = point.x > rect.x + ROUTE_EPSILON &&
    point.x < rect.x + rect.width - ROUTE_EPSILON &&
    point.y > rect.y + ROUTE_EPSILON &&
    point.y < rect.y + rect.height - ROUTE_EPSILON;
  if (!inside) return false;
  return !endpointIds.has(obstacle.ownerId) || !terminalContact(point, obstacle);
});

const fastCandidates = (
  start: RoutePoint,
  end: RoutePoint,
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[]
) => {
  const clearance = ROUTE_CLEARANCE + COORDINATE_PADDING;
  if (start.y === end.y) {
    const values = uniqueNumbers([
      ...obstacles.flatMap(({ rect }) => [rect.y - clearance, rect.y + rect.height + clearance]),
      ...occupied.filter((segment) => segmentOrientation(segment) === "horizontal")
        .flatMap((segment) => [segment.start.y - 6, segment.start.y + 6])
    ]).sort((left, right) => Math.abs(left - start.y) - Math.abs(right - start.y) || left - right);
    return values.map((y) => segmentsForPoints([
      start, { x: start.x, y }, { x: end.x, y }, end
    ]));
  }
  if (start.x === end.x) {
    const values = uniqueNumbers([
      ...obstacles.flatMap(({ rect }) => [rect.x - clearance, rect.x + rect.width + clearance]),
      ...occupied.filter((segment) => segmentOrientation(segment) === "vertical")
        .flatMap((segment) => [segment.start.x - 6, segment.start.x + 6])
    ]).sort((left, right) => Math.abs(left - start.x) - Math.abs(right - start.x) || left - right);
    return values.map((x) => segmentsForPoints([
      start, { x, y: start.y }, { x, y: end.y }, end
    ]));
  }
  return [segmentsForPoints([start, { x: end.x, y: start.y }, end]),
    segmentsForPoints([start, { x: start.x, y: end.y }, end])];
};

const escapeXCoordinates = (
  point: RoutePoint,
  channelY: number,
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[]
) => {
  const lowerY = Math.min(point.y, channelY);
  const upperY = Math.max(point.y, channelY);
  const blockers = obstacles.filter(({ rect }) =>
    point.x > rect.x - ROUTE_CLEARANCE &&
    point.x < rect.x + rect.width + ROUTE_CLEARANCE &&
    lowerY <= rect.y + rect.height && upperY >= rect.y
  );
  const values = uniqueNumbers([
    point.x,
    ...blockers.flatMap(({ rect }) => [
      rect.x - ROUTE_CLEARANCE - COORDINATE_PADDING,
      rect.x + rect.width + ROUTE_CLEARANCE + COORDINATE_PADDING
    ]),
    ...occupied.filter((segment) => segmentOrientation(segment) === "vertical")
      .flatMap((segment) => [segment.start.x - 6, segment.start.x + 6])
  ]).sort((left, right) => Math.abs(left - point.x) - Math.abs(right - point.x) || left - right)
    .slice(0, 9);
  const minX = Math.min(...obstacles.map(({ rect }) => rect.x));
  const maxX = Math.max(...obstacles.map(({ rect }) => rect.x + rect.width));
  for (const value of [
    minX - ROUTE_CLEARANCE - COORDINATE_PADDING,
    maxX + ROUTE_CLEARANCE + COORDINATE_PADDING
  ]) {
    if (Number.isFinite(value) && !values.some((existing) => Math.abs(existing - value) < ROUTE_EPSILON)) {
      values.push(value);
    }
  }
  return values;
};

const fallbackRoute = (
  start: RoutePoint,
  end: RoutePoint,
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[],
  isAccepted: (route: RouteSegment[]) => boolean,
  costLimit = Number.POSITIVE_INFINITY
) => {
  if (start.x === end.x || start.y === end.y) {
    const direct = segmentsForPoints([start, end]);
    if (isAccepted(direct)) return direct;
  }
  const minObstacleY = Math.min(...obstacles.map(({ rect }) => rect.y), start.y, end.y);
  const maxObstacleY = Math.max(...obstacles.map(({ rect }) => rect.y + rect.height), start.y, end.y);
  const midpointY = (start.y + end.y) / 2;
  const channelYs = uniqueNumbers([
    Math.min(start.y, end.y) - 40,
    Math.max(start.y, end.y) + 40,
    minObstacleY - ROUTE_CLEARANCE - COORDINATE_PADDING,
    maxObstacleY + ROUTE_CLEARANCE + COORDINATE_PADDING,
    ...obstacles.flatMap(({ rect }) => [
      rect.y - ROUTE_CLEARANCE - COORDINATE_PADDING,
      rect.y + rect.height + ROUTE_CLEARANCE + COORDINATE_PADDING
    ]),
    ...occupied.filter((segment) => segmentOrientation(segment) === "horizontal")
      .flatMap((segment) => [segment.start.y - 6, segment.start.y + 6])
  ]).sort((left, right) => Math.abs(left - midpointY) - Math.abs(right - midpointY) || left - right);
  for (const y of channelYs) {
    const minimumLength = Math.abs(end.x - start.x) + Math.abs(start.y - y) + Math.abs(end.y - y);
    if (minimumLength >= costLimit) continue;
    // Both escape sets depend on the channel, not on each other. Rebuilding
    // the end set inside the Cartesian product made distant partner searches
    // repeatedly scan/sort all of a large archive's existing routes.
    const startXs = escapeXCoordinates(start, y, obstacles, occupied);
    const endXs = escapeXCoordinates(end, y, obstacles, occupied);
    for (const startX of startXs) {
      for (const endX of endXs) {
        const candidate = segmentsForPoints([
          start,
          { x: startX, y: start.y },
          { x: startX, y },
          { x: endX, y },
          { x: endX, y: end.y },
          end
        ]);
        const cost = candidate.reduce((sum, segment) => sum + segmentLength(segment), 0) +
          Math.max(candidate.length - 1, 0) * BEND_PENALTY;
        if (cost < costLimit && isAccepted(candidate)) return candidate;
      }
    }
  }
  return undefined;
};

const quickRoute = (
  start: RoutePoint, end: RoutePoint, orderedObstacles: () => readonly RouteObstacle[],
  occupied: readonly RouteSegment[], isAccepted: (route: RouteSegment[]) => boolean
) => {
  const direct = segmentsForPoints([start, end]);
  if (isAccepted(direct)) return direct;
  return fastCandidates(start, end, orderedObstacles(), occupied).find(isAccepted);
};

export const preferredRoute = (
  start: RoutePoint,
  end: RoutePoint,
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string>,
  occupied: readonly RouteSegment[] = [],
  avoidCrossings = false
) => {
  // Ordering matters only for deterministic detour candidates, not for the
  // yes/no clearance check. Clear rails need no archive-wide sort at all.
  let ordered: RouteObstacle[] | undefined;
  const orderedObstacles = () => ordered ??= sortedObstacles(obstacles);
  const isClear = createRouteClearance(obstacles, endpointIds);
  const isAccepted = (route: RouteSegment[]) => isClear(route) && !hasCollinearOverlap(route, occupied);
  if (endpointIsBlocked(start, obstacles, endpointIds) ||
      endpointIsBlocked(end, obstacles, endpointIds)) return undefined;
  const quick = quickRoute(start, end, orderedObstacles, occupied, isAccepted);
  if (quick) {
    // A family rail may take a longer path around a neighboring branch.
    // Keep both joins fixed; vertical stems must retain their original
    // direction at each end, including the real person's terminal socket.
    const horizontal = start.y === end.y;
    const orthogonal = horizontal || start.x === end.x;
    let best = quick, count = avoidCrossings && orthogonal ? routeCrossingCount(quick, occupied) : 0;
    if (!count) return best;
    let length = best.reduce((sum, segment) => sum + segmentLength(segment), 0);
    const along = (point: RoutePoint) => horizontal ? point.x : point.y;
    const across = (point: RoutePoint) => horizontal ? point.y : point.x;
    const point = (u: number, v: number) => horizontal ? { x: u, y: v } : { x: v, y: u };
    const blockers = occupied.filter((segment) => segmentOrientation(segment) === (horizontal ? "vertical" : "horizontal") &&
      along(segment.start) >= Math.min(along(start), along(end)) && along(segment.start) <= Math.max(along(start), along(end)) &&
      across(start) >= Math.min(across(segment.start), across(segment.end)) && across(start) <= Math.max(across(segment.start), across(segment.end)));
    const channels = uniqueNumbers(blockers.flatMap((segment) => [Math.min(across(segment.start), across(segment.end)) - 32,
      Math.max(across(segment.start), across(segment.end)) + 32])).sort((a, b) => Math.abs(a - across(start)) - Math.abs(b - across(start)) || a - b);
    const inset = Math.sign(along(end) - along(start)) * Math.min(32, Math.abs(along(end) - along(start)) / 4);
    for (const channel of channels) for (const keepJoin of horizontal ? [false, true] : [true]) {
      const candidate = segmentsForPoints(keepJoin ? [start,
        point(along(start) + inset, across(start)), point(along(start) + inset, channel),
        point(along(end) - inset, channel), point(along(end) - inset, across(end)), end]
        : [start, point(along(start), channel), point(along(end), channel), end]);
      const candidateLength = candidate.reduce((sum, segment) => sum + segmentLength(segment), 0);
      if ((!count && candidateLength >= length) || !isAccepted(candidate)) continue;
      const candidateCount = routeCrossingCount(candidate, occupied);
      if (candidateCount < count || candidateCount === count && candidateLength < length) {
        best = candidate; count = candidateCount; length = candidateLength;
      }
    }
    return best;
  }
  return fallbackRoute(start, end, orderedObstacles(), occupied, isAccepted);
};

export interface RelationshipPortPair { start: RoutePoint; end: RoutePoint; penalty: number }

export const routeBetweenPeople = (
  left: RoutePoint,
  right: RoutePoint,
  endpointIds: ReadonlySet<string>,
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[],
  radius: number,
  additionalPorts: readonly RelationshipPortPair[] = []
) => {
  const insetRadius = Math.sqrt(Math.max(0, radius * radius - 12 * 12));
  const candidates = [
    { penalty: 0, start: { x: left.x + radius, y: left.y }, end: { x: right.x - radius, y: right.y } },
    { penalty: 20, start: { x: left.x + insetRadius, y: left.y - 12 }, end: { x: right.x - insetRadius, y: right.y - 12 } },
    { penalty: 40, start: { x: left.x + insetRadius, y: left.y + 12 }, end: { x: right.x - insetRadius, y: right.y + 12 } },
    { penalty: 80, start: { x: left.x, y: left.y - radius }, end: { x: right.x, y: right.y - radius } },
    { penalty: 90, start: { x: left.x - 12, y: left.y - insetRadius }, end: { x: right.x - 12, y: right.y - insetRadius } },
    { penalty: 100, start: { x: left.x + 12, y: left.y - insetRadius }, end: { x: right.x + 12, y: right.y - insetRadius } },
    { penalty: 120, start: { x: left.x - radius, y: left.y }, end: { x: right.x + radius, y: right.y } },
    { penalty: 160, start: { x: left.x, y: left.y + radius }, end: { x: right.x, y: right.y + radius } },
    ...additionalPorts
  ];
  let best: { segments: RouteSegment[]; cost: number } | undefined;
  let ordered: RouteObstacle[] | undefined;
  const orderedObstacles = () => ordered ??= sortedObstacles(obstacles);
  const isClear = createRouteClearance(obstacles, endpointIds);
  const isAccepted = (route: RouteSegment[]) => isClear(route) && !hasCollinearOverlap(route, occupied);
  const candidatesToSearch: typeof candidates = [];
  const accept = (segments: RouteSegment[], penalty: number) => {
    const cost = segments.reduce((sum, segment) => sum + segmentLength(segment), 0) +
      Math.max(segments.length - 1, 0) * BEND_PENALTY + penalty +
      routeCrossingCount(segments, occupied) * CROSSING_PENALTY;
    if (!best || cost < best.cost) best = { segments, cost };
  };
  // Establish a cheap valid route before searching difficult side ports.
  // A partner behind another spouse often has a clear top port; exploring
  // the whole archive for a blocked side port first is unnecessarily costly.
  for (const candidate of candidates) {
    // Even the quick detours scan the archive. Manhattan distance plus the
    // port penalty is a lower bound before bends and crossings are added;
    // a later port cannot beat (or win a tie with) an incumbent below it.
    const lowerBound = Math.abs(candidate.start.x - candidate.end.x) +
      Math.abs(candidate.start.y - candidate.end.y) + candidate.penalty;
    if (best && lowerBound >= best.cost) continue;
    if (endpointIsBlocked(candidate.start, obstacles, endpointIds) ||
        endpointIsBlocked(candidate.end, obstacles, endpointIds)) continue;
    const quick = quickRoute(candidate.start, candidate.end, orderedObstacles, occupied, isAccepted);
    if (quick) accept(quick, candidate.penalty);
    else candidatesToSearch.push(candidate);
  }
  for (const candidate of candidatesToSearch) {
    // Manhattan distance is a lower bound on every orthogonal route between
    // these ports. Once a straight spouse line wins, expensive detour searches
    // for the seven worse port pairs cannot improve it. Preserve tie ordering.
    const lowerBound = Math.abs(candidate.start.x - candidate.end.x) +
      Math.abs(candidate.start.y - candidate.end.y) + candidate.penalty;
    if (best && lowerBound >= best.cost) continue;
    const segments = fallbackRoute(
      candidate.start, candidate.end, orderedObstacles(), occupied,
      isAccepted,
      best ? best.cost - candidate.penalty : Number.POSITIVE_INFINITY
    );
    if (!segments) continue;
    accept(segments, candidate.penalty);
  }
  return best?.segments;
};

export const placeRelationshipLabel = (
  relationshipId: string,
  text: string,
  segments: readonly RouteSegment[],
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[],
  allowVertical = false
): { label: PlannedRelationshipLabel; obstacle: RouteObstacle } | undefined => {
  const horizontal = segments.filter((segment) => segmentOrientation(segment) === "horizontal")
    .sort((left, right) => segmentLength(right) - segmentLength(left) ||
      left.start.y - right.start.y || left.start.x - right.start.x);
  const fractions = Array.from({ length: 19 }, (_, index) => (index + 1) / 20)
    .sort((left, right) => Math.abs(left - 0.5) - Math.abs(right - 0.5) || left - right);
  for (const segment of horizontal) {
    for (const fraction of fractions) {
      const anchor = {
        x: segment.start.x + (segment.end.x - segment.start.x) * fraction,
        y: segment.start.y
      };
      for (const offset of [-14, -22, -40, -58, -76, -94]) {
        const center = { x: anchor.x, y: anchor.y + offset };
        const rect = relationshipLabelRect(text, center);
        const clearsObstacles = obstacles.every((obstacle) =>
          !rectsIntersect(expandRect(obstacle.rect, ROUTE_CLEARANCE), rect)
        );
        const clearsRoutes = occupied.every((routeSegment) =>
          !segmentIntersectsRect(routeSegment, rect, 2)
        );
        if (clearsObstacles && clearsRoutes) {
          return {
            label: { text, center, rect },
            obstacle: { kind: "relationshipLabel", ownerId: relationshipId, rect }
          };
        }
      }
    }
  }
  if (allowVertical) for (const segment of segments.filter((part) => segmentOrientation(part) === "vertical")
    .sort((a, b) => segmentLength(b) - segmentLength(a) || a.start.x - b.start.x)) {
    for (const fraction of fractions) {
      const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
      const width = relationshipLabelRect(text, { x: 0, y: 0 }).width;
      for (const direction of [1, -1]) {
        const center = { x: segment.start.x + direction * (width / 2 + 12), y };
        const rect = relationshipLabelRect(text, center);
        if (obstacles.every((obstacle) => !rectsIntersect(expandRect(obstacle.rect, ROUTE_CLEARANCE), rect)) &&
            occupied.every((part) => !segmentIntersectsRect(part, rect, 2))) {
          return { label: { text, center, rect }, obstacle: { kind: "relationshipLabel", ownerId: relationshipId, rect } };
        }
      }
    }
  }
  return undefined;
};

export const splitAtAttachmentPoints = (segments: readonly RouteSegment[]) => {
  const endpoints = segments.flatMap((segment) => [segment.start, segment.end]);
  return segments.flatMap((segment) => {
    const orientation = segmentOrientation(segment);
    const points = endpoints.filter((point) => {
      if (orientation === "horizontal") return Math.abs(point.y - segment.start.y) < ROUTE_EPSILON &&
        point.x >= Math.min(segment.start.x, segment.end.x) - ROUTE_EPSILON &&
        point.x <= Math.max(segment.start.x, segment.end.x) + ROUTE_EPSILON;
      return orientation === "vertical" && Math.abs(point.x - segment.start.x) < ROUTE_EPSILON &&
        point.y >= Math.min(segment.start.y, segment.end.y) - ROUTE_EPSILON &&
        point.y <= Math.max(segment.start.y, segment.end.y) + ROUTE_EPSILON;
    }).reduce<RoutePoint[]>((result, point) => {
      if (!result.some((existing) => pointsEqual(existing, point))) result.push(point);
      return result;
    }, []).sort((left, right) => orientation === "horizontal" ? left.x - right.x : left.y - right.y);
    return points.slice(0, -1).flatMap((start, index) => {
      const candidate = { start, end: points[index + 1] };
      return segmentOrientation(candidate) ? [candidate] : [];
    });
  });
};

export const obstacleCollisions = (
  segments: readonly RouteSegment[],
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string>
) => segments.flatMap((segment) => obstacles.filter((obstacle) =>
  hasForbiddenIntersection(segment, obstacle, endpointIds)
).map((obstacle) => ({ segment, obstacle })));
