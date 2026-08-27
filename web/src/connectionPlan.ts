import {
  CHILD_RAIL_CLEARANCE,
  ROUTE_CLEARANCE,
  ROUTE_EPSILON,
  avatarRect,
  collinearlyOverlaps,
  compareText,
  controlRect,
  hasCollinearOverlap,
  nodeLabelRect,
  parentPortY,
  pointsEqual,
  relationshipLabelText,
  routeIsClear,
  segmentIntersectsRect,
  segmentOrientation,
  segmentsForPoints,
  type ControlPlacement,
  type PlannedRelationshipLabel,
  type RouteObstacle,
  type RoutePoint,
  type RouteRect,
  type RouteSegment
} from "./connectionGeometry";
import {
  placeRelationshipLabel,
  preferredRoute,
  routeBetweenPeople,
  splitAtAttachmentPoints
} from "./obstacleRouter";
import { LAYOUT_METRICS } from "./layout";
import type { AppData, FamilyRelationship, PositionedPerson, TreeLayout } from "./types";

export const FAMILY_RAIL_SPACING = 32;
export const FAMILY_CHILD_TRACK_SPACING = 28;

export interface PlannedFamilyRoute {
  id: string;
  parentIds: string[];
  childIds: string[];
  relationshipIds: string[];
  parentPorts: RoutePoint[];
  segments: RouteSegment[];
  junctions: RoutePoint[];
  laneIndex: number;
  laneCount: number;
}

export interface PlannedNonParentRoute {
  id: string;
  relationship: FamilyRelationship;
  segments: RouteSegment[];
  label?: PlannedRelationshipLabel;
}

export interface PlannedCrossing extends RoutePoint {
  kind: FamilyRelationship["kind"];
  horizontalKind: FamilyRelationship["kind"];
}

export interface ConnectionPlan {
  families: PlannedFamilyRoute[];
  nonParentRoutes: PlannedNonParentRoute[];
  obstacles: RouteObstacle[];
  controls: ControlPlacement[];
  crossings: PlannedCrossing[];
  bounds: RouteRect;
  failures: string[];
  isValid: boolean;
}

interface FamilyDraft extends PlannedFamilyRoute {
  parentCenters: RoutePoint[];
  children: RoutePoint[];
  interval: [number, number];
  band: string;
  baseSegments: RouteSegment[];
  childLanes: Map<number, number>;
  parentJoinY: number;
}

const stableFamilyId = (ids: readonly string[]) =>
  ids.map((id) => `${id.length}:${id}`).join("|");

const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const sideForControls = (
  person: PositionedPerson,
  layout: TreeLayout,
  peopleById: ReadonlyMap<string, PositionedPerson>
) => {
  const occupied = new Set<"left" | "right">();
  for (const relationship of layout.relationships) {
    if (relationship.kind === "parent") continue;
    const otherId = relationship.fromPersonId === person.id
      ? relationship.toPersonId
      : relationship.toPersonId === person.id ? relationship.fromPersonId : undefined;
    const other = otherId ? peopleById.get(otherId) : undefined;
    if (!other) continue;
    occupied.add(other.x < person.x ? "left" : "right");
  }
  const preferred = person.x <= 0 ? "left" : "right";
  const opposite = preferred === "left" ? "right" : "left";
  return occupied.has(preferred) && !occupied.has(opposite) ? opposite : preferred;
};

const makeControls = (layout: TreeLayout, peopleById: ReadonlyMap<string, PositionedPerson>) =>
  [...layout.people].sort((left, right) => compareText(left.id, right.id)).map((person) => {
    const side = sideForControls(person, layout, peopleById);
    const direction = side === "left" ? -1 : 1;
    return {
      personId: person.id,
      side,
      addCenter: { x: person.x + direction * 66, y: person.y },
      editCenter: { x: person.x + direction * 110, y: person.y }
    } satisfies ControlPlacement;
  });

