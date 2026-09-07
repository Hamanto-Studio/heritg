import type { ConnectionPlan } from "../connectionPlan";
import { collinearlyOverlaps, pointOnSegment, pointsEqual, rectsIntersect, segmentIntersectsRect, segmentOrientation, type RoutePoint } from "../connectionGeometry";
import { segmentsFormConnectedNetwork } from "../connectionPlan";
import type { TreeLayout } from "../types";

/** Independent quality measurements, not merely ConnectionPlan.isValid. */
export function routeClarity(layout: TreeLayout, plan: ConnectionPlan) {
  const individualRoutes = plan.nonParentRoutes;
  const connectors = [
    ...plan.families.map((family) => ({ id: family.id, people: new Set([...family.parentIds, ...family.childIds]), segments: family.segments })),
    ...individualRoutes.map((route) => ({ id: route.id, people: new Set([route.relationship.fromPersonId, route.relationship.toPersonId]), segments: route.segments }))
  ];
  let obstacleHits = 0, unrelatedOverlaps = 0;
  for (const connector of connectors) for (const segment of connector.segments) {
    for (const obstacle of plan.obstacles) {
      if ((obstacle.kind === "avatar" || obstacle.kind === "nodeLabel") && !connector.people.has(obstacle.ownerId) && segmentIntersectsRect(segment, obstacle.rect)) obstacleHits++;
    }
  }
  connectors.forEach((a, i) => connectors.slice(i + 1).forEach((b) => {
    for (const left of a.segments) for (const right of b.segments) if (collinearlyOverlaps(left, right)) unrelatedOverlaps++;
  }));
  const represented = new Set([...plan.families.flatMap((family) => family.relationshipIds), ...individualRoutes.map((route) => route.id)]);
  // Shared paths count only after independently proving both visible recorded
  // edges lead from this step-parent, through their partner, to this child.
  for (const path of plan.sharedParentPaths) {
    const partner = layout.relationships.find((edge) => edge.id === path.partnerRelationshipId && edge.kind === "partner");
    const parent = layout.relationships.find((edge) => edge.id === path.parentRelationshipId && edge.kind === "parent");
    if (path.relationship.subtype === "stepParent" && partner && parent &&
        represented.has(partner.id) && represented.has(parent.id) &&
        [partner.fromPersonId, partner.toPersonId].includes(path.relationship.fromPersonId) &&
        [partner.fromPersonId, partner.toPersonId].includes(path.viaPersonId) &&
        path.viaPersonId !== path.relationship.fromPersonId && parent.fromPersonId === path.viaPersonId &&
        parent.toPersonId === path.relationship.toPersonId) represented.add(path.relationship.id);
  }
  const byId = new Map(layout.people.map((person) => [person.id, person]));
  const personObstacles = plan.obstacles.filter((obstacle) => obstacle.kind === "avatar" || obstacle.kind === "nodeLabel");
  let personOverlaps = 0;
  personObstacles.forEach((first, i) => personObstacles.slice(i + 1).forEach((second) => {
    if (first.ownerId !== second.ownerId && rectsIntersect(first.rect, second.rect)) personOverlaps++;
  }));
  const reversedParentDirections = layout.relationships.filter((edge) => edge.kind === "parent" &&
    byId.get(edge.fromPersonId)!.y >= byId.get(edge.toPersonId)!.y).length;
  let conflatedParentSets = 0, unlabeledParentTypes = 0;
  const byRelationship = new Map(layout.relationships.map((edge) => [edge.id, edge]));
  const sameIds = (a: string[], b: string[]) => [...new Set(a)].sort().join("\0") === [...new Set(b)].sort().join("\0");
  for (const family of plan.families) if (!family.care) for (const childId of family.childIds) {
    const records = family.relationshipIds.map((id) => byRelationship.get(id)!).filter((edge) => edge.toPersonId === childId);
    const kinds = [...new Set(records.map((edge) => edge.subtype))];
    for (const kind of kinds) if (!sameIds(family.parentIds, records.filter((edge) => edge.subtype === kind).map((edge) => edge.fromPersonId))) conflatedParentSets++;
    const needsLabel = kinds.some((kind) => kind !== "biologicalParent") ||
      plan.families.some((other) => !other.care && other !== family && other.childIds.includes(childId));
    if (needsLabel && !family.childLabels?.some((annotation) => annotation.childId === childId && annotation.label.text.trim() &&
      sameIds(annotation.relationshipIds, records.map((edge) => edge.id)))) unlabeledParentTypes++;
  }
  const missingFamilyTerminals = plan.families.reduce((total, family) => total + [
    ...family.parentPorts,
    ...family.childPorts
  ].filter((point) => !family.segments.some((segment) => pointOnSegment(point, segment))).length, 0);
  const invalidChildTerminals = plan.families.reduce((total, family) => total + family.childPorts.filter((port, index) => {
    const child = byId.get(family.childIds[index])!;
    return Math.abs(Math.hypot(port.x - child.x, port.y - child.y) - 32) > 0.001;
  }).length, 0);
  const labelsByOwner = new Map(plan.obstacles.filter((obstacle) => obstacle.kind === "nodeLabel")
    .map((obstacle) => [obstacle.ownerId, obstacle.rect]));
  const invalidParentTerminals = plan.families.reduce((total, family) => total + family.parentPorts.filter((port, index) => {
    const label = labelsByOwner.get(family.parentIds[index]);
    return !label || Math.abs(port.y - label.y - label.height - 2) > 0.001 || port.x < label.x || port.x > label.x + label.width ||
      !family.segments.some(({ start, end }) => Math.abs(start.x - end.x) < 0.001 &&
        (pointsEqual(start, port) && end.y > port.y || pointsEqual(end, port) && start.y > port.y));
  }).length, 0);
  const validLabelTerminal = (route: ConnectionPlan["nonParentRoutes"][number], id: string, point: RoutePoint) => {
    if (route.relationship.kind !== "partner") return false;
    const ids = [route.relationship.fromPersonId, route.relationship.toPersonId];
    if (!ids.includes(id)) return false;
    const label = plan.obstacles.find((obstacle) => obstacle.kind === "nodeLabel" && obstacle.ownerId === id)?.rect;
    if (!label || Math.abs(point.y - label.y - label.height - 2) > 0.001 || point.x < label.x || point.x > label.x + label.width) return false;
    const first = route.segments[0], last = route.segments.at(-1);
    // An actual route endpoint, attached below its own label and leaving
    // vertically downward. A free point, wrong owner or sideways name crossing
    // must not pass merely because the plan claims it is a label terminal.
    return Boolean(first && pointsEqual(first.start, point) && Math.abs(first.end.x - point.x) < 0.001 && first.end.y > point.y ||
      last && pointsEqual(last.end, point) && Math.abs(last.start.x - point.x) < 0.001 && last.start.y > point.y);
  };
  const invalidLabelTerminals = individualRoutes.reduce((total, route) => total +
    (route.labelTerminals ?? []).filter(({ personId, point }) => !validLabelTerminal(route, personId, point)).length, 0);
  const missingRelationshipTerminals = individualRoutes.reduce((total, route) => total +
    [route.relationship.fromPersonId, route.relationship.toPersonId].filter((id) => {
      const person = byId.get(id)!;
      return !route.labelTerminals?.some((terminal) => terminal.personId === id && validLabelTerminal(route, id, terminal.point)) &&
        ![route.segments[0]?.start, route.segments.at(-1)?.end].some((point) =>
          point && Math.abs(Math.hypot(point.x - person.x, point.y - person.y) - 32) < 0.001);
    }).length, 0);
  return {
    people: layout.people.length, relationships: layout.relationships.length,
    missingParentOrPartnerEdges: layout.relationships.filter((edge) => edge.kind !== "sibling" && !represented.has(edge.id)).length,
    missingTerminals: missingFamilyTerminals + missingRelationshipTerminals + invalidChildTerminals + invalidParentTerminals + invalidLabelTerminals,
    disconnectedRoutes: connectors.filter((connector) => !segmentsFormConnectedNetwork(connector.segments)).length,
    diagonalSegments: connectors.flatMap((connector) => connector.segments).filter((segment) => !segmentOrientation(segment)).length,
    obstacleHits, personOverlaps, reversedParentDirections, conflatedParentSets, unlabeledParentTypes,
    unlabeledCareLabels: plan.families.filter((family) => family.care && !family.label?.text.trim()).length,
    unrelatedOverlaps, crossings: plan.crossings.length, failures: plan.failures.length,
    width: Math.round(plan.bounds.width), height: Math.round(plan.bounds.height)
  };
}
