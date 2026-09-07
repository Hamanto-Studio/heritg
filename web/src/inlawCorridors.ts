import { parentConnectionGroups } from "./parentConnections";
import { parentPortY } from "./connectionGeometry";
import type { FamilyRelationship, PositionedPerson } from "./types";

/** Independent in-law parents can sit inside the generation gap, below the
 * main sibling rail. Keeping every ancestor on one physical row forces the
 * spouse's incoming stem to cross that rail. Logical generations do not change.
 * Only isolated, single-child ancestral couples qualify; connected ancestry
 * keeps the general DAG layout until it has a safe corridor of its own.
 */
export function independentInlawGroups(people: readonly PositionedPerson[], relationships: readonly FamilyRelationship[]) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const edges = relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId));
  const groups = parentConnectionGroups(edges);
  return groups.filter((group) => {
    if (group.care || group.parentIds.length !== 2 || group.childIds.length !== 1) return false;
    const parents = new Set(group.parentIds), child = byId.get(group.childIds[0])!;
    if (!edges.some((edge) => edge.kind === "partner" && parents.has(edge.fromPersonId) && parents.has(edge.toPersonId))) return false;
    if (edges.some((edge) => (parents.has(edge.fromPersonId) || parents.has(edge.toPersonId)) &&
      !(edge.kind === "partner" && parents.has(edge.fromPersonId) && parents.has(edge.toPersonId)) &&
      !(edge.kind === "parent" && parents.has(edge.fromPersonId) && edge.toPersonId === child.id))) return false;
    const partners = new Set(edges.filter((edge) => edge.kind === "partner" && [edge.fromPersonId, edge.toPersonId].includes(child.id))
      .flatMap((edge) => [edge.fromPersonId, edge.toPersonId]).filter((id) => id !== child.id));
    return groups.some((family) => !family.care && family.childIds.length > 1 && family.childIds.some((id) => partners.has(id))) &&
      group.parentIds.every((id) => byId.get(id)!.generation < child.generation);
  });
}

export function insetInlawAncestors(people: PositionedPerson[], relationships: readonly FamilyRelationship[], spacing: number) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const edges = relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId));
  const groups = parentConnectionGroups(edges);
  const insetCenters = new Map<string, number>();
  const eligible = independentInlawGroups(people, edges).filter((group) => {
    const child = byId.get(group.childIds[0])!;
    // The compact interactive tree also reserves add/edit controls. Keep
    // those sockets clear: otherwise a visually empty column forces a detour
    // that appears only in the browser, not the read-only export.
    const columns = groups.filter((family) => family.id !== group.id).flatMap((family) => family.childIds)
      .map((id) => byId.get(id)!).filter((other) => other.y === child.y && other.id !== child.id);
    const offset = [0, -32, 32, -64, 64].find((offset) => columns.every((other) => Math.abs(other.x - child.x - offset) > spacing / 2 + 148));
    if (offset === undefined) return false;
    insetCenters.set(group.id, child.x + offset);
    return true;
  });
  const candidates: typeof eligible = [];
  for (const group of eligible) {
    const child = byId.get(group.childIds[0])!;
    if (candidates.some((other) => {
      const neighbor = byId.get(other.childIds[0])!;
      return neighbor.y === child.y && Math.abs(insetCenters.get(other.id)! - insetCenters.get(group.id)!) < spacing + 296;
    })) continue;
    candidates.push(group);
  }
  const railY: Record<string, number> = {};
  if (!candidates.length) return railY;
  const candidateIds = new Set(candidates.map((group) => group.id));
  const originalY = new Map(people.map((person) => [person.id, person.y]));
  const bands = [...new Set(candidates.map((group) => originalY.get(group.childIds[0])!))].sort((a, b) => a - b);
  for (const band of bands) {
    const inset = candidates.filter((group) => originalY.get(group.childIds[0]) === band);
    const childY = byId.get(inset[0].childIds[0])!.y;
    const depth = Math.max(260, ...inset.flatMap((group) => group.parentIds.map((id) => {
      const parent = byId.get(id)!;
      return parentPortY({ ...parent, role: " " }) - parent.y + 142;
    })));
    // Insert space, rather than changing a person's generation or squeezing
    // the existing routes. Later rows move together, preserving their order.
    for (const person of people) if (originalY.get(person.id)! >= band) person.y += depth;
    for (const group of inset) {
      const parents = group.parentIds.map((id) => byId.get(id)!).sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
      parents.forEach((parent, index) => { parent.x = insetCenters.get(group.id)! + (index - .5) * spacing; parent.y = childY; });
    }
    for (const group of groups) if (!candidateIds.has(group.id) && group.childIds.every((id) => originalY.get(id) === band)) {
      railY[group.id] = childY - 72;
    }
  }
  return railY;
}