const makeNodeObstacles = (
  layout: TreeLayout,
  controls: readonly ControlPlacement[],
  selectedPersonId?: string,
  controlsVisible = true
): RouteObstacle[] => {
  const controlsById = new Map(controls.map((control) => [control.personId, control]));
  return [...layout.people].sort((left, right) => compareText(left.id, right.id)).flatMap((person) => {
    const control = controlsById.get(person.id)!;
    const nodeObstacles: RouteObstacle[] = [
      { kind: "avatar", ownerId: person.id, rect: avatarRect(person) },
      { kind: "nodeLabel", ownerId: person.id, rect: nodeLabelRect(person) }
    ];
    return !controlsVisible || (layout.people.length > 24 && person.id !== selectedPersonId)
      ? nodeObstacles : [
      ...nodeObstacles,
      { kind: "addControl", ownerId: person.id, rect: controlRect(control.addCenter) },
      { kind: "editControl", ownerId: person.id, rect: controlRect(control.editCenter) }
    ];
  });
};

const laneIndices = (intervals: readonly [number, number][]) => {
  const laneEnds: number[] = [];
  return intervals.map(([lower, upper]) => {
    const reusable = laneEnds.findIndex((end) => end + 20 < lower);
    if (reusable >= 0) {
      laneEnds[reusable] = upper;
      return reusable;
    }
    laneEnds.push(upper);
    return laneEnds.length - 1;
  });
};

const familySegments = (
  parents: readonly RoutePoint[],
  parentPorts: readonly RoutePoint[],
  children: readonly RoutePoint[],
  parentJoinY: number,
  childRailOffset: (childY: number) => number,
  parentTrunkX: number,
  continuationTrunkX: number
) => {
  const parentXs = [...parentPorts.map(({ x }) => x), parentTrunkX];
  const childRows = [...new Set(children.map(({ y }) => y))]
    .sort((left, right) => left - right)
    .map((childY) => ({
      children: children.filter(({ y }) => y === childY),
      railY: childY - LAYOUT_METRICS.avatarRadius - childRailOffset(childY)
    }));
  return [
    ...parentPorts.map((port, index) => ({
      start: { x: port.x, y: parents[index].y },
      end: { x: port.x, y: parentJoinY }
    })),
    {
      start: { x: Math.min(...parentXs), y: parentJoinY },
      end: { x: Math.max(...parentXs), y: parentJoinY }
    },
    { start: { x: parentTrunkX, y: parentJoinY }, end: { x: parentTrunkX, y: childRows[0].railY } },
    ...(childRows.length > 1 ? [{
      start: { x: continuationTrunkX, y: childRows[0].railY },
      end: { x: continuationTrunkX, y: childRows.at(-1)!.railY }
    }] : []),
    ...childRows.flatMap(({ children: rowChildren, railY }, rowIndex) => {
      const childXs = [
        ...rowChildren.map(({ x }) => x),
        rowIndex === 0 ? parentTrunkX : continuationTrunkX,
        ...(rowIndex === 0 && childRows.length > 1 ? [continuationTrunkX] : [])
      ];
      return [
        {
          start: { x: Math.min(...childXs), y: railY },
          end: { x: Math.max(...childXs), y: railY }
        },
        ...rowChildren.map((child) => ({
          start: { x: child.x, y: railY },
          end: { x: child.x, y: child.y - LAYOUT_METRICS.avatarRadius }
        }))
      ];
    })
  ].filter((segment) => segmentOrientation(segment));
};

