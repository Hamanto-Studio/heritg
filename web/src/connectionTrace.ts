import type { ConnectionPlan, PlannedFamilyRoute } from "./connectionPlan";
import { pointOnSegment, segmentOrientation, type RoutePoint, type RouteSegment } from "./connectionGeometry";
import { branchJunctions, connectorPaths } from "./connectorStyle";
import { splitAtAttachmentPoints } from "./obstacleRouter";
import type { FamilyRelationship } from "./types";

const pointKey = (point: RoutePoint) => `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;

/** Trace inside one recorded family only. An unrelated crossing is never an
 * attachment, and sibling stems outside the chosen parent/child path stay quiet. */
function familyTrace(family: PlannedFamilyRoute, relationships: readonly FamilyRelationship[]) {
  const segments = splitAtAttachmentPoints([...family.segments,
    ...[...family.parentPorts, ...family.childPorts, ...branchJunctions(family.segments)].map((point) => ({ start: point, end: point }))]);
  const graph = new Map<string, { key: string; segment: number }[]>();
  segments.forEach(({ start, end }, segment) => {
    const a = pointKey(start), b = pointKey(end);
    graph.set(a, [...graph.get(a) ?? [], { key: b, segment }]);
    graph.set(b, [...graph.get(b) ?? [], { key: a, segment }]);
  });
  const selected = new Set<number>();
  const represented = new Set<string>();
  for (const relationship of relationships) {
    const from = family.parentPorts[family.parentIds.indexOf(relationship.fromPersonId)];
    const to = family.childPorts[family.childIds.indexOf(relationship.toPersonId)];
    if (!from || !to) continue;
    const start = pointKey(from), end = pointKey(to), queue = [start];
    const previous = new Map<string, { key: string; segment: number }>();
    const seen = new Set([start]);
    for (let i = 0; i < queue.length && !seen.has(end); i++) {
      for (const next of graph.get(queue[i]) ?? []) {
        if (seen.has(next.key)) continue;
        seen.add(next.key); previous.set(next.key, { key: queue[i], segment: next.segment }); queue.push(next.key);
      }
    }
    if (!seen.has(end)) continue;
    represented.add(relationship.id);
    for (let key = end; key !== start;) {
      const step = previous.get(key)!; selected.add(step.segment); key = step.key;
    }
  }
  return {
    paths: connectorPaths(segments).map((path) => ({ ...path, traced: path.segmentIndexes.every((index) => selected.has(index)) })),
    segments: segments.filter((_, index) => selected.has(index)), represented
  };
}

/** Selection is a visual aid over the complete plan, never a new layout/filter. */
export function connectionTrace(plan: ConnectionPlan, relationships: readonly FamilyRelationship[], selectedId?: string) {
  const wanted = new Set(relationships.filter((edge) => selectedId &&
    (edge.fromPersonId === selectedId || edge.toPersonId === selectedId)).map((edge) => edge.id));
  const people = new Set<string>();
  for (const edge of relationships) if (wanted.has(edge.id)) {
    people.add(edge.fromPersonId); people.add(edge.toPersonId);
  }
  const standalone = new Set(plan.nonParentRoutes.map((route) => route.relationship.id));
  const parents = relationships.filter((edge) => edge.kind === "parent");
  const siblingPaths = new Map<string, string[]>();
  for (const edge of relationships) if (wanted.has(edge.id) && edge.kind === "sibling" && !standalone.has(edge.id)) {
    const first = parents.filter((parent) => parent.toPersonId === edge.fromPersonId);
    const second = parents.filter((parent) => parent.toPersonId === edge.toPersonId);
    const shared = first.flatMap((a) => second.filter((b) => a.fromPersonId === b.fromPersonId).flatMap((b) => [a, b]));
    if (!shared.length) continue;
    siblingPaths.set(edge.id, shared.map((parent) => parent.id));
    for (const parent of shared) { wanted.add(parent.id); people.add(parent.fromPersonId); }
  }
  for (const path of plan.sharedParentPaths) if (wanted.has(path.relationship.id)) {
    wanted.add(path.partnerRelationshipId); wanted.add(path.parentRelationshipId); people.add(path.viaPersonId);
  }
  const families = new Map<string, ReturnType<typeof familyTrace>>();
  const segments: RouteSegment[] = [];
  const byId = new Map(relationships.map((edge) => [edge.id, edge]));
  const represented = new Set<string>();
  for (const family of plan.families) {
    const matching = family.relationshipIds.flatMap((id) => wanted.has(id) && byId.has(id) ? [byId.get(id)!] : []);
    if (!matching.length) continue;
    const trace = familyTrace(family, matching);
    families.set(family.id, trace); segments.push(...trace.segments);
    for (const id of trace.represented) represented.add(id);
  }
  const nonParents = new Set<string>();
  for (const route of plan.nonParentRoutes) if (wanted.has(route.relationship.id)) {
    nonParents.add(route.id); segments.push(...route.segments);
    represented.add(route.relationship.id);
  }
  for (const path of plan.sharedParentPaths) if (wanted.has(path.relationship.id) &&
    represented.has(path.partnerRelationshipId) && represented.has(path.parentRelationshipId)) represented.add(path.relationship.id);
  for (const [id, dependencies] of siblingPaths) if (dependencies.every((edgeId) => represented.has(edgeId))) represented.add(id);
  return { families, nonParents, people, represented,
    crosses: (point: RoutePoint, orientation: "horizontal" | "vertical") =>
      segments.some((segment) => segmentOrientation(segment) === orientation && pointOnSegment(point, segment))
  };
}
