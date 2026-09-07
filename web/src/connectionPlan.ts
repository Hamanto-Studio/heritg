import {
  CHILD_RAIL_CLEARANCE,
  ROUTE_CLEARANCE,
  ROUTE_EPSILON,
  avatarRect,
  collinearlyOverlaps,
  compareText,
  controlRect,
  hasCollinearOverlap,
  isAvatarCircleTerminal,
  nodeLabelRect,
  parentPortY,
  pointOnSegment,
  pointsEqual,
  relationshipLabelText,
  routeIsClear,
  segmentIntersectsRect,
  segmentOrientation,
  segmentLength,
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
  routeCrossingCount,
  splitAtAttachmentPoints
} from "./obstacleRouter";
import { LAYOUT_METRICS } from "./layout";
import { familyRouteLanes, FAMILY_ROUTE_LANE_SPACING } from "./familyRouteLanes";
import { parentConnectionGroups, ancestryRelationshipLabel, careRelationshipLabel, sharedStepParentPaths } from "./parentConnections";
import type { AppData, FamilyRelationship, PositionedPerson, TreeLayout } from "./types";

export const FAMILY_RAIL_SPACING = FAMILY_ROUTE_LANE_SPACING;

export interface PlannedFamilyRoute {
  id: string;
  parentIds: string[];
  childIds: string[];
  relationshipIds: string[];
  parentPorts: RoutePoint[];
  childPorts: RoutePoint[];
  care?: FamilyRelationship;
  label?: PlannedRelationshipLabel;
  childLabels?: { id: string; childId: string; relationshipIds: string[]; relationship: FamilyRelationship; label: PlannedRelationshipLabel }[];
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
  labelTerminals?: { personId: string; point: RoutePoint }[];
}

export interface PlannedCrossing extends RoutePoint {
  kind: FamilyRelationship["kind"];
  horizontalKind: FamilyRelationship["kind"];
  dashed?: boolean;
  horizontalDashed?: boolean;
}

export interface ConnectionPlan {
  families: PlannedFamilyRoute[];
  nonParentRoutes: PlannedNonParentRoute[];
  sharedParentPaths: ReturnType<typeof sharedStepParentPaths>;
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
}

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