const buildFamilies = (
  layout: TreeLayout,
  peopleById: ReadonlyMap<string, PositionedPerson>,
  nodeObstacles: readonly RouteObstacle[]
) => {
  const edgesByChild = new Map<string, FamilyRelationship[]>();
  for (const edge of layout.relationships.filter(({ kind }) => kind === "parent")) {
    const edges = edgesByChild.get(edge.toPersonId) ?? [];
    edges.push(edge);
    edgesByChild.set(edge.toPersonId, edges);
  }
  const groups = new Map<string, {
    parentIds: string[];
    childIds: Set<string>;
    relationshipIds: Set<string>;
  }>();
  for (const [childId, edges] of [...edgesByChild].sort(([left], [right]) => compareText(left, right))) {
    const parentIds = [...new Set(edges.map(({ fromPersonId }) => fromPersonId))].sort(compareText);
    if (!parentIds.length || !peopleById.has(childId) || parentIds.some((id) => !peopleById.has(id))) continue;
    const key = stableFamilyId(parentIds);
    const group = groups.get(key) ?? {
      parentIds,
      childIds: new Set<string>(),
      relationshipIds: new Set<string>()
    };
    group.childIds.add(childId);
    edges.forEach(({ id }) => group.relationshipIds.add(id));
    groups.set(key, group);
  }
  const families = [...groups.entries()].map(([id, group]): FamilyDraft => {
    const parents = group.parentIds.map((personId) => peopleById.get(personId)!)
      .sort((left, right) => left.x - right.x || compareText(left.id, right.id));
    const children = [...group.childIds].map((personId) => peopleById.get(personId)!)
      .sort((left, right) => left.x - right.x || compareText(left.id, right.id));
    const coordinates = [...parents, ...children].map(({ x }) => x);
    return {
      id,
      parentIds: parents.map(({ id: personId }) => personId),
      childIds: children.map(({ id: personId }) => personId),
      relationshipIds: [...group.relationshipIds].sort(compareText),
      parentCenters: parents.map((parent) => ({ x: parent.x, y: parentPortY(parent) })),
      parentPorts: parents.map((parent) => ({ x: parent.x, y: parentPortY(parent) })),
      children: children.map(({ x, y }) => ({ x, y })),
      interval: [Math.min(...coordinates), Math.max(...coordinates)],
      band: `${Math.round(average(parents.map(({ y }) => y)))}`,
      segments: [],
      baseSegments: [],
      junctions: [],
      laneIndex: 0,
      laneCount: 1,
      childLanes: new Map<number, number>(),
      parentJoinY: 0
    };
  });
  for (const band of [...new Set(families.map(({ band }) => band))].sort(compareText)) {
    const values = families.filter((family) => family.band === band).sort((left, right) =>
      left.interval[0] - right.interval[0] || left.interval[1] - right.interval[1] ||
      compareText(left.id, right.id)
    );
    const lanes = laneIndices(values.map(({ interval }) => interval));
    const laneCount = Math.max(...lanes) + 1;
    values.forEach((family, index) => {
      family.laneIndex = lanes[index];
      family.laneCount = laneCount;
    });
  }
  const childBands = new Map<number, FamilyDraft[]>();
  for (const family of families) {
    for (const childY of new Set(family.children.map(({ y }) => y))) {
      const values = childBands.get(childY) ?? [];
      values.push(family);
      childBands.set(childY, values);
    }
  }
  for (const [childY, values] of childBands) {
    values.sort((left, right) =>
      left.interval[0] - right.interval[0] || left.interval[1] - right.interval[1] ||
      compareText(left.id, right.id)
    );
    const lanes = laneIndices(values.map(({ interval }) => interval));
    values.forEach((family, index) => {
      family.childLanes.set(childY, lanes[index]);
    });
  }
  const familiesByParent = new Map<string, FamilyDraft[]>();
  for (const family of families) for (const parentId of family.parentIds) {
    const values = familiesByParent.get(parentId) ?? [];
    values.push(family);
    familiesByParent.set(parentId, values);
  }
  for (const [parentId, values] of familiesByParent) {
    values.sort((left, right) => compareText(left.id, right.id));
    values.forEach((family, index) => {
      const parentIndex = family.parentIds.indexOf(parentId);
      family.parentPorts[parentIndex].x +=
        (index - (values.length - 1) / 2) * FAMILY_RAIL_SPACING;
    });
  }
  for (const family of families) {
    let parentStartY = Math.max(...family.parentCenters.map(({ y }) => y));
    const parentRowY = average(family.parentIds.map((id) => peopleById.get(id)!.y));
    for (const obstacle of nodeObstacles) {
      if (obstacle.kind !== "nodeLabel" || family.parentIds.includes(obstacle.ownerId)) continue;
      const person = peopleById.get(obstacle.ownerId);
      if (!person || Math.abs(person.y - parentRowY) >= 0.5 ||
          obstacle.rect.x + obstacle.rect.width < family.interval[0] ||
          obstacle.rect.x > family.interval[1]) continue;
      parentStartY = Math.max(parentStartY, obstacle.rect.y + obstacle.rect.height + ROUTE_CLEARANCE);
    }
    const childTopY = Math.min(...family.children.map(({ y }) => y - LAYOUT_METRICS.avatarRadius));
    const availableHeight = Math.max(childTopY - parentStartY - 32, 0);
    const spacing = family.laneCount > 1
      ? Math.max(2, Math.min(
        FAMILY_RAIL_SPACING,
        availableHeight / ((family.laneCount - 1) * 2)
      ))
      : 0;
    family.parentJoinY = parentStartY + 8 + family.laneIndex * spacing;
  }
  const childTrackSpacings = new Map<number, number>();
  for (const [childY, values] of childBands) {
    const laneCount = Math.max(...values.map((family) => family.childLanes.get(childY) ?? 0)) + 1;
    const defaultRailY = childY - LAYOUT_METRICS.avatarRadius - CHILD_RAIL_CLEARANCE;
    const safeTopY = Math.max(...values.map(({ parentJoinY }) => parentJoinY)) + ROUTE_CLEARANCE;
    const availableHeight = Math.max(defaultRailY - safeTopY, 0);
    childTrackSpacings.set(childY, laneCount > 1
      ? Math.min(FAMILY_CHILD_TRACK_SPACING, availableHeight / (laneCount - 1))
      : 0);
  }
  for (const family of families) {
    const parentJoinY = family.parentJoinY;
    const childRailOffset = (childY: number) => CHILD_RAIL_CLEARANCE +
      (family.childLanes.get(childY) ?? 0) * (childTrackSpacings.get(childY) ?? 0);
    const baseTrunkX = average(family.parentPorts.map(({ x }) => x));
    const nearestChildX = [...family.children].sort((left, right) =>
      Math.abs(left.x - baseTrunkX) - Math.abs(right.x - baseTrunkX) || left.x - right.x
    )[0].x;
    const overlapsEndpoint = families.some((other) => other !== family && other.band === family.band &&
      [...other.parentPorts, ...other.children].some(({ x }) => x === nearestChildX));
    const aligns = !overlapsEndpoint &&
      (family.children.length === 1 || Math.abs(nearestChildX - baseTrunkX) <= ROUTE_CLEARANCE + 4);
    const trunkX = aligns ? nearestChildX :
      baseTrunkX + (family.laneIndex - (family.laneCount - 1) / 2) * 8;
    let continuationTrunkX = trunkX;
    if (new Set(family.children.map(({ y }) => y)).size > 1) {
      const childXs = [...new Set(family.children.map(({ x }) => x))].sort((left, right) => left - right);
      const internalChannels = childXs.slice(0, -1).flatMap((left, index) => {
        const right = childXs[index + 1];
        return right - left > LAYOUT_METRICS.labelWidth + ROUTE_CLEARANCE * 2
          ? [(left + right) / 2]
          : [];
      });
      const outerClearance = LAYOUT_METRICS.labelWidth / 2 + ROUTE_CLEARANCE * 2;
      const clearChannels = [
        ...internalChannels,
        childXs[0] - outerClearance,
        childXs.at(-1)! + outerClearance
      ];
      if (clearChannels.length > 0) {
        const deepestRailY = Math.max(...family.children.map(({ y }) =>
          y - LAYOUT_METRICS.avatarRadius - childRailOffset(y)
        ));
        const obstacleSafeChannels = clearChannels.filter((x) =>
          nodeObstacles.every((obstacle) => !segmentIntersectsRect({
              start: { x, y: parentJoinY },
              end: { x, y: deepestRailY }
            }, obstacle.rect)
          )
        );
        continuationTrunkX = (obstacleSafeChannels.length > 0 ? obstacleSafeChannels : clearChannels)
          .sort((left, right) =>
          Math.abs(left - baseTrunkX) - Math.abs(right - baseTrunkX) || left - right
          )[0];
      }
    }
    family.baseSegments = familySegments(
      family.parentCenters, family.parentPorts, family.children, parentJoinY, childRailOffset,
      trunkX, continuationTrunkX
    );
    family.segments = family.baseSegments;
    family.junctions = [
      { x: trunkX, y: parentJoinY },
      ...[...new Set(family.children.map(({ y }) =>
        y - LAYOUT_METRICS.avatarRadius - childRailOffset(y)
      ))].sort((left, right) => left - right).flatMap((y, index) => index === 0
        ? [{ x: trunkX, y }, ...(continuationTrunkX !== trunkX ? [{ x: continuationTrunkX, y }] : [])]
        : [{ x: continuationTrunkX, y }])
    ];
  }
  return families.sort((left, right) =>
    average(left.parentCenters.map(({ y }) => y)) -
      average(right.parentCenters.map(({ y }) => y)) ||
    average(left.children.map(({ y }) => y)) -
      average(right.children.map(({ y }) => y)) ||
    left.interval[0] - right.interval[0] ||
    left.interval[1] - right.interval[1] ||
    compareText(left.id, right.id)
  );
};

