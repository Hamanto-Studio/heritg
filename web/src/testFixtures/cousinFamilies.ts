import { indonesianFamilyFixture, type IndonesianFamilyScenario } from "./indonesianFamilies";

/** A synthetic adult-cousin union reconnects two recorded ancestry paths.
 * This is graph coverage, not a prevalence claim or a legal eligibility rule.
 * Both spouses are previously unmarried, with distinct recorded parents;
 * the scenario assumes other applicable marriage conditions are satisfied. */
export function cousinFamilyFixture(count: number, scenario: IndonesianFamilyScenario = "compound", seed = 0) {
  const data = indonesianFamilyFixture(count, scenario, seed);
  const parentIds = new Map<string, string[]>(), birthParentIds = new Map<string, string[]>(), partnered = new Set<string>();
  for (const edge of data.relationships) {
    if (edge.kind === "parent") {
      if (!parentIds.has(edge.toPersonId)) parentIds.set(edge.toPersonId, []);
      parentIds.get(edge.toPersonId)!.push(edge.fromPersonId);
      if (edge.subtype === "biologicalParent") {
        if (!birthParentIds.has(edge.toPersonId)) birthParentIds.set(edge.toPersonId, []);
        birthParentIds.get(edge.toPersonId)!.push(edge.fromPersonId);
      }
    }
    if (edge.kind === "partner") { partnered.add(edge.fromPersonId); partnered.add(edge.toPersonId); }
  }
  const parents = (id: string) => parentIds.get(id) ?? [];
  const birthParents = (id: string) => birthParentIds.get(id) ?? [];
  const grandparents = new Map(data.people.map((person) => [person.id, new Set(birthParents(person.id).flatMap(birthParents))]));
  const ancestryCache = new Map<string, Set<string>>();
  const ancestry = (id: string) => {
    if (ancestryCache.has(id)) return ancestryCache.get(id)!;
    const seen = new Set<string>(), queue = [...parents(id)];
    for (let i = 0; i < queue.length; i++) if (!seen.has(queue[i])) {
      seen.add(queue[i]); queue.push(...parents(queue[i]));
    }
    ancestryCache.set(id, seen);
    return seen;
  };
  const unmarried = data.people.filter((person) => !partnered.has(person.id));
  const candidates = unmarried.filter((person) => person.gender === "male").flatMap((husband) =>
    unmarried.filter((person) => person.gender === "female").flatMap((wife) => {
      if (parents(husband.id).some((id) => parents(wife.id).includes(id)) ||
          ![...grandparents.get(husband.id)!].some((id) => grandparents.get(wife.id)!.has(id)) ||
          ancestry(husband.id).has(wife.id) || ancestry(wife.id).has(husband.id)) return [];
      const year = Math.max(Number(husband.birthDate!.slice(0, 4)), Number(wife.birthDate!.slice(0, 4))) + 25;
      const marriageDate = `${year}-06-01`;
      if (year > 2026 || [husband, wife].some((person) => person.deathDate && person.deathDate <= marriageDate)) return [];
      return [{ husband, wife, marriageDate }];
    }));
  const pair = candidates[seed % candidates.length];
  if (!pair) throw new Error("This fixture has no eligible synthetic adult cousin pair.");
  const marriage = { id: "synthetic-cousin-marriage", treeId: data.people[0].treeId,
    fromPersonId: pair.husband.id, toPersonId: pair.wife.id, kind: "partner" as const, subtype: "spouse" as const,
    marriageDate: pair.marriageDate, createdAt: "2026-01-01T00:00:00.000Z" };
  return { ...data, relationships: [...data.relationships, marriage],
    cousinPair: [pair.husband.id, pair.wife.id] as const, marriageId: marriage.id };
}
