import {
  ROUTE_CLEARANCE,
  ROUTE_EPSILON,
  compareText,
  expandRect,
  hasCollinearOverlap,
  hasForbiddenIntersection,
  pointsEqual,
  rectsIntersect,
  relationshipLabelRect,
  routeIsClear,
  segmentIntersectsRect,
  segmentLength,
  segmentOrientation,
  segmentsForPoints,
  type PlannedRelationshipLabel,
  type RouteObstacle,
  type RoutePoint,
  type RouteSegment
} from "./connectionGeometry";

const COORDINATE_PADDING = 2;
const BEND_PENALTY = 24;

const uniqueNumbers = (values: readonly number[]) => values.reduce<number[]>((result, value) => {
  if (!result.some((existing) => Math.abs(existing - value) < ROUTE_EPSILON)) result.push(value);
  return result;
}, []);

export const sortedObstacles = (obstacles: readonly RouteObstacle[]) => [...obstacles].sort(
  (left, right) => compareText(`${left.kind}:${left.ownerId}`, `${right.kind}:${right.ownerId}`) ||
    left.rect.y - right.rect.y || left.rect.x - right.rect.x ||
    left.rect.height - right.rect.height || left.rect.width - right.rect.width
);

const terminalContact = (point: RoutePoint, obstacle: RouteObstacle) => {
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

const acceptedRoute = (
  route: readonly RouteSegment[],
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string>,
  occupied: readonly RouteSegment[]
) => routeIsClear(route, obstacles, endpointIds) && !hasCollinearOverlap(route, occupied);

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
  return [];
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
  isAccepted: (route: RouteSegment[]) => boolean
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
    for (const startX of escapeXCoordinates(start, y, obstacles, occupied)) {
      for (const endX of escapeXCoordinates(end, y, obstacles, occupied)) {
        const candidate = segmentsForPoints([
          start,
          { x: startX, y: start.y },
          { x: startX, y },
          { x: endX, y },
          { x: endX, y: end.y },
          end
        ]);
        if (isAccepted(candidate)) return candidate;
      }
    }
  }
  return undefined;
};

export const preferredRoute = (
  start: RoutePoint,
  end: RoutePoint,
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string>,
  occupied: readonly RouteSegment[] = []
) => {
  const orderedObstacles = sortedObstacles(obstacles);
  if (endpointIsBlocked(start, orderedObstacles, endpointIds) ||
      endpointIsBlocked(end, orderedObstacles, endpointIds)) return undefined;
  const direct = segmentsForPoints([start, end]);
  if (acceptedRoute(direct, orderedObstacles, endpointIds, occupied)) return direct;
  const quick = fastCandidates(start, end, orderedObstacles, occupied).find((candidate) =>
    acceptedRoute(candidate, orderedObstacles, endpointIds, occupied)
  );
  if (quick) return quick;
  return fallbackRoute(start, end, orderedObstacles, occupied, (candidate) =>
    acceptedRoute(candidate, orderedObstacles, endpointIds, occupied)
  );
};

export const routeBetweenPeople = (
  left: RoutePoint,
  right: RoutePoint,
  endpointIds: ReadonlySet<string>,
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[],
  radius: number
) => {
  const candidates = [
    { penalty: 0, start: { x: left.x + radius, y: left.y }, end: { x: right.x - radius, y: right.y } },
    { penalty: 20, start: { x: left.x + radius, y: left.y - 12 }, end: { x: right.x - radius, y: right.y - 12 } },
    { penalty: 40, start: { x: left.x + radius, y: left.y + 12 }, end: { x: right.x - radius, y: right.y + 12 } },
    { penalty: 80, start: { x: left.x, y: left.y - radius }, end: { x: right.x, y: right.y - radius } },
    { penalty: 90, start: { x: left.x - 12, y: left.y - radius }, end: { x: right.x - 12, y: right.y - radius } },
    { penalty: 100, start: { x: left.x + 12, y: left.y - radius }, end: { x: right.x + 12, y: right.y - radius } },
    { penalty: 120, start: { x: left.x - radius, y: left.y }, end: { x: right.x + radius, y: right.y } },
    { penalty: 160, start: { x: left.x, y: left.y + radius }, end: { x: right.x, y: right.y + radius } }
  ];
  let best: { segments: RouteSegment[]; cost: number } | undefined;
  for (const candidate of candidates) {
    const segments = preferredRoute(
      candidate.start, candidate.end, obstacles, endpointIds, occupied
    );
    if (!segments) continue;
    const cost = segments.reduce((sum, segment) => sum + segmentLength(segment), 0) +
      Math.max(segments.length - 1, 0) * BEND_PENALTY + candidate.penalty;
    if (!best || cost < best.cost) best = { segments, cost };
  }
  return best?.segments;
};

export const placeRelationshipLabel = (
  relationshipId: string,
  text: string,
  segments: readonly RouteSegment[],
  obstacles: readonly RouteObstacle[],
  occupied: readonly RouteSegment[]
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
