import { parentPortY, type RoutePoint, type RouteSegment } from "./connectionGeometry";
import { mergeCorridorSegments } from "./directedFamilyCorridors";
import { parentConnectionGroups } from "./parentConnections";
import type { PositionedPerson, TreeLayout } from "./types";

export type Geometry = NonNullable<TreeLayout["familyRouteGeometry"]>;
export type Drawing = { people: PositionedPerson[]; geometry: Geometry };
export const bodyBounds = (people: PositionedPerson[]) => ({
  left: Math.min(...people.map((person) => person.x - 130)),
  right: Math.max(...people.map((person) => person.x + 130)),
  top: Math.min(...people.map((person) => person.y - 32)),
  bottom: Math.max(...people.map((person) => parentPortY(person) + 32))
});
export const shiftDrawing = (drawing: Drawing, dx: number, dy: number): Drawing => {
  const move = (point: RoutePoint) => ({ x: point.x + dx, y: point.y + dy });
  const ports = (values: Record<string, RoutePoint>) => Object.fromEntries(Object.entries(values).map(([id, point]) => [id, move(point)]));
  return { people: drawing.people.map((person) => ({ ...person, ...move(person) })),
    geometry: Object.fromEntries(Object.entries(drawing.geometry).map(([id, family]) => [id, {
      parentPorts: ports(family.parentPorts), childPorts: ports(family.childPorts),
      segments: family.segments.map(({ start, end }) => ({ start: move(start), end: move(end) }))
    }])) };
};

/** Recorded parent sets sharing siblings form a loop even when their
 * descendant households form a forest. Stack those complete households and
 * give up to three disjoint parent sets separate rails and labeled sockets.
 * Isolated carers fit below ancestry rails, never inside a parent set. The grouping below
 * is placement-only: separate ports, paths, types and record IDs survive.
 * More complex reconnecting unions are left for the general layout, not cut.
 */