const familySegments = (
  parents: readonly RoutePoint[],
  parentPorts: readonly RoutePoint[],
  children: readonly RoutePoint[],
  childPorts: readonly RoutePoint[],
  parentJoinY: number,
  childRailOffset: number,
  parentTrunkX: number,
  continuationTrunkX: number,
  singleRail = false
) => {
  const parentXs = [...parentPorts.map(({ x }) => x), parentTrunkX];
  const childLevels = singleRail ? [Math.min(...children.map(({ y }) => y))] : children.map(({ y }) => y);
  const childRows = [...new Set(childLevels)]
    .sort((left, right) => left - right)
    .map((childY) => ({
      children: singleRail ? children : children.filter(({ y }) => y === childY),
      railY: childY - LAYOUT_METRICS.avatarRadius - childRailOffset
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
          end: childPorts[children.indexOf(child)]
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
  const groups = parentConnectionGroups(layout.relationships.filter((edge) => peopleById.has(edge.fromPersonId) && peopleById.has(edge.toPersonId)));
  const families = groups.map((group): FamilyDraft => {
    const parents = group.parentIds.map((personId) => peopleById.get(personId)!)
      .sort((left, right) => left.x - right.x || compareText(left.id, right.id));
    const children = [...group.childIds].map((personId) => peopleById.get(personId)!)
      .sort((left, right) => left.x - right.x || compareText(left.id, right.id));
    const coordinates = [...parents, ...children].map(({ x }) => x);
    return {
      id: group.id,
      care: group.care,
      parentIds: parents.map(({ id: personId }) => personId),
      childIds: children.map(({ id: personId }) => personId),
      relationshipIds: group.relationships.map((edge) => edge.id),
      parentCenters: parents.map((parent) => ({ x: parent.x, y: parentPortY(parent) })),
      parentPorts: parents.map((parent) => ({ x: parent.x, y: parentPortY(parent) })),
      children: children.map(({ x, y }) => ({ x, y })),
      childPorts: children.map(({ x, y }) => ({ x, y: y - LAYOUT_METRICS.avatarRadius })),
      interval: [Math.min(...coordinates), Math.max(...coordinates)],
      band: `${Math.round(average(parents.map(({ y }) => y)))}`,
      segments: [],
      baseSegments: [],
      junctions: [],
      laneIndex: 0,
      laneCount: 1
    };
  });
  const lanes = new Map(familyRouteLanes(layout.people, layout.relationships, layout.familyRailY).map((family) => [family.id, family]));
  for (const family of families) {
    const lane = lanes.get(family.id);
    family.laneIndex = lane?.parentLaneIndex ?? 0;
    family.laneCount = lane?.parentLaneCount ?? 1;
  }
  // Every additional parent set or care branch needs its own child socket.
  // Sharing the ancestry stem would invent a junction between parent sets.
  for (const child of layout.people) {
    const hasBirthParent = (family: FamilyDraft) => groups.find((group) => group.id === family.id)!.relationships
      .some((edge) => edge.toPersonId === child.id && edge.subtype === "biologicalParent");
    const ancestry = families.filter((family) => !family.care && family.childIds.includes(child.id))
      .sort((a, b) => Number(hasBirthParent(b)) - Number(hasBirthParent(a)) || compareText(a.id, b.id))[0];
    const secondary = families.filter((family) => family !== ancestry && family.childIds.includes(child.id))
      .sort((a, b) => average(a.parentCenters.map((p) => p.x)) - average(b.parentCenters.map((p) => p.x)) || compareText(a.id, b.id));
    secondary.forEach((family, index) => {
      const childIndex = family.childIds.indexOf(child.id);
      const ancestryCenter = ancestry ? (Math.min(...ancestry.children.map((p) => p.x)) + Math.max(...ancestry.children.map((p) => p.x))) / 2 : undefined;
      // Approach an outside child on the outside of their ancestry rail, so
      // a guardian's final stem does not unnecessarily cross that whole rail.
      const ancestryRail = ancestry ? layout.familyRailY?.[ancestry.id] : undefined;
      const belowAncestry = family.care && ancestryRail !== undefined &&
        family.parentIds.every((id) => peopleById.get(id)!.y > ancestryRail);
      const direction = !belowAncestry && ancestryCenter !== undefined && ancestryCenter !== child.x
        ? (child.x < ancestryCenter ? -1 : 1)
        : (average(family.parentCenters.map((p) => p.x)) < child.x ? -1 : 1);
      const offset = direction * (12 + index * Math.min(8, 12 / Math.max(1, secondary.length)));
      family.children[childIndex].x += offset;
      family.childPorts[childIndex].x += offset;
      family.childPorts[childIndex].y = child.y - Math.sqrt(LAYOUT_METRICS.avatarRadius ** 2 - offset ** 2);
    });
  }
  const familiesByParent = new Map<string, FamilyDraft[]>();
  for (const family of families) for (const parentId of family.parentIds) {
    const values = familiesByParent.get(parentId) ?? [];
    values.push(family);
    familiesByParent.set(parentId, values);
  }
  for (const [parentId, values] of familiesByParent) {
    // A parent's separate unions must leave in their visual left-to-right
    // order. Sorting by record ID twists those sockets across the neighboring
    // union even when all partners and children are already ordered correctly.
    const destination = (family: FamilyDraft) => {
      const coParents = family.parentCenters.filter((_, index) => family.parentIds[index] !== parentId);
      return average((coParents.length ? coParents : family.children).map(({ x }) => x));
    };
    values.sort((left, right) => destination(left) - destination(right) ||
      average(left.children.map(({ x }) => x)) - average(right.children.map(({ x }) => x)) ||
      compareText(left.id, right.id));
    values.forEach((family, index) => {
      const parentIndex = family.parentIds.indexOf(parentId);
      family.parentPorts[parentIndex].x +=
        (index - (values.length - 1) / 2) * Math.min(FAMILY_RAIL_SPACING, 144 / Math.max(1, values.length - 1));
    });
  }
  for (const family of families) {
    const corridor = layout.familyRouteGeometry?.[family.id];
    if (corridor && family.parentIds.every((id) => {
      const port = corridor.parentPorts[id], person = peopleById.get(id)!;
      const rect = nodeLabelRect(person);
      return port && Math.abs(port.y - parentPortY(person)) < ROUTE_EPSILON && port.x >= rect.x && port.x <= rect.x + rect.width &&
        corridor.segments.some(({ start, end }) => start.x === end.x &&
          (pointsEqual(start, port) && end.y > port.y || pointsEqual(end, port) && start.y > port.y));
    }) && family.childIds.every((id) => {
      const port = corridor.childPorts[id];
      return port && isAvatarCircleTerminal(port, { kind: "avatar", ownerId: id, rect: avatarRect(peopleById.get(id)!) }) &&
        corridor.segments.some(({ start, end }) => pointsEqual(start, port) || pointsEqual(end, port));
    }) && corridor.segments.every(({ start, end }) => [start.x, start.y, end.x, end.y].every(Number.isFinite) && segmentOrientation({ start, end })) &&
        segmentsFormConnectedNetwork(corridor.segments)) {
      family.parentPorts = family.parentIds.map((id) => corridor.parentPorts[id]);
      family.childPorts = family.childIds.map((id) => corridor.childPorts[id]);
      family.baseSegments = corridor.segments;
      family.segments = corridor.segments;
      continue;
    }
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
    const parentJoinY = parentStartY + 8 + family.laneIndex * spacing;
    const laneOffset = (lanes.get(family.id)?.childLaneIndex ?? 0) * FAMILY_RAIL_SPACING;
    const insetRail = layout.familyRailY?.[family.id];
    const childRailOffset = insetRail === undefined ? (lanes.get(family.id)?.childStemClearance ?? CHILD_RAIL_CLEARANCE) + laneOffset
      : childTopY - insetRail + laneOffset;
    const baseTrunkX = average(family.parentPorts.map(({ x }) => x));
    const nearestChildX = [...family.children].sort((left, right) =>
      Math.abs(left.x - baseTrunkX) - Math.abs(right.x - baseTrunkX) || left.x - right.x
    )[0].x;
    const overlapsEndpoint = families.some((other) => other !== family && other.band === family.band &&
      [...other.parentPorts, ...other.children].some(({ x }) => x === nearestChildX));
    const aligns = !overlapsEndpoint &&
      (family.children.length === 1 || Math.abs(nearestChildX - baseTrunkX) <= ROUTE_CLEARANCE + 4);
    const preferredTrunkX = aligns ? nearestChildX :
      baseTrunkX + (family.laneIndex - (family.laneCount - 1) / 2) * 8;
    // Keep a household's child rail inside its own children's span. A parent
    // shared by several unions can be far from one set of children; extending
    // that rail back under the parent makes it merge with the next household.
    // Travel sideways on the parent join instead, then descend at the edge.
    let trunkX = new Set(family.children.map(({ y }) => y)).size === 1
      ? Math.max(Math.min(...family.children.map(({ x }) => x)), Math.min(Math.max(...family.children.map(({ x }) => x)), preferredTrunkX))
      : preferredTrunkX;
    // The midpoint of an outer union may sit directly above a staggered
    // spouse. Keep that union's trunk on its own co-parent's side instead of
    // letting the obstacle router weave around the lower spouse and back
    // through their marriage and child join. Children still share their full
    // original rail; only the column feeding it changes.
    if (family.parentIds.length === 2 && new Set(family.parentIds.map((id) => peopleById.get(id)!.y)).size === 1 &&
        new Set(family.children.map(({ y }) => y)).size === 1) {
      const railY = Math.min(...family.children.map(({ y }) => y)) - LAYOUT_METRICS.avatarRadius - childRailOffset;
      const endpointIds = new Set([...family.parentIds, ...family.childIds]);
      const trunk = (x: number) => [{ start: { x, y: parentJoinY }, end: { x, y: railY } }];
      if (!routeIsClear(trunk(trunkX), nodeObstacles, endpointIds)) for (const sharedId of family.parentIds) {
        const lowerUnion = families.some((other) => other !== family && other.parentIds.includes(sharedId) &&
          other.parentIds.some((id) => !family.parentIds.includes(id) && peopleById.get(id)!.y > parentRowY && peopleById.get(id)!.y < railY));
        if (!lowerUnion) continue;
        const coParent = peopleById.get(family.parentIds.find((id) => id !== sharedId)!)!;
        const candidate = Math.max(Math.min(...family.children.map(({ x }) => x)), Math.min(Math.max(...family.children.map(({ x }) => x)), coParent.x));
        if (routeIsClear(trunk(candidate), nodeObstacles, endpointIds)) { trunkX = candidate; break; }
      }
    }
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
          y - LAYOUT_METRICS.avatarRadius - childRailOffset
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
    const firstRailY = Math.min(...family.children.map(({ y }) => y)) - LAYOUT_METRICS.avatarRadius - childRailOffset;
    // When a child is placed alongside a spouse on a lower row, extend that
    // child's stem from the siblings' existing rail if its column is clear.
    // A second rail below the intervening generation would cross their families.
    const singleRail = new Set(family.children.map(({ y }) => y)).size > 1 &&
      family.children.every((child, index) => nodeObstacles.every((obstacle) =>
        obstacle.ownerId === family.childIds[index] || !segmentIntersectsRect({
          start: { x: child.x, y: firstRailY },
          end: { x: child.x, y: child.y - LAYOUT_METRICS.avatarRadius }
        }, obstacle.rect)
      ));
    family.baseSegments = familySegments(
      family.parentCenters, family.parentPorts, family.children, family.childPorts, parentJoinY, childRailOffset,
      trunkX, continuationTrunkX, singleRail
    );
    family.segments = family.baseSegments;
    family.junctions = [
      { x: trunkX, y: parentJoinY },
      ...[...new Set(family.children.map(({ y }) => singleRail ? firstRailY :
        y - LAYOUT_METRICS.avatarRadius - childRailOffset
      ))].sort((left, right) => left - right).flatMap((y, index) => index === 0
        ? [{ x: trunkX, y }, ...(!singleRail && continuationTrunkX !== trunkX ? [{ x: continuationTrunkX, y }] : [])]
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
    const routeNetwork = (base: RouteSegment[]) => {
      const routed: RouteSegment[] = [];
      for (const segment of splitAtAttachmentPoints(base)) {
        const route = preferredRoute(segment.start, segment.end, obstacles, endpointIds, [...occupied, ...routed]);
        if (!route) return undefined;
        routed.push(...route);
      }
      if (!routeIsClear(routed, obstacles, endpointIds) || !segmentsFormConnectedNetwork(routed)) return undefined;
      return routed;
    };
    let routed = routeNetwork(family.baseSegments);
    if (!routed) {
      // A previous detour can occupy a later household's provisional join.
      // Moving just one segment leaves that join pinned to the wrong rail.
      // Relocate the connected internal network together, retaining every
      // actual person socket, before considering a visibly failed fallback.
      // When the child rail cannot move with the parent join, try moving one
      // complete horizontal level (including every attached stem) on its own.
      const ports = [...family.parentPorts, ...family.childPorts];
      const levels = [...new Set(family.baseSegments.filter((segment) => segmentOrientation(segment) === "horizontal").map((segment) => segment.start.y))];
      for (const { level, offset } of [undefined, ...levels].flatMap((level) =>
        [32, -32, 64, -64, 96, -96].map((offset) => ({ level, offset })))) {
        const move = (point: RoutePoint) => ports.some((port) => pointsEqual(port, point)) ||
          (level !== undefined && Math.abs(point.y - level) > ROUTE_EPSILON) ? point : { x: point.x, y: point.y + offset };
        const candidate = family.baseSegments.map(({ start, end }) => ({ start: move(start), end: move(end) }));
        if (!candidate.every((segment) => segmentOrientation(segment)) ||
            !family.parentPorts.every((port) => candidate.some(({ start, end }) => start.x === end.x &&
              (pointsEqual(start, port) && end.y > port.y || pointsEqual(end, port) && start.y > port.y))) ||
            !family.childPorts.every((port) => candidate.some(({ start, end }) => start.x === end.x &&
              (pointsEqual(start, port) && end.y < port.y || pointsEqual(end, port) && start.y < port.y)))) continue;
        routed = routeNetwork(candidate);
        if (routed) break;
      }
    }
    if (routed) {
      family.segments = routed;
    } else {
      const relaxed: RouteSegment[] = [];
      for (const segment of splitAtAttachmentPoints(family.baseSegments)) {
        const route = preferredRoute(
          segment.start,
          segment.end,
          obstacles,
          endpointIds,
          relaxed
        );
        if (!route) {
          relaxed.length = 0;
          break;
        }
        relaxed.push(...route);
      }
      family.segments = relaxed.length && segmentsFormConnectedNetwork(relaxed)
        ? relaxed : family.baseSegments;
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
  for (const family of familyDrafts) if (family.care) {
    const placement = placeRelationshipLabel(family.id, careRelationshipLabel(family.care, language), family.segments, obstacles, occupied, true);
    if (placement) { family.label = placement.label; obstacles.push(placement.obstacle); }
    else failures.push(`care-label:${family.id}`);
  }
  const parentRecords = new Map(layout.relationships.map((edge) => [edge.id, edge]));
  for (const family of familyDrafts) if (!family.care) {
    for (const [index, childId] of family.childIds.entries()) {
      const records = family.relationshipIds.map((id) => parentRecords.get(id)!)
        .filter((edge) => edge.toPersonId === childId);
      const kinds = [...new Set(records.map((edge) => edge.subtype))].sort(compareText);
      const hasOtherParents = familyDrafts.some((other) => other !== family && !other.care && other.childIds.includes(childId));
      if (!hasOtherParents && kinds.every((kind) => kind === "biologicalParent")) continue;
      const text = kinds.map((kind) => ancestryRelationshipLabel(kind, language,
        new Set(records.filter((edge) => edge.subtype === kind).map((edge) => edge.fromPersonId)).size)).join(" / ");
      const port = family.childPorts[index];
      const terminalSegments = family.segments.filter((segment) => pointOnSegment(port, segment));
      const id = `${family.id}:child:${childId}`;
      const placement = placeRelationshipLabel(id, text, terminalSegments, obstacles, occupied, true) ??
        (family.childIds.length === 1 ? placeRelationshipLabel(id, text, family.segments, obstacles, occupied, true) : undefined);
      if (placement) {
        (family.childLabels ??= []).push({ id, childId, relationshipIds: records.map((edge) => edge.id), relationship: records[0], label: placement.label });
        obstacles.push(placement.obstacle);
      } else failures.push(`parent-label:${id}`);
    }
  }
  const parentsByChild = new Map<string, Map<string, FamilyRelationship["subtype"]>>();
  for (const edge of layout.relationships) if (edge.kind === "parent") {
    const parents = parentsByChild.get(edge.toPersonId) ?? new Map();
    parents.set(edge.fromPersonId, edge.subtype);
    parentsByChild.set(edge.toPersonId, parents);
  }
  const siblingShownByParents = (edge: FamilyRelationship) => {
    const first = parentsByChild.get(edge.fromPersonId), second = parentsByChild.get(edge.toPersonId);
    if (!first || !second) return false;
    return [...first].some(([parentId, subtype]) => {
      const other = second.get(parentId);
      if (!other) return false;
      if (edge.subtype === "halfSibling") return subtype === "biologicalParent" && other === "biologicalParent";
      if (edge.subtype === "stepSibling") return (subtype === "stepParent" && other === "biologicalParent") || (subtype === "biologicalParent" && other === "stepParent");
      return false;
    });
  };
  for (const relationship of layout.relationships.filter(({ kind }) => kind !== "parent")
    .sort((left, right) => compareText(left.id, right.id))) {
    // Half- and step-siblings can sit on different household buses. Their
    // shared parent's stems already connect them; a second cross-household
    // sibling line adds a web of redundant routes without adding ancestry.
    if (relationship.kind === "sibling" && (siblingShownByParents(relationship) || familyDrafts.some(({ childIds }) =>
      childIds.includes(relationship.fromPersonId) && childIds.includes(relationship.toPersonId)
    ))) continue;
    const from = peopleById.get(relationship.fromPersonId);
    const to = peopleById.get(relationship.toPersonId);
    if (!from || !to) continue;
    const [left, right] = from.x < to.x || (from.x === to.x && compareText(from.id, to.id) <= 0)
      ? [from, to] : [to, from];
    const endpointIds = new Set([from.id, to.id]);
    // A spouse on a lower physical tier can meet the upper person's complete
    // name/life block from below, like the existing parent sockets. Requiring
    // every marriage to climb back to the avatar would cut the outer union.
    // Same-row marriages and sibling relationships keep avatar terminals.
    const upper = left.y < right.y ? left : right;
    const lower = upper === left ? right : left;
    const labelPorts = relationship.kind === "partner" && upper.y < lower.y
      ? [0, -16, 16, -32, 32, -48, 48, -64, 64].map((offset) => {
        const label = { x: upper.x + offset, y: parentPortY(upper) };
        const avatar = { x: lower.x + (lower === left ? 1 : -1) * LAYOUT_METRICS.avatarRadius, y: lower.y };
        return { start: upper === left ? label : avatar, end: upper === left ? avatar : label, penalty: 180 };
      }) : [];
    const belowLabel = (point: RoutePoint, person: PositionedPerson) => {
      const label = nodeLabelRect(person);
      return Math.abs(point.y - parentPortY(person)) < ROUTE_EPSILON && point.x >= label.x && point.x <= label.x + label.width;
    };
    const corridorCandidates = relationship.kind === "partner" ? layout.partnerRouteCandidates?.[relationship.id]?.filter((candidate) => {
      const first = candidate[0], last = candidate.at(-1);
      return first && last && belowLabel(first.start, from) && belowLabel(last.end, to) &&
        Math.abs(first.end.x - first.start.x) < ROUTE_EPSILON && first.end.y > first.start.y &&
        Math.abs(last.start.x - last.end.x) < ROUTE_EPSILON && last.start.y > last.end.y &&
        candidate.every((segment, index) => segmentOrientation(segment) &&
          (!index || pointsEqual(candidate[index - 1].end, segment.start)) &&
          !candidate.slice(index + 1).some((other) => collinearlyOverlaps(segment, other))) &&
        routeIsClear(candidate, obstacles, endpointIds) && !hasCollinearOverlap(candidate, occupied);
    }) : undefined;
    const corridorCost = (candidate: RouteSegment[]) => routeCrossingCount(candidate, occupied) * 1024 +
      candidate.reduce((sum, segment) => sum + segmentLength(segment), 0);
    const corridorSegments = corridorCandidates?.sort((a, b) => corridorCost(a) - corridorCost(b))[0];
    let segments = corridorSegments ?? routeBetweenPeople(
      left, right, endpointIds, obstacles, occupied, LAYOUT_METRICS.avatarRadius, labelPorts
    );
    if (!segments) {
      segments = routeBetweenPeople(
        left, right, endpointIds, obstacles, [], LAYOUT_METRICS.avatarRadius, labelPorts
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
    const firstTerminal = segments[0]?.start, lastTerminal = segments.at(-1)?.end;
    const labelTerminals = labelPorts.filter((pair) => firstTerminal && lastTerminal && pointsEqual(pair.start, firstTerminal) && pointsEqual(pair.end, lastTerminal))
      .map((pair) => ({ personId: upper.id, point: upper === left ? pair.start : pair.end }));
    if (corridorSegments) for (const person of [from, to]) {
      const terminal = [firstTerminal, lastTerminal].find((point) => point && Math.abs(point.y - parentPortY(person)) < ROUTE_EPSILON &&
        point.x >= nodeLabelRect(person).x && point.x <= nodeLabelRect(person).x + nodeLabelRect(person).width);
      if (terminal && !labelTerminals.some((existing) => existing.personId === person.id)) labelTerminals.push({ personId: person.id, point: terminal });
    }
    const route = { id: relationship.id, relationship, segments, label: placement?.label,
      ...(labelTerminals.length ? { labelTerminals } : {}) };
    nonParentRoutes.push(route);
    occupied.push(...segments);
    if (placement) obstacles.push(placement.obstacle);
  }
  const connectors = [
    ...familyDrafts.map((family) => ({
      segments: family.segments,
      endpointIds: family.parentIds.concat(family.childIds),
      kind: "parent" as const,
      dashed: Boolean(family.care)
    })),
    ...nonParentRoutes.map((route) => ({
      segments: route.segments,
      endpointIds: [route.relationship.fromPersonId, route.relationship.toPersonId],
      kind: route.relationship.kind,
      dashed: route.relationship.kind === "sibling"
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
      if (!sharedTerminal) crossings.push({ ...point, kind: verticalKind, horizontalKind,
        dashed: segmentOrientation(left) === "vertical" ? first.dashed : second.dashed,
        horizontalDashed: segmentOrientation(left) === "horizontal" ? first.dashed : second.dashed });
    }));
  }));
  crossings.sort((left, right) => left.y - right.y || left.x - right.x);
  const families: PlannedFamilyRoute[] = familyDrafts.map((family) => ({
    id: family.id,
    parentIds: family.parentIds,
    childIds: family.childIds,
    relationshipIds: family.relationshipIds,
    parentPorts: family.parentPorts,
    childPorts: family.childPorts,
    care: family.care,
    label: family.label,
    childLabels: family.childLabels,
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
    sharedParentPaths: sharedStepParentPaths(layout.relationships),
    obstacles,
    controls,
    crossings,
    bounds: planBounds(obstacles, allSegments),
    failures,
    isValid: failures.length === 0 && !selfOverlap
  };
}
