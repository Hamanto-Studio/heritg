import type { FamilyRelationship, PositionedPerson } from "./types";
import { parentConnectionGroups } from "./parentConnections";

export const FAMILY_ROUTE_LANE_SPACING = 32;
export { stableFamilyId } from "./parentConnections";
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Share lane reservations between placement and routing. Child rails need
 * their own lanes: a guardian/step-parent or a joined marriage can legitimately
 * make their horizontal spans overlap even after household ordering.
 */
export function familyRouteLanes(people: readonly PositionedPerson[], relationships: readonly FamilyRelationship[], railLevels: Readonly<Record<string, number>> = {}) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const groups = parentConnectionGroups(relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId)))
    .filter((group) => group.parentIds.every((parent) => group.childIds.every((child) => byId.get(parent)!.y < byId.get(child)!.y)));
  // A typed child branch needs room beside its own terminal, not just beside
  // the shared sibling rail. Two parent sets can otherwise leave all lines
  // connected while squeezing a biological/adoptive label out of the drawing.
  const ancestryCount = new Map<string, number>(), connectionCount = new Map<string, number>();
  for (const group of groups) for (const child of group.childIds) {
    connectionCount.set(child, (connectionCount.get(child) ?? 0) + 1);
    if (!group.care) ancestryCount.set(child, (ancestryCount.get(child) ?? 0) + 1);
  }
  const childClearances = new Map(groups.map((group) => {
    const typed = !group.care && (group.relationships.some((edge) => edge.subtype !== "biologicalParent") ||
      group.childIds.some((id) => ancestryCount.get(id)! > 1));
    // A third recorded parent set needs another readable annotation row;
    // care connections consume space too, but are never merged into that set.
    const crowded = Math.max(2, ...group.childIds.map((id) => connectionCount.get(id)!));
    return [group.id, typed ? 88 + (crowded - 2) * 48 : 40];
  }));
  const families = groups.map(({ id, parentIds, childIds }) => ({ id,
    parents: parentIds.map((id) => byId.get(id)!), children: childIds.map((id) => byId.get(id)!)
  })).map(({ id, parents, children }) => ({
    id, parents, children, parentBand: parents.reduce((sum, person) => sum + person.y, 0) / parents.length,
    parentLaneIndex: 0, parentLaneCount: 1, childLaneIndex: 0,
    childStemClearance: childClearances.get(id)!
  }));
  const assign = (intervals: { id: string; lower: number; upper: number; orderLower?: number; orderIndex?: number }[]) => {
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    for (const { id, lower, upper } of intervals.sort((a, b) => (a.orderLower ?? a.lower) - (b.orderLower ?? b.lower) ||
      (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.lower - b.lower || a.upper - b.upper || compare(a.id, b.id))) {
      const free = ends.findIndex((end) => end + 20 < lower);
      const lane = free === -1 ? ends.length : free;
      ends[lane] = upper; lanes.set(id, lane);
    }
    return { lanes, count: ends.length };
  };
  for (const band of new Set(families.map((family) => family.parentBand))) {
    const values = families.filter((family) => family.parentBand === band);
    const intervals = values.map((family) => {
      const xs = [...family.parents, ...family.children].map((person) => person.x);
      return { id: family.id, lower: Math.min(...xs), upper: Math.max(...xs) };
    });
    // Separate parent sets can converge on the same child. Route the central
    // household first, then the outer sets: left-to-right lanes otherwise
    // send an outer trunk through the central parents' U-shaped connector.
    // Only disjoint sets qualify; a shared parent's nested unions need a
    // different port ordering and must not be silently treated as this case.
    const converging = new Map<string, typeof values>();
    for (const family of values) {
      const key = JSON.stringify(family.children.map((person) => person.id).sort(compare));
      if (!converging.has(key)) converging.set(key, []);
      converging.get(key)!.push(family);
    }
    const ordering = new Map<string, { orderLower: number; orderIndex: number }>();
    for (const sets of converging.values()) {
      if (sets.length < 2) continue;
      const parentIds = sets.flatMap((family) => family.parents.map((person) => person.id));
      if (new Set(parentIds).size !== parentIds.length) continue;
      const ids = new Set(sets.map((family) => family.id));
      const orderLower = Math.min(...intervals.filter((interval) => ids.has(interval.id)).map((interval) => interval.lower));
      const distance = (family: typeof values[number]) => Math.abs(
        family.parents.reduce((sum, person) => sum + person.x, 0) / family.parents.length -
        family.children.reduce((sum, person) => sum + person.x, 0) / family.children.length);
      sets.sort((a, b) => distance(a) - distance(b) || compare(a.id, b.id))
        .forEach((family, orderIndex) => ordering.set(family.id, { orderLower, orderIndex }));
    }
    const { lanes, count } = assign(intervals.map((interval) => ({ ...interval, ...ordering.get(interval.id) })));
    for (const family of values) { family.parentLaneIndex = lanes.get(family.id)!; family.parentLaneCount = count; }
  }
  const railBand = (id: string, y: number) => `${y}:${railLevels[id] ?? "default"}`;
  for (const band of new Set(families.flatMap((family) => family.children.map((child) => railBand(family.id, child.y))))) {
    const values = families.filter((family) => family.children.some((child) => railBand(family.id, child.y) === band));
    const intervals = values.map((family) => {
      const xs = family.children.filter((child) => railBand(family.id, child.y) === band).map((child) => child.x);
      return { id: family.id, lower: Math.min(...xs), upper: Math.max(...xs) };
    });
    const cohorts = new Map<string, typeof values>();
    for (const family of values) {
      if (groups.find((group) => group.id === family.id)!.care) continue;
      const key = JSON.stringify(family.children.map((child) => child.id).sort(compare));
      if (!cohorts.has(key)) cohorts.set(key, []);
      cohorts.get(key)!.push(family);
    }
    const ordering = new Map<string, { orderLower: number; orderIndex: number }>();
    for (const cohort of cohorts.values()) if (cohort.length > 2) {
      const ids = new Set(cohort.map((family) => family.id));
      const orderLower = Math.min(...intervals.filter((interval) => ids.has(interval.id)).map((interval) => interval.lower));
      const hasBirth = (id: string) => groups.find((group) => group.id === id)!.relationships.some((edge) => edge.subtype === "biologicalParent");
      // Birth uses the central avatar socket. With lines on both sides, its
      // label must have room above the outer stems, not be trapped between them.
      cohort.sort((a, b) => Number(hasBirth(a.id)) - Number(hasBirth(b.id)) || compare(a.id, b.id))
        .forEach((family, orderIndex) => ordering.set(family.id, { orderLower, orderIndex }));
    }
    const { lanes } = assign(intervals.map((interval) => ({ ...interval, ...ordering.get(interval.id) })));
    for (const family of values) family.childLaneIndex = Math.max(family.childLaneIndex, lanes.get(family.id)!);
  }
  return families;
}
