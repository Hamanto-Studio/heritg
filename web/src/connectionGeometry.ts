import { createTranslator, formatDisplayDate } from "./i18n";
import { LAYOUT_METRICS } from "./layout";
import type { AppData, FamilyRelationship, PositionedPerson } from "./types";

export const ROUTE_CLEARANCE = 8;
export const ROUTE_EPSILON = 0.001;

export interface RoutePoint {
  x: number;
  y: number;
}

export interface RouteSegment {
  start: RoutePoint;
  end: RoutePoint;
}

export interface RouteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ObstacleKind =
  | "avatar"
  | "nodeLabel"
  | "addControl"
  | "editControl"
  | "relationshipLabel";

export interface RouteObstacle {
  kind: ObstacleKind;
  ownerId: string;
  rect: RouteRect;
}

export interface ControlPlacement {
  personId: string;
  side: "left" | "right";
  addCenter: RoutePoint;
  editCenter: RoutePoint;
}

export interface PlannedRelationshipLabel {
  text: string;
  center: RoutePoint;
  rect: RouteRect;
}

export const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export const pointsEqual = (left: RoutePoint, right: RoutePoint) =>
  Math.abs(left.x - right.x) < ROUTE_EPSILON &&
  Math.abs(left.y - right.y) < ROUTE_EPSILON;

export const segmentOrientation = (segment: RouteSegment) => {
  if (Math.abs(segment.start.y - segment.end.y) < ROUTE_EPSILON &&
      Math.abs(segment.start.x - segment.end.x) >= ROUTE_EPSILON) return "horizontal";
  if (Math.abs(segment.start.x - segment.end.x) < ROUTE_EPSILON &&
      Math.abs(segment.start.y - segment.end.y) >= ROUTE_EPSILON) return "vertical";
  return undefined;
};

export const segmentLength = (segment: RouteSegment) =>
  Math.abs(segment.end.x - segment.start.x) + Math.abs(segment.end.y - segment.start.y);

export const segmentsForPoints = (rawPoints: readonly RoutePoint[]) => {
  const points = rawPoints.reduce<RoutePoint[]>((result, point) => {
    if (!result.length || !pointsEqual(result[result.length - 1], point)) result.push(point);
    return result;
  }, []);
  for (let index = 1; index < points.length - 1;) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if ((previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y)) points.splice(index, 1);
    else index += 1;
  }
  return points.slice(0, -1).flatMap((start, index) => {
    const segment = { start, end: points[index + 1] };
    return segmentOrientation(segment) ? [segment] : [];
  });
};

export const expandRect = (rect: RouteRect, amount: number): RouteRect => ({
  x: rect.x - amount,
  y: rect.y - amount,
  width: rect.width + amount * 2,
  height: rect.height + amount * 2
});

export const rectsIntersect = (left: RouteRect, right: RouteRect) =>
  left.x < right.x + right.width && left.x + left.width > right.x &&
  left.y < right.y + right.height && left.y + left.height > right.y;

export const segmentIntersectsRect = (
  segment: RouteSegment,
  rawRect: RouteRect,
  clearance = ROUTE_CLEARANCE
) => {
  const rect = expandRect(rawRect, clearance);
  const orientation = segmentOrientation(segment);
  if (orientation === "horizontal") {
    if (segment.start.y <= rect.y + ROUTE_EPSILON ||
        segment.start.y >= rect.y + rect.height - ROUTE_EPSILON) return false;
    const lower = Math.max(Math.min(segment.start.x, segment.end.x), rect.x);
    const upper = Math.min(Math.max(segment.start.x, segment.end.x), rect.x + rect.width);
    return lower < upper - ROUTE_EPSILON;
  }
  if (orientation === "vertical") {
    if (segment.start.x <= rect.x + ROUTE_EPSILON ||
        segment.start.x >= rect.x + rect.width - ROUTE_EPSILON) return false;
    const lower = Math.max(Math.min(segment.start.y, segment.end.y), rect.y);
    const upper = Math.min(Math.max(segment.start.y, segment.end.y), rect.y + rect.height);
    return lower < upper - ROUTE_EPSILON;
  }
  return false;
};

const terminalContact = (point: RoutePoint, obstacle: RouteObstacle) => {
  const { x, y, width, height } = obstacle.rect;
  if (obstacle.kind === "avatar") {
    const vertical = (Math.abs(point.x - x) < ROUTE_EPSILON ||
      Math.abs(point.x - x - width) < ROUTE_EPSILON) &&
      point.y >= y - ROUTE_EPSILON && point.y <= y + height + ROUTE_EPSILON;
    const horizontal = (Math.abs(point.y - y) < ROUTE_EPSILON ||
      Math.abs(point.y - y - height) < ROUTE_EPSILON) &&
      point.x >= x - ROUTE_EPSILON && point.x <= x + width + ROUTE_EPSILON;
    return vertical || horizontal;
  }
  return obstacle.kind === "nodeLabel" &&
    Math.abs(point.y - y - height - 2) < ROUTE_EPSILON &&
    point.x >= x - ROUTE_EPSILON && point.x <= x + width + ROUTE_EPSILON;
};

const permitsTerminalExit = (
  segment: RouteSegment,
  obstacle: RouteObstacle,
  endpointIds: ReadonlySet<string>
) => {
  if (!endpointIds.has(obstacle.ownerId) ||
      (obstacle.kind !== "avatar" && obstacle.kind !== "nodeLabel")) return false;
  return [[segment.start, segment.end], [segment.end, segment.start]].some(([point, other]) => {
    if (!terminalContact(point, obstacle)) return false;
    const { x, y, width, height } = obstacle.rect;
    if (obstacle.kind === "nodeLabel") {
      return segmentOrientation(segment) === "vertical" && other.y > point.y;
    }
    if (segmentOrientation(segment) === "horizontal") {
      if (Math.abs(point.x - x) < ROUTE_EPSILON) return other.x < point.x;
      if (Math.abs(point.x - x - width) < ROUTE_EPSILON) return other.x > point.x;
    }
    if (segmentOrientation(segment) === "vertical") {
      if (Math.abs(point.y - y) < ROUTE_EPSILON) return other.y < point.y;
      if (Math.abs(point.y - y - height) < ROUTE_EPSILON) return other.y > point.y;
    }
    return false;
  });
};

