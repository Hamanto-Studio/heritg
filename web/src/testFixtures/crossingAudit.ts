import type { ConnectionPlan } from "../connectionPlan";
import type { FamilyRelationship } from "../types";

type Point = { x: number; y: number };
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
const samePoint = (a: Point, b: Point) => near(a.x, b.x) && near(a.y, b.y);

/** Test-only, measured from segments, never from plan.crossings or isValid.
 * Foreign routes may share a recorded person's port, but not another junction.
 * Collinear overlaps are separately covered by routeClarity.
 */
export function measuredCrossings(plan: ConnectionPlan) {
  const connectors = [
    ...plan.families.map((family) => ({ id: `family:${family.id}`, segments: family.segments,
      terminals: [...family.parentIds.map((id, i) => ({ id, point: family.parentPorts[i] })),
        ...family.childIds.map((id, i) => ({ id, point: family.childPorts[i] }))] })),
    ...plan.nonParentRoutes.map((route) => ({ id: `edge:${route.id}`, segments: route.segments,
      terminals: [{ id: route.relationship.fromPersonId, point: route.segments[0]?.start },
        { id: route.relationship.toPersonId, point: route.segments.at(-1)?.end }] }))
  ];
  const horizontal: { owner: number; x1: number; x2: number; y: number }[] = [];
  const vertical: { owner: number; y1: number; y2: number; x: number }[] = [];
  connectors.forEach((connector, owner) => connector.segments.forEach(({ start, end }) => {
    if (near(start.y, end.y) && !near(start.x, end.x)) horizontal.push({ owner,
      x1: Math.min(start.x, end.x), x2: Math.max(start.x, end.x), y: start.y });
    if (near(start.x, end.x) && !near(start.y, end.y)) vertical.push({ owner,
      y1: Math.min(start.y, end.y), y2: Math.max(start.y, end.y), x: start.x });
  }));
  const result: (Point & { owners: string[] })[] = [];
  for (const h of horizontal) for (const v of vertical) {
    if (h.owner === v.owner || v.x < h.x1 - 0.001 || v.x > h.x2 + 0.001 || h.y < v.y1 - 0.001 || h.y > v.y2 + 0.001) continue;
    const point = { x: v.x, y: h.y }, a = connectors[h.owner], b = connectors[v.owner];
    if (a.terminals.some((left) => left.point && samePoint(left.point, point) &&
      b.terminals.some((right) => right.id === left.id && right.point && samePoint(right.point, point)))) continue;
    let crossing = result.find((other) => samePoint(other, point));
    if (!crossing) { crossing = { ...point, owners: [] }; result.push(crossing); }
    for (const owner of [a.id, b.id]) if (!crossing.owners.includes(owner)) crossing.owners.push(owner);
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Derive a narrow nonplanarity witness from archive records, not the layout.
 * Three disjoint parent sets each connected to the same three children form
 * K3,3 when their separate family buses are contracted. Each witness needs at
 * least one crossing in this bus model. This is not an arbitrary-graph solver.
 */
export function threeParentSetWitnesses(relationships: readonly FamilyRelationship[]) {
  const byChild = new Map<string, Map<string, string[]>>();
  for (const edge of relationships) {
    if (edge.kind !== "parent" || !["biologicalParent", "adoptiveParent", "fosterParent"].includes(edge.subtype)) continue;
    if (!byChild.has(edge.toPersonId)) byChild.set(edge.toPersonId, new Map());
    const types = byChild.get(edge.toPersonId)!;
    types.set(edge.subtype, [...types.get(edge.subtype) ?? [], edge.fromPersonId]);
  }
  const sets = new Map<string, { parents: string[]; children: Set<string> }>();
  for (const [child, types] of byChild) for (const parentIds of types.values()) {
    const parents = [...new Set(parentIds)].sort(), key = JSON.stringify(parents);
    if (!sets.has(key)) sets.set(key, { parents, children: new Set() });
    sets.get(key)!.children.add(child);
  }
  const cohorts = new Map<string, string[][]>();
  for (const set of sets.values()) {
    if (set.children.size !== 3) continue;
    const key = JSON.stringify([...set.children].sort());
    cohorts.set(key, [...cohorts.get(key) ?? [], set.parents]);
  }
  return [...cohorts].flatMap(([key, parentSets]) => {
    const childIds = JSON.parse(key) as string[], parents = parentSets.flat();
    if (parentSets.length !== 3 || new Set(parents).size !== parents.length || parents.some((id) => childIds.includes(id))) return [];
    return [{ childIds, parentSets }];
  });
}