const segmentsTouch = (left: RouteSegment, right: RouteSegment) => {
  const leftOrientation = segmentOrientation(left);
  const rightOrientation = segmentOrientation(right);
  if (leftOrientation === rightOrientation) {
    if (leftOrientation === "horizontal" && Math.abs(left.start.y - right.start.y) < ROUTE_EPSILON) {
      return Math.max(Math.min(left.start.x, left.end.x), Math.min(right.start.x, right.end.x)) <=
        Math.min(Math.max(left.start.x, left.end.x), Math.max(right.start.x, right.end.x)) + ROUTE_EPSILON;
    }
    if (leftOrientation === "vertical" && Math.abs(left.start.x - right.start.x) < ROUTE_EPSILON) {
      return Math.max(Math.min(left.start.y, left.end.y), Math.min(right.start.y, right.end.y)) <=
        Math.min(Math.max(left.start.y, left.end.y), Math.max(right.start.y, right.end.y)) + ROUTE_EPSILON;
    }
  }
  const horizontal = leftOrientation === "horizontal" ? left : rightOrientation === "horizontal" ? right : undefined;
  const vertical = leftOrientation === "vertical" ? left : rightOrientation === "vertical" ? right : undefined;
  return Boolean(horizontal && vertical && vertical.start.x >= Math.min(horizontal.start.x, horizontal.end.x) - ROUTE_EPSILON &&
    vertical.start.x <= Math.max(horizontal.start.x, horizontal.end.x) + ROUTE_EPSILON &&
    horizontal.start.y >= Math.min(vertical.start.y, vertical.end.y) - ROUTE_EPSILON &&
    horizontal.start.y <= Math.max(vertical.start.y, vertical.end.y) + ROUTE_EPSILON);
};

