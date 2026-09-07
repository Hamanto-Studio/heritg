import { indonesianFamilyFixture } from "./indonesianFamilies";

/** Two unmarried, childless adults join different recorded ancestry depths.
 * Their recorded parent/care ancestry is disjoint. This is synthetic historical
 * graph coverage, not a prevalence claim or a marriage-eligibility validator;
 * other applicable marriage conditions are assumed to be satisfied. */
export function crossGenerationFamilyFixture(count: number, seed = 0) {
  const data = indonesianFamilyFixture(count, "compound", seed);
  const parentIds = new Map<string, string[]>(), unavailable = new Set<string>();
  for (const edge of data.relationships) {
    if (edge.kind === "parent") {
      if (!parentIds.has(edge.toPersonId)) parentIds.set(edge.toPersonId, []);
      parentIds.get(edge.toPersonId)!.push(edge.fromPersonId);
      unavailable.add(edge.fromPersonId);
    }
    if (edge.kind === "partner") { unavailable.add(edge.fromPersonId); unavailable.add(edge.toPersonId); }
  }
  const parents = (id: string) => parentIds.get(id) ?? [];
  const ancestors = new Map(data.people.map((person) => {
    const ids = new Set<string>(), queue = [...parents(person.id)];
    for (let i = 0; i < queue.length; i++) if (!ids.has(queue[i])) {
      ids.add(queue[i]); queue.push(...parents(queue[i]));
    }
    return [person.id, ids] as const;
  }));
  const depthCache = new Map<string, number>();
  const depth = (id: string): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const value = Math.max(-1, ...parents(id).map(depth)) + 1;
    depthCache.set(id, value); return value;
  };
  const available = data.people.filter((person) => !unavailable.has(person.id));
  const candidates = available.filter((person) => person.gender === "male").flatMap((husband) =>
    available.filter((person) => person.gender === "female").flatMap((wife) => {
      if (depth(husband.id) === depth(wife.id) || ancestors.get(husband.id)!.has(wife.id) ||
          ancestors.get(wife.id)!.has(husband.id) || [...ancestors.get(husband.id)!].some((id) => ancestors.get(wife.id)!.has(id))) return [];
      const year = Math.max(Number(husband.birthDate!.slice(0, 4)), Number(wife.birthDate!.slice(0, 4))) + 25;
      const marriageDate = `${year}-06-01`;
      if (year > 2026 || [husband, wife].some((person) => person.deathDate && person.deathDate <= marriageDate)) return [];
      return [{ husband, wife, marriageDate }];
    }));
  const pair = candidates[seed % candidates.length];
  if (!pair) throw new Error("This fixture has no eligible synthetic adult pair at different ancestry depths.");
  const marriage = { id: "synthetic-cross-depth-marriage", treeId: data.people[0].treeId,
    fromPersonId: pair.husband.id, toPersonId: pair.wife.id, kind: "partner" as const, subtype: "spouse" as const,
    marriageDate: pair.marriageDate, createdAt: "2026-01-01T00:00:00.000Z" };
  return { ...data, relationships: [...data.relationships, marriage],
    marriagePair: [pair.husband.id, pair.wife.id] as const, marriageId: marriage.id,
    ancestryDepths: [depth(pair.husband.id), depth(pair.wife.id)] as const };
}
