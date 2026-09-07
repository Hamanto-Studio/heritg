import { parentPortY, type RouteSegment } from "./connectionGeometry";
import { mergeCorridorSegments } from "./directedFamilyCorridors";
import { parentConnectionGroups } from "./parentConnections";
import { bodyBounds, shiftDrawing, type Drawing, type Geometry } from "./sharedAncestryCorridors";
import type { PositionedPerson, TreeLayout } from "./types";

type Family = ReturnType<typeof parentConnectionGroups>[number];
type Household = { id: string; parentIds: string[]; childIds: string[]; family?: Family };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Keep repeated marriages between two sibling families inside one corridor.
 * A household is only a placement unit: ancestry still attaches to each actual
 * child, and the recorded partner line still joins the two actual partners.
 * Source families with independent ancestry or partially overlapping ownership
 * are declined, never stripped from the resulting archive or drawing.
 */
export function linkedHouseholdCorridors(layout: TreeLayout): TreeLayout | undefined {
  const byId = new Map(layout.people.map((person) => [person.id, person]));
  if (!byId.size || byId.size !== layout.people.length || layout.relationships.some((edge) =>
    !byId.has(edge.fromPersonId) || !byId.has(edge.toPersonId) || edge.fromPersonId === edge.toPersonId)) return undefined;
  const families = parentConnectionGroups(layout.relationships);
  if (families.some((family) => family.care || family.parentIds.length > 2)) return undefined;
  const households: Household[] = families.map((family) => ({ ...family, family }));
  for (const edge of [...layout.relationships].sort((a, b) => compare(a.id, b.id))) {
    if (edge.kind !== "partner" || families.some((family) => family.parentIds.includes(edge.fromPersonId) && family.parentIds.includes(edge.toPersonId))) continue;
    households.push({ id: `union:${edge.id}`, parentIds: [edge.fromPersonId, edge.toPersonId].sort(compare), childIds: [] });
  }
  const home = new Map<string, Household>(), origin = new Map<string, Household>();
  for (const household of households) {
    for (const id of household.parentIds) {
      if (home.has(id)) return undefined;
      home.set(id, household);
    }
    for (const id of household.childIds) {
      if (origin.has(id)) return undefined;
      origin.set(id, household);
    }
  }
  for (const person of [...layout.people].sort((a, b) => compare(a.id, b.id))) if (!home.has(person.id)) {
    const household = { id: `person:${person.id}`, parentIds: [person.id], childIds: [] };
    home.set(person.id, household); households.push(household);
  }
  const children = new Map(households.map((household) => [household,
    [...new Set(household.childIds.map((id) => home.get(id)!))].sort((a, b) => compare(a.id, b.id))]));
  const sources = new Map(households.map((household) => [household,
    [...new Set(household.parentIds.map((id) => origin.get(id)).filter((value): value is Household => Boolean(value)))]]));
  // The branch with the wider recorded sibling group owns the placement;
  // gender, surnames and array order never decide which ancestry is primary.
  const owner = new Map(households.map((household) => [household, [...sources.get(household)!]
    .sort((a, b) => children.get(b)!.length - children.get(a)!.length || compare(a.id, b.id))[0]]));
  const companion = new Map<Household, Household>();
  for (const household of households) {
    const descendants = children.get(household)!;
    if (!descendants.length) continue;
    const owners = new Set(descendants.map((child) => owner.get(child)));
    if (owners.size === 1 && !owners.has(household)) {
      const destination = [...owners][0];
      if (!destination || sources.get(household)!.length) return undefined;
      companion.set(household, destination);
    }
  }
  if (!companion.size || ![...companion].some(([source]) => children.get(source)!.length > 1)) return undefined;
  for (const household of households) for (const source of sources.get(household)!) {
    if (source !== owner.get(household) && companion.get(source) !== owner.get(household)) return undefined;
  }
  const companions = new Map(households.map((household) => [household,
    [...companion].filter(([, destination]) => destination === household).map(([source]) => source).sort((a, b) => compare(a.id, b.id))]));

  const visited = new Set<Household>();
  const parentOrder = (household: Household) => [...household.parentIds].sort((a, b) =>
    Number(origin.get(a) !== owner.get(household)) - Number(origin.get(b) !== owner.get(household)) || compare(a, b));
  const paintParents = (household: Household, x: number, y = 0) => parentOrder(household).map((id, index, ids) => ({
    ...byId.get(id)!, x: x + (index - (ids.length - 1) / 2) * 260, y
  }));
  const routeFamily = (family: Family, people: PositionedPerson[], trunkX: number, joinY: number, outside: boolean, clearance: number): Geometry[string] => {
    const positions = new Map(people.map((person) => [person.id, person]));
    const parentPorts = Object.fromEntries(family.parentIds.map((id) => {
      const person = positions.get(id)!; return [id, { x: person.x, y: parentPortY(person) }];
    }));
    const childPorts = Object.fromEntries(family.childIds.map((id) => {
      const person = positions.get(id)!; return [id, { x: person.x, y: person.y - 32 }];
    }));
    const pp = Object.values(parentPorts), cp = Object.values(childPorts);
    const segments: RouteSegment[] = [...pp.map((port) => ({ start: port, end: { x: port.x, y: joinY } })),
      { start: { x: Math.min(...pp.map((port) => port.x)), y: joinY }, end: { x: Math.max(...pp.map((port) => port.x)), y: joinY } }];
    if (outside) {
      segments.push({ start: { x: trunkX, y: joinY }, end: { x: trunkX, y: Math.max(...cp.map((port) => port.y)) - clearance } });
      for (const port of cp) {
        const railY = port.y - clearance;
        segments.push({ start: { x: trunkX, y: railY }, end: { x: port.x, y: railY } }, { start: { x: port.x, y: railY }, end: port });
      }
    } else {
      const railY = Math.min(...cp.map((port) => port.y)) - clearance;
      segments.push({ start: { x: trunkX, y: joinY }, end: { x: trunkX, y: railY } },
        { start: { x: Math.min(trunkX, ...cp.map((port) => port.x)), y: railY }, end: { x: Math.max(trunkX, ...cp.map((port) => port.x)), y: railY } },
        ...cp.map((port) => ({ start: { x: port.x, y: railY }, end: port })));
    }
    return { parentPorts, childPorts, segments: mergeCorridorSegments(segments) };
  };
  const draw = (household: Household): Drawing | undefined => {
    if (visited.has(household)) return undefined;
    visited.add(household);
    if (!household.childIds.length) return { people: paintParents(household, 0), geometry: {} };
    const peers = companions.get(household)!;
    const regions: { source?: Household; units: Household[] }[] = peers.map((source) => ({ source, units: children.get(source)! }));
    const grouped = new Set(regions.flatMap((region) => region.units));
    regions.push(...children.get(household)!.filter((unit) => !grouped.has(unit)).map((unit) => ({ units: [unit] })));
    const people: PositionedPerson[] = [], geometry: Geometry = {};
    const joinY = Math.max(...household.parentIds.map((id) => parentPortY({ ...byId.get(id)!, y: 0 }))) + 32;
    const clearance = peers.length || household.family!.relationships.some((edge) => edge.subtype !== "biologicalParent") ? 112 : 40;
    let cursor = peers.length ? joinY + clearance + 120 : 0;
    for (const region of regions) {
      const local: Drawing = { people: [], geometry: {} };
      const localJoinY = region.source ? Math.max(...region.source.parentIds.map((id) => parentPortY({ ...byId.get(id)!, y: 0 }))) + 32 : 0;
      let localCursor = region.source ? localJoinY + clearance + 120 : 0;
      for (const unit of region.units) {
        const branch = draw(unit);
        if (!branch) return undefined;
        const anchorId = unit.parentIds.find((id) => origin.get(id) === household)!;
        const anchor = branch.people.find((person) => person.id === anchorId)!;
        const bounds = bodyBounds(branch.people);
        const moved = shiftDrawing(branch, -anchor.x, localCursor - bounds.top);
        local.people.push(...moved.people); Object.assign(local.geometry, moved.geometry);
        localCursor = bodyBounds(moved.people).bottom + clearance + 160;
      }
      if (region.source) {
        if (visited.has(region.source)) return undefined;
        visited.add(region.source);
        const railX = bodyBounds(local.people).right + 160;
        local.people.push(...paintParents(region.source, railX));
        local.geometry[region.source.id] = routeFamily(region.source.family!, local.people, railX, localJoinY, true, clearance);
      }
      const bounds = bodyBounds(local.people);
      const moved = peers.length ? shiftDrawing(local, 0, cursor - bounds.top)
        : shiftDrawing(local, cursor - bounds.left, joinY + clearance + 120 - bounds.top);
      people.push(...moved.people); Object.assign(geometry, moved.geometry);
      cursor = peers.length ? bodyBounds(moved.people).bottom + clearance + 160 : bodyBounds(moved.people).right + 160;
    }
    const centers = household.childIds.map((id) => people.find((person) => person.id === id)!.x);
    const trunkX = peers.length ? bodyBounds(people).left - 160 : centers.reduce((sum, x) => sum + x, 0) / centers.length;
    people.push(...paintParents(household, trunkX));
    geometry[household.id] = routeFamily(household.family!, people, trunkX, joinY, Boolean(peers.length), clearance);
    return { people, geometry };
  };
  const people: PositionedPerson[] = [], geometry: Geometry = {};
  let cursor = 0;
  for (const root of households.filter((unit) => !owner.get(unit) && !companion.has(unit)).sort((a, b) => compare(a.id, b.id))) {
    const drawing = draw(root);
    if (!drawing) return undefined;
    const bounds = bodyBounds(drawing.people), moved = shiftDrawing(drawing, cursor - bounds.left, -bounds.top);
    people.push(...moved.people); Object.assign(geometry, moved.geometry);
    cursor = bodyBounds(moved.people).right + 400;
  }
  const positions = new Map(people.map((person) => [person.id, person]));
  if (positions.size !== byId.size || people.length !== layout.people.length || visited.size !== households.length) return undefined;
  const bounds = bodyBounds(people);
  return { people: layout.people.map((person) => positions.get(person.id)!), relationships: layout.relationships,
    familyRouteGeometry: geometry, width: bounds.right, height: bounds.bottom };
}