export const segmentsFormConnectedNetwork = (segments: readonly RouteSegment[]) => {
  if (!segments.length) return false;
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const index = pending.pop()!;
    segments.forEach((candidate, candidateIndex) => {
      if (!visited.has(candidateIndex) && segmentsTouch(segments[index], candidate)) {
        visited.add(candidateIndex);
        pending.push(candidateIndex);
      }
    });
  }
  return visited.size === segments.length;
};

const routeFamilies = (
  families: FamilyDraft[],
  obstacles: readonly RouteObstacle[],
  failures: string[]
) => {
  const occupied: RouteSegment[] = [];
  for (const family of families) {
    const endpointIds = new Set([...family.parentIds, ...family.childIds]);
    const directSegments = splitAtAttachmentPoints(family.baseSegments);
    if (routeIsClear(directSegments, obstacles, endpointIds) &&
        !hasCollinearOverlap(directSegments, occupied) &&
        segmentsFormConnectedNetwork(directSegments)) {
      family.segments = directSegments;
      occupied.push(...family.segments);
      continue;
    }
    const routed: RouteSegment[] = [];
    let didFail = false;
    for (const segment of splitAtAttachmentPoints(family.baseSegments)) {
      const route = preferredRoute(
        segment.start,
        segment.end,
        obstacles,
        endpointIds,
        [...occupied, ...routed]
      );
      if (!route) {
        didFail = true;
        break;
      }
      routed.push(...route);
    }
    if (!didFail && routeIsClear(routed, obstacles, endpointIds) && segmentsFormConnectedNetwork(routed)) {
      family.segments = routed;
    } else {
      const relaxed: RouteSegment[] = [];
      for (const segment of splitAtAttachmentPoints(family.baseSegments)) {
        const route = preferredRoute(segment.start, segment.end, obstacles, endpointIds, relaxed);
        if (!route) {
          relaxed.length = 0;
          break;
        }
        relaxed.push(...route);
      }
      family.segments = routeIsClear(relaxed, obstacles, endpointIds) &&
          segmentsFormConnectedNetwork(relaxed)
        ? relaxed : [];
      failures.push(`family:${family.id}`);
    }
    occupied.push(...family.segments);
  }
  return occupied;
};