export function sharedAncestryCorridors(layout: TreeLayout): TreeLayout | undefined {
  const byId = new Map(layout.people.map((person) => [person.id, person]));
  if (!byId.size || byId.size !== layout.people.length || layout.relationships.some((edge) =>
    !byId.has(edge.fromPersonId) || !byId.has(edge.toPersonId) || edge.fromPersonId === edge.toPersonId)) return undefined;
  const allGroups = parentConnectionGroups(layout.relationships);
  const care = allGroups.filter((group) => group.care);
  const careByChild = new Map<string, typeof care[number]>();
  for (const group of care) {
    if (group.parentIds.length !== 1 || group.childIds.length !== 1 || careByChild.has(group.childIds[0])) return undefined;
    const carer = group.parentIds[0];
    if (layout.relationships.some((edge) => [edge.fromPersonId, edge.toPersonId].includes(carer) &&
        !group.relationships.some((record) => record.id === edge.id))) return undefined;
    careByChild.set(group.childIds[0], group);
  }
  const groups = allGroups.filter((group) => !group.care);
  // A final household can have a partner but no child yet. Keep that union
  // next to its recorded person instead of leaving a distant loose endpoint.
  const childless = layout.relationships.filter((edge) => edge.kind === "partner" && !groups.some((group) =>
    group.parentIds.includes(edge.fromPersonId) && group.parentIds.includes(edge.toPersonId)))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((edge) => ({
      id: `union:${edge.id}`, parentIds: [edge.fromPersonId, edge.toPersonId].sort(), childIds: [], relationships: [], care: undefined
    }));
  // A sibling's recorded adoption/foster history need not apply to every
  // sibling. Group overlapping child cohorts for placement, while leaving
  // each original group's child list, types and relationship IDs unchanged.
  const allHouseholds = [...groups, ...childless];
  const roots = allHouseholds.map((_, index) => index);
  const rootOf = (index: number): number => {
    if (roots[index] !== index) roots[index] = rootOf(roots[index]);
    return roots[index];
  };
  const childOwner = new Map<string, number>();
  allHouseholds.forEach((group, index) => group.childIds.forEach((id) => {
    const previous = childOwner.get(id);
    if (previous !== undefined) roots[rootOf(index)] = rootOf(previous);
    childOwner.set(id, index);
  }));
  const cohorts = new Map<number, typeof groups>();
  allHouseholds.forEach((group, index) => {
    const key = rootOf(index);
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key)!.push(group);
  });
  const blocks = [...cohorts.values()];
  const blockChildren = blocks.map((sets) => [...new Set(sets.flatMap((set) => set.childIds))].sort());
  if (!blocks.some((sets, index) => sets.length >= 2 && blockChildren[index].length > 1)) return undefined;
  const incoming = new Map<string, number>(), outgoing = new Map<string, number>();
  for (const [index, sets] of blocks.entries()) {
    const parents = sets.flatMap((set) => set.parentIds);
    if (sets.length > 3 || new Set(parents).size !== parents.length) return undefined;
    for (const id of parents) {
      if (outgoing.has(id)) return undefined;
      outgoing.set(id, index);
    }
    for (const id of blockChildren[index]) {
      if (incoming.has(id)) return undefined;
      incoming.set(id, index);
    }
  }
  // Related birth/adoptive parents can enter the same child cohort from one
  // origin household (for example two siblings). Place that cohort once,
  // then attach both recorded ancestry stems. Distinct origin households
  // still require the general reconnecting-family layout.
  if (blocks.some((sets) => new Set(sets.flatMap((set) => set.parentIds)
    .filter((id) => incoming.has(id)).map((id) => incoming.get(id))).size > 1)) return undefined;

  const visited = new Set<string>();
  const drawPerson = (id: string): Drawing | undefined => {
    let drawing: Drawing | undefined;
    if (outgoing.has(id)) drawing = drawBlock(outgoing.get(id)!);
    else {
      if (visited.has(id)) return undefined;
      visited.add(id); drawing = { people: [{ ...byId.get(id)!, x: 0, y: 0 }], geometry: {} };
    }
    if (!drawing) return undefined;
    // A joined cohort may have entered through just one of several related
    // parents. Preserve care records attached to the other entry people too.
    for (const child of [...drawing.people]) {
      const group = careByChild.get(child.id);
      if (!group) continue;
      const carerId = group.parentIds[0];
      if (drawing.people.some((person) => person.id === carerId)) continue;
      if (visited.has(carerId)) return undefined;
      visited.add(carerId);
      const carer = { ...byId.get(carerId)!, x: child.x - 360, y: child.y - 300 };
      const start = { x: carer.x, y: parentPortY(carer) }, end = { x: child.x - 28, y: child.y - Math.sqrt(32 ** 2 - 28 ** 2) };
      const railY = child.y - 96;
      drawing.people.push(carer);
      drawing.geometry[group.id] = { parentPorts: { [carerId]: start }, childPorts: { [child.id]: end }, segments: [
        { start, end: { x: start.x, y: railY } },
        { start: { x: start.x, y: railY }, end: { x: end.x, y: railY } }, { start: { x: end.x, y: railY }, end }
      ] };
    }
    return drawing;
  };
  const drawBlock = (blockId: number): Drawing | undefined => {
    let sets = blocks[blockId];
    let childIds = blockChildren[blockId];
    // The parent set connected to the preceding generation belongs on the
    // outside of a three-set household. Its arriving ancestry then stays
    // outside the other two joins, and its own first-child rail can pass
    // above them rather than cutting through their descending trunks.
    if (sets.length === 3) {
      const attached = sets.filter((set) => set.parentIds.some((id) => incoming.has(id)));
      if (attached.length === 2) {
        // Two related entry households flank the children. Putting the
        // second entry on the inner-left would send its incoming ancestry
        // through the outside household's first-child rail.
        sets = [...sets.filter((set) => !attached.includes(set)), attached[1], attached[0]];
      } else if (attached.length) sets = [...sets.filter((set) => set !== attached[0]), attached[0]];
    }
    if (sets.length > 1 && sets.some((set) => set.childIds.length !== childIds.length)) {
      // Shared children lead the block. Then finish the inner-left family's
      // exclusive branches before the outside rail continues to other children.
      // This order is based on recorded membership, not names or import IDs.
      const members = (id: string) => sets.filter((set) => set.childIds.includes(id)).length;
      const outer = (id: string) => Boolean(sets[2]?.childIds.includes(id));
      const first = [...childIds].sort((a, b) => members(b) - members(a) || Number(outer(b)) - Number(outer(a)) ||
        (a < b ? -1 : a > b ? 1 : 0))[0];
      const lane = (id: string) => !outer(id) ? 0 : sets[0].childIds.includes(id) ? 1 : 2;
      childIds = [first, ...childIds.filter((id) => id !== first).sort((a, b) => lane(a) - lane(b) ||
        (a < b ? -1 : a > b ? 1 : 0))];
    }
    const parentIds = sets.flatMap((set) => set.parentIds);
    const thirdParentY = -320;
    if (parentIds.some((id) => visited.has(id))) return undefined;
    parentIds.forEach((id) => visited.add(id));
    if (!childIds.length) return { people: parentIds.map((id, index) => ({ ...byId.get(id)!, x: index * 260, y: 0 })), geometry: {} };
    const typed = sets.length > 1 || sets.some((set) => set.relationships.some((edge) => edge.subtype !== "biologicalParent"));
    const terminalClearance = childIds.some((id) => careByChild.has(id)) ? 432 : typed ? 112 : 40;
    const joinY = Math.max(...parentIds.map((id) => parentPortY({ ...byId.get(id)!, y: 0 }))) + 32;
    const people: PositionedPerson[] = [], geometry: Geometry = {};
    let cursor = sets.length > 1 ? joinY + terminalClearance + 120 : 0;
    for (const id of childIds) {
      // Another child may be a parent of the same downstream cohort. Its
      // complete household is already present, not a duplicate person to draw.
      if (people.some((person) => person.id === id)) continue;
      const branch = drawPerson(id);
      if (!branch) return undefined;
      const bounds = bodyBounds(branch.people), root = branch.people.find((person) => person.id === id)!;
      const moved = sets.length > 1 ? shiftDrawing(branch, -root.x, cursor - bounds.top)
        : shiftDrawing(branch, cursor - bounds.left, joinY + terminalClearance + 120 - bounds.top);
      people.push(...moved.people); Object.assign(geometry, moved.geometry);
      cursor = sets.length > 1 ? bodyBounds(moved.people).bottom + terminalClearance + 160 : bodyBounds(moved.people).right + 160;
    }
    const childrenBounds = bodyBounds(people);
    const childXs = childIds.map((id) => people.find((person) => person.id === id)!.x);
    const centers = sets.length > 1 ? [childrenBounds.left - 160, childrenBounds.right + 160, childrenBounds.left - 620]
      : [childXs.reduce((sum, x) => sum + x, 0) / childXs.length];
    sets.forEach((set, index) => set.parentIds.forEach((id, position) => people.push({ ...byId.get(id)!,
      x: centers[index] + (position - (set.parentIds.length - 1) / 2) * 260, y: index === 2 ? thirdParentY : 0 })));
    const placed = new Map(people.map((person) => [person.id, person]));
    sets.forEach((set, index) => {
      const parentPorts = Object.fromEntries(set.parentIds.map((id) => {
        const person = placed.get(id)!;
        return [id, { x: person.x, y: parentPortY(person) }];
      }));
      const childPorts = Object.fromEntries(set.childIds.map((id) => {
        const person = placed.get(id)!, offset = sets.length > 1 ? (index === 2 ? (id === childIds[0] ? 0 : -24) : index ? 12 : -12) : 0;
        return [id, { x: person.x + offset, y: person.y - Math.sqrt(32 ** 2 - offset ** 2) }];
      }));
      const pp = Object.values(parentPorts), cp = Object.values(childPorts), trunkX = centers[index];
      const familyJoinY = joinY + (index === 2 ? thirdParentY : 0);
      const segments: RouteSegment[] = [
        ...pp.map((port) => ({ start: port, end: { x: port.x, y: familyJoinY } })),
        { start: { x: Math.min(...pp.map((port) => port.x)), y: familyJoinY }, end: { x: Math.max(...pp.map((port) => port.x)), y: familyJoinY } }
      ];
      if (sets.length > 1) {
        const clearance = terminalClearance - (index === 2 ? 48 : 0);
        segments.push({ start: { x: trunkX, y: familyJoinY }, end: { x: trunkX, y: Math.max(...cp.map((port) => port.y)) - clearance } });
        for (const [childIndex, port] of cp.entries()) {
          const railY = index === 2 && set.childIds[childIndex] === childIds[0] ? familyJoinY : port.y - clearance;
          segments.push({ start: { x: trunkX, y: railY }, end: { x: port.x, y: railY } }, { start: { x: port.x, y: railY }, end: port });
        }
      } else {
        const railY = Math.min(...cp.map((port) => port.y)) - terminalClearance;
        segments.push({ start: { x: trunkX, y: joinY }, end: { x: trunkX, y: railY } },
          { start: { x: Math.min(trunkX, ...cp.map((port) => port.x)), y: railY }, end: { x: Math.max(trunkX, ...cp.map((port) => port.x)), y: railY } },
          ...cp.map((port) => ({ start: { x: port.x, y: railY }, end: port })));
      }
      geometry[set.id] = { parentPorts, childPorts, segments: mergeCorridorSegments(segments) };
    });
    return { people, geometry };
  };
  const people: PositionedPerson[] = [], geometry: Geometry = {};
  let cursor = 0;
  for (const [index, sets] of blocks.entries()) {
    if (sets.some((set) => set.parentIds.some((id) => incoming.has(id)))) continue;
    const drawing = drawBlock(index);
    if (!drawing) return undefined;
    const bounds = bodyBounds(drawing.people), moved = shiftDrawing(drawing, cursor - bounds.left, -bounds.top);
    people.push(...moved.people); Object.assign(geometry, moved.geometry);
    cursor = bodyBounds(moved.people).right + 400;
  }
  // Do not lose isolated people. An unvisited connected person means a cycle
  // or unsupported reconnection, never permission to emit a partial tree.
  for (const person of [...layout.people].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) if (!visited.has(person.id)) {
    if (incoming.has(person.id) || outgoing.has(person.id)) return undefined;
    people.push({ ...person, x: cursor + 130, y: 32 }); cursor += 660;
  }
  const positions = new Map(people.map((person) => [person.id, person]));
  const bounds = bodyBounds(people);
  return { people: layout.people.map((person) => positions.get(person.id)!), relationships: layout.relationships,
    familyRouteGeometry: geometry, width: bounds.right, height: bounds.bottom };
}