export const hasForbiddenIntersection = (
  segment: RouteSegment,
  obstacle: RouteObstacle,
  endpointIds: ReadonlySet<string>
) => {
  if (!segmentIntersectsRect(segment, obstacle.rect)) return false;
  if (!permitsTerminalExit(segment, obstacle, endpointIds)) return true;
  return segmentIntersectsRect(segment, obstacle.rect, 0);
};

export const routeIsClear = (
  segments: readonly RouteSegment[],
  obstacles: readonly RouteObstacle[],
  endpointIds: ReadonlySet<string> = new Set()
) => segments.length > 0 && segments.every((segment) =>
  obstacles.every((obstacle) => !hasForbiddenIntersection(segment, obstacle, endpointIds))
);

export const collinearlyOverlaps = (left: RouteSegment, right: RouteSegment) => {
  const leftOrientation = segmentOrientation(left);
  if (leftOrientation !== segmentOrientation(right)) return false;
  if (leftOrientation === "horizontal" &&
      Math.abs(left.start.y - right.start.y) < ROUTE_EPSILON) {
    return Math.max(Math.min(left.start.x, left.end.x), Math.min(right.start.x, right.end.x)) <
      Math.min(Math.max(left.start.x, left.end.x), Math.max(right.start.x, right.end.x)) - ROUTE_EPSILON;
  }
  if (leftOrientation === "vertical" &&
      Math.abs(left.start.x - right.start.x) < ROUTE_EPSILON) {
    return Math.max(Math.min(left.start.y, left.end.y), Math.min(right.start.y, right.end.y)) <
      Math.min(Math.max(left.start.y, left.end.y), Math.max(right.start.y, right.end.y)) - ROUTE_EPSILON;
  }
  return false;
};

export const hasCollinearOverlap = (
  route: readonly RouteSegment[],
  occupied: readonly RouteSegment[]
) => route.some((candidate) => occupied.some((segment) => collinearlyOverlaps(candidate, segment)));

export const avatarRect = (person: PositionedPerson): RouteRect => ({
  x: person.x - LAYOUT_METRICS.avatarRadius,
  y: person.y - LAYOUT_METRICS.avatarRadius,
  width: LAYOUT_METRICS.avatarDiameter,
  height: LAYOUT_METRICS.avatarDiameter
});

export const hasLifeText = (person: PositionedPerson) =>
  Boolean(person.birthDate?.match(/^\d{4}/) || person.deathDate?.match(/^\d{4}/));

export const personLifeTop = (showRole: boolean) =>
  showRole ? LAYOUT_METRICS.lifeTop : LAYOUT_METRICS.roleTop;

export const nodeLabelRect = (person: PositionedPerson): RouteRect => ({
  x: person.x - LAYOUT_METRICS.labelWidth / 2,
  y: person.y + LAYOUT_METRICS.labelTop,
  width: LAYOUT_METRICS.labelWidth,
  height: (hasLifeText(person)
    ? personLifeTop(Boolean(person.role)) + LAYOUT_METRICS.lifeHeight
    : person.role
      ? LAYOUT_METRICS.roleTop + LAYOUT_METRICS.roleHeight
      : LAYOUT_METRICS.labelTop + LAYOUT_METRICS.nameHeight) - LAYOUT_METRICS.labelTop
});

export const controlRect = (center: RoutePoint): RouteRect => ({
  x: center.x - 22,
  y: center.y - 22,
  width: 44,
  height: 44
});

export const parentPortY = (person: PositionedPerson) =>
  nodeLabelRect(person).y + nodeLabelRect(person).height + 2;

export const relationshipLabelText = (
  relationship: FamilyRelationship,
  language: AppData["language"]
) => {
  if (relationship.kind !== "partner") return undefined;
  const parts: string[] = [];
  if (relationship.marriageDate) {
    parts.push(createTranslator(language)("marriedOn", {
      date: formatDisplayDate(relationship.marriageDate, language)
    }));
  }
  if (relationship.divorceDate) {
    const date = formatDisplayDate(relationship.divorceDate, language);
    parts.push(language === "id" ? `Bercerai ${date}` : `Divorced ${date}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
};

export const relationshipLabelRect = (text: string, center: RoutePoint): RouteRect => {
  const width = Math.max(44, Math.min(240, text.length * 6.2 + 14));
  return { x: center.x - width / 2, y: center.y - 10, width, height: 20 };
};

export const pointOnSegment = (point: RoutePoint, segment: RouteSegment) => {
  const orientation = segmentOrientation(segment);
  if (orientation === "horizontal") return Math.abs(point.y - segment.start.y) < ROUTE_EPSILON &&
    point.x >= Math.min(segment.start.x, segment.end.x) - ROUTE_EPSILON &&
    point.x <= Math.max(segment.start.x, segment.end.x) + ROUTE_EPSILON;
  if (orientation === "vertical") return Math.abs(point.x - segment.start.x) < ROUTE_EPSILON &&
    point.y >= Math.min(segment.start.y, segment.end.y) - ROUTE_EPSILON &&
    point.y <= Math.max(segment.start.y, segment.end.y) + ROUTE_EPSILON;
  return false;
};