const crossingPoint = (left: RouteSegment, right: RouteSegment) => {
  const horizontal = segmentOrientation(left) === "horizontal" ? left :
    segmentOrientation(right) === "horizontal" ? right : undefined;
  const vertical = segmentOrientation(left) === "vertical" ? left :
    segmentOrientation(right) === "vertical" ? right : undefined;
  if (!horizontal || !vertical) return undefined;
  if (vertical.start.x < Math.min(horizontal.start.x, horizontal.end.x) - ROUTE_EPSILON ||
      vertical.start.x > Math.max(horizontal.start.x, horizontal.end.x) + ROUTE_EPSILON ||
      horizontal.start.y < Math.min(vertical.start.y, vertical.end.y) - ROUTE_EPSILON ||
      horizontal.start.y > Math.max(vertical.start.y, vertical.end.y) + ROUTE_EPSILON) return undefined;
  return { x: vertical.start.x, y: horizontal.start.y };
};

const planBounds = (
  obstacles: readonly RouteObstacle[],
  segments: readonly RouteSegment[]
): RouteRect => {
  const visibleObstacles = obstacles.filter(({ kind }) =>
    kind !== "addControl" && kind !== "editControl"
  );
  const xs = visibleObstacles.flatMap(({ rect }) => [rect.x, rect.x + rect.width]);
  const ys = visibleObstacles.flatMap(({ rect }) => [rect.y, rect.y + rect.height]);
  segments.forEach(({ start, end }) => {
    xs.push(start.x, end.x);
    ys.push(start.y, end.y);
  });
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export function createConnectionPlan(
  layout: TreeLayout,
  language: AppData["language"] = "en",
  selectedPersonId?: string,
  controlsVisible = true
): ConnectionPlan {
  const peopleById = new Map(layout.people.map((person) => [person.id, person]));
  const controls = makeControls(layout, peopleById);
  const obstacles: RouteObstacle[] = makeNodeObstacles(
    layout, controls, selectedPersonId, controlsVisible
  );
  const failures: string[] = [];
  const familyDrafts = buildFamilies(layout, peopleById, obstacles);
  const occupied = routeFamilies(familyDrafts, obstacles, failures);
  const nonParentRoutes: PlannedNonParentRoute[] = [];
  for (const relationship of layout.relationships.filter(({ kind }) => kind !== "parent")
    .sort((left, right) => compareText(left.id, right.id))) {
    if (relationship.kind === "sibling" && familyDrafts.some(({ childIds }) =>
      childIds.includes(relationship.fromPersonId) && childIds.includes(relationship.toPersonId)
    )) continue;
    const from = peopleById.get(relationship.fromPersonId);
    const to = peopleById.get(relationship.toPersonId);
    if (!from || !to) continue;
    const [left, right] = from.x < to.x || (from.x === to.x && compareText(from.id, to.id) <= 0)
      ? [from, to] : [to, from];
    const endpointIds = new Set([from.id, to.id]);
    let segments = routeBetweenPeople(
      left, right, endpointIds, obstacles, occupied, LAYOUT_METRICS.avatarRadius
    );
    if (!segments) {
      segments = routeBetweenPeople(
        left, right, endpointIds, obstacles, [], LAYOUT_METRICS.avatarRadius
      ) ?? segmentsForPoints([
        { x: left.x + LAYOUT_METRICS.avatarRadius, y: left.y },
        { x: right.x - LAYOUT_METRICS.avatarRadius, y: right.y }
      ]);
      failures.push(`relationship:${relationship.id}`);
    }
    const text = relationshipLabelText(relationship, language);
    const placement = text
      ? placeRelationshipLabel(relationship.id, text, segments, obstacles, [...occupied, ...segments])
      : undefined;
    const route = { id: relationship.id, relationship, segments, label: placement?.label };
    nonParentRoutes.push(route);
    occupied.push(...segments);
    if (placement) obstacles.push(placement.obstacle);
  }
  const connectors = [
    ...familyDrafts.map((family) => ({
      segments: family.segments,
      endpointIds: family.parentIds.concat(family.childIds),
      kind: "parent" as const
    })),
    ...nonParentRoutes.map((route) => ({
      segments: route.segments,
      endpointIds: [route.relationship.fromPersonId, route.relationship.toPersonId],
      kind: route.relationship.kind
    }))
  ];
  const crossings: PlannedCrossing[] = [];
  connectors.forEach((first, firstIndex) => connectors.slice(firstIndex + 1).forEach((second) => {
    first.segments.forEach((left) => second.segments.forEach((right) => {
      const point = crossingPoint(left, right);
      if (!point || crossings.some((existing) => pointsEqual(existing, point))) return;
      const sharedIds = first.endpointIds.filter((id) => second.endpointIds.includes(id));
      const sharedTerminal = sharedIds.length > 0 &&
        [first.segments[0]?.start, first.segments.at(-1)?.end].some((terminal) => terminal && pointsEqual(terminal, point)) &&
        [second.segments[0]?.start, second.segments.at(-1)?.end].some((terminal) => terminal && pointsEqual(terminal, point));
      const horizontalKind = segmentOrientation(left) === "horizontal" ? first.kind : second.kind;
      const verticalKind = segmentOrientation(left) === "vertical" ? first.kind : second.kind;
      if (!sharedTerminal) crossings.push({ ...point, kind: verticalKind, horizontalKind });
    }));
  }));
  crossings.sort((left, right) => left.y - right.y || left.x - right.x);
  const families: PlannedFamilyRoute[] = familyDrafts.map((family) => ({
    id: family.id,
    parentIds: family.parentIds,
    childIds: family.childIds,
    relationshipIds: family.relationshipIds,
    parentPorts: family.parentPorts,
    segments: family.segments,
    junctions: family.junctions,
    laneIndex: family.laneIndex,
    laneCount: family.laneCount
  }));
  const selfOverlap = connectors.some(({ segments }) => segments.some((segment, index) =>
    segments.slice(index + 1).some((other) => collinearlyOverlaps(segment, other))
  ));
  const allSegments = connectors.flatMap(({ segments }) => segments);
  return {
    families,
    nonParentRoutes,
    obstacles,
    controls,
    crossings,
    bounds: planBounds(obstacles, allSegments),
    failures,
    isValid: failures.length === 0 && !selfOverlap
  };
}
