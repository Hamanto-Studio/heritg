import { createConnectionPlan, segmentsFormConnectedNetwork, type ConnectionPlan } from "./connectionPlan";
import { collinearlyOverlaps, isAvatarCircleTerminal, nodeLabelRect, parentPortY, pointsEqual, rectsIntersect,
  routeIsClear, segmentOrientation, type RoutePoint } from "./connectionGeometry";
import { directedFamilyCorridors, reconnectingFamilyCorridors } from "./directedFamilyCorridors";
import { sharedAncestryCorridors } from "./sharedAncestryCorridors";
import { linkedHouseholdCorridors } from "./linkedHouseholdCorridors";
import { untangleFamilyRails } from "./untangleFamilyRails";
import { parentConnectionGroups } from "./parentConnections";
import type { AppData, TreeLayout } from "./types";

const finitePoint = (point: RoutePoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Admission gate for an alternative drawing, separate from its construction.
 * Reject incomplete or overlapping geometry even if it has fewer crossings.
 * Independent test measurements also check typing, exports and graph fidelity.
 */
export function completeTreeRouting(layout: TreeLayout, plan: ConnectionPlan) {
  if (!plan.isValid || plan.failures.length || !layout.people.every(finitePoint) ||
      !Object.values(plan.bounds).every(Number.isFinite)) return false;
  const people = new Map(layout.people.map((person) => [person.id, person]));
  const records = new Map(layout.relationships.map((edge) => [edge.id, edge]));
  const sameIds = (a: string[], b: string[]) => [...new Set(a)].sort().join("\0") === [...new Set(b)].sort().join("\0");
  const represented = new Set([...plan.families.flatMap((family) => family.relationshipIds),
    ...plan.nonParentRoutes.map((route) => route.id)]);
  for (const shared of plan.sharedParentPaths) if (represented.has(shared.partnerRelationshipId) && represented.has(shared.parentRelationshipId)) {
    represented.add(shared.relationship.id);
  }
  if (layout.relationships.some((edge) => edge.kind !== "sibling" && !represented.has(edge.id))) return false;
  if (layout.relationships.some((edge) => edge.kind === "parent" &&
      (!people.has(edge.fromPersonId) || !people.has(edge.toPersonId) || people.get(edge.fromPersonId)!.y >= people.get(edge.toPersonId)!.y))) return false;
  const personObstacles = plan.obstacles.filter((obstacle) => obstacle.kind !== "relationshipLabel");
  const labels = personObstacles.filter((obstacle) => obstacle.kind === "nodeLabel" || obstacle.kind === "avatar");
  if (labels.some((a, i) => labels.slice(i + 1).some((b) => a.ownerId !== b.ownerId && rectsIntersect(a.rect, b.rect)))) return false;
  const validLabelPort = (id: string, point: RoutePoint) => {
    const person = people.get(id);
    if (!person) return false;
    const rect = nodeLabelRect(person);
    return Math.abs(point.y - parentPortY(person)) < 0.001 && point.x >= rect.x && point.x <= rect.x + rect.width;
  };
  for (const family of plan.families) {
    if (family.parentIds.length !== family.parentPorts.length || family.childIds.length !== family.childPorts.length) return false;
    const familyRecords = family.relationshipIds.map((id) => records.get(id));
    if (familyRecords.some((edge) => !edge || edge.kind !== "parent" ||
        !family.parentIds.includes(edge.fromPersonId) || !family.childIds.includes(edge.toPersonId))) return false;
    if (family.care) {
      if (!family.label?.text.trim()) return false;
    } else for (const childId of family.childIds) {
      const childRecords = familyRecords.filter((edge) => edge?.toPersonId === childId);
      if (!childRecords.length) return false;
      const types = [...new Set(childRecords.map((edge) => edge!.subtype))];
      if (types.some((type) => !sameIds(family.parentIds,
        childRecords.filter((edge) => edge!.subtype === type).map((edge) => edge!.fromPersonId)))) return false;
      const needsLabel = types.some((type) => type !== "biologicalParent") ||
        plan.families.some((other) => other !== family && !other.care && other.childIds.includes(childId));
      if (needsLabel && !family.childLabels?.some((annotation) => annotation.childId === childId &&
          annotation.label.text.trim() && sameIds(annotation.relationshipIds, childRecords.map((edge) => edge!.id)))) return false;
    }
    if (family.parentPorts.some((port, i) => !validLabelPort(family.parentIds[i], port) ||
        !family.segments.some(({ start, end }) => start.x === end.x &&
          (pointsEqual(start, port) && end.y > port.y || pointsEqual(end, port) && start.y > port.y)))) return false;
    if (family.childPorts.some((port, i) => {
      const avatar = personObstacles.find((obstacle) => obstacle.kind === "avatar" && obstacle.ownerId === family.childIds[i]);
      return !avatar || !isAvatarCircleTerminal(port, avatar) ||
        !family.segments.some(({ start, end }) => pointsEqual(start, port) || pointsEqual(end, port));
    })) return false;
  }
  for (const route of plan.nonParentRoutes) {
    const first = route.segments[0], last = route.segments.at(-1);
    if (!first || !last) return false;
    for (const id of [route.relationship.fromPersonId, route.relationship.toPersonId]) {
      const avatar = personObstacles.find((obstacle) => obstacle.kind === "avatar" && obstacle.ownerId === id);
      const attached = [first.start, last.end].some((point) => avatar && isAvatarCircleTerminal(point, avatar) ||
        route.labelTerminals?.some((terminal) => terminal.personId === id && pointsEqual(point, terminal.point) && validLabelPort(id, point)));
      if (!attached) return false;
    }
  }
  const connectors = [...plan.families.map((family) => ({ segments: family.segments, ids: [...family.parentIds, ...family.childIds] })),
    ...plan.nonParentRoutes.map((route) => ({ segments: route.segments, ids: [route.relationship.fromPersonId, route.relationship.toPersonId] }))];
  for (const [index, connector] of connectors.entries()) {
    if (!connector.segments.every((segment) => finitePoint(segment.start) && finitePoint(segment.end) && segmentOrientation(segment)) ||
        !segmentsFormConnectedNetwork(connector.segments) || !routeIsClear(connector.segments, personObstacles, new Set(connector.ids))) return false;
    if (connectors.slice(index + 1).some((other) => connector.segments.some((a) => other.segments.some((b) => collinearlyOverlaps(a, b))))) return false;
  }
  return true;
}

/** Keep already-clear compact trees. For crossed Full trees, try coordinated
 * shared-ancestry and whole-branch corridors; admit only complete routed plans.
 * Repair invalid plans before comparing crossings. Unsupported topologies
 * retain every original edge in the general drawing.
 */
export function fullTreeRouting(layout: TreeLayout, planOrCreate: ConnectionPlan | (() => ConnectionPlan), language: AppData["language"], controlsVisible: boolean) {
  type Prepared = { layout: TreeLayout; plan: ConnectionPlan };
  type Builder = (source: TreeLayout) => TreeLayout | undefined;
  const candidates = new Map<Builder, Prepared | undefined>();
  const candidateFor = (build: Builder) => {
    if (!candidates.has(build)) {
      const candidate = build(layout);
      candidates.set(build, candidate ? { layout: candidate,
        plan: createConnectionPlan(candidate, language, undefined, controlsVisible) } : undefined);
    }
    return candidates.get(build);
  };
  // Large joined households can already have a complete crossing-free route.
  // Verify that route before paying to build a crowded temporary incumbent.
  // A nonzero/invalid result still needs the ordinary comparison, and is cached
  // so declining this fast path does not repeat the same routing work.
  if (typeof planOrCreate === "function" && layout.people.length >= 100) {
    const groups = parentConnectionGroups(layout.relationships).filter((group) => !group.care);
    const sharedSiblings = groups.some((group, index) => groups.slice(index + 1).some((other) =>
      group.childIds.filter((id) => other.childIds.includes(id)).length > 1));
    for (const build of [sharedAncestryCorridors, linkedHouseholdCorridors]) {
      // A single child's additional history is often already clear in the
      // compact drawing. Do not expand it merely because a candidate exists.
      if (build === sharedAncestryCorridors && !sharedSiblings) continue;
      const candidate = candidateFor(build);
      if (candidate && !candidate.plan.crossings.length && completeTreeRouting(candidate.layout, candidate.plan)) return candidate;
    }
  }
  const plan = typeof planOrCreate === "function" ? planOrCreate() : planOrCreate;
  const incumbent = { layout, plan };
  if (!plan.crossings.length && plan.isValid) return incumbent;
  const refineRails = (current: typeof incumbent) => {
    const candidate = untangleFamilyRails(current.layout, current.plan);
    if (!candidate) return current;
    const candidatePlan = createConnectionPlan(candidate, language, undefined, controlsVisible);
    return candidatePlan.crossings.length < current.plan.crossings.length && completeTreeRouting(candidate, candidatePlan)
      ? { layout: candidate, plan: candidatePlan } : current;
  };
  for (const build of [sharedAncestryCorridors, linkedHouseholdCorridors, reconnectingFamilyCorridors, directedFamilyCorridors]) {
    const candidate = candidateFor(build);
    if (!candidate) continue;
    if ((plan.isValid && candidate.plan.crossings.length >= plan.crossings.length) || !completeTreeRouting(candidate.layout, candidate.plan)) continue;
    return refineRails(candidate);
  }
  // Mixed archives can contain both whole-branch trees and reconnecting
  // marriages. Try a bounded set of placement scaffolds, with all original
  // connections restored and validated before comparing actual crossings.
  let best = incumbent;
  for (const reverse of [true, false]) for (const prefer of ["parents", "children"] as const) {
    const candidate = directedFamilyCorridors(layout, { prefer, reverse });
    if (!candidate) continue;
    const candidatePlan = createConnectionPlan(candidate, language, undefined, controlsVisible);
    if ((best.plan.isValid && candidatePlan.crossings.length >= best.plan.crossings.length) || !completeTreeRouting(candidate, candidatePlan)) continue;
    best = { layout: candidate, plan: candidatePlan };
    if (!candidatePlan.crossings.length) return best;
  }
  return refineRails(best);
}
