import { deriveBirthOrders } from "./birthOrder";
import { compareChildOrder } from "./childOrder";
import type { FamilyRelationship, Person } from "./types";

export interface FamilyGroup {
  id: string;
  partners: string[];
  children: string[];
  relationship?: FamilyRelationship;
  partnerRelationships?: Record<string, FamilyRelationship>;
}

/** Read-only index. A person retains one identity across every family group. */
export function buildFamilyGroupIndex(people: Person[], relationships: FamilyRelationship[]) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const birthOrders = deriveBirthOrders(people, relationships);
  const compareChildren = (a: string, b: string) => {
    const left = byId.get(a)!;
    const right = byId.get(b)!;
    return compareChildOrder(left, right, birthOrders);
  };
  const compareNames = (a: string, b: string) =>
    byId.get(a)!.displayName.localeCompare(byId.get(b)!.displayName) || a.localeCompare(b);
  const edges = relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId) && edge.fromPersonId !== edge.toPersonId);
  const parents = new Map<string, Set<string>>();
  for (const edge of edges) if (edge.kind === "parent") {
    if (!parents.has(edge.toPersonId)) parents.set(edge.toPersonId, new Set());
    parents.get(edge.toPersonId)!.add(edge.fromPersonId);
  }
  const groups = new Map<string, FamilyGroup[]>();
  const families = new Map<string, { parents: string[]; children: string[] }>();
  for (const [child, ids] of parents) {
    const parentIds = [...ids].sort(compareNames);
    const key = JSON.stringify([...ids].sort());
    if (!families.has(key)) families.set(key, { parents: parentIds, children: [] });
    families.get(key)!.children.push(child);
  }
  const add = (owner: string, group: FamilyGroup) => {
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner)!.push(group);
  };
  const partnerEdges = edges.filter((edge) => edge.kind === "partner").sort((a, b) => a.id.localeCompare(b.id));
  const between = (owner: string, partner: string) => partnerEdges.find((edge) =>
    (edge.fromPersonId === owner && edge.toPersonId === partner) ||
    (edge.toPersonId === owner && edge.fromPersonId === partner));
  for (const [key, family] of families) for (const owner of family.parents) {
    const partners = family.parents.filter((id) => id !== owner);
    add(owner, { id: key, partners, children: family.children.sort(compareChildren),
      relationship: partners.length === 1 ? between(owner, partners[0]) : undefined,
      partnerRelationships: Object.fromEntries(partners.flatMap((id) => {
        const relationship = between(owner, id); return relationship ? [[id, relationship]] : [];
      })) });
  }
  for (const edge of partnerEdges) for (const [owner, partner] of [[edge.fromPersonId, edge.toPersonId], [edge.toPersonId, edge.fromPersonId]]) {
    if (!groups.get(owner)?.some((group) => group.partners.includes(partner))) {
      add(owner, { id: edge.id, partners: [partner], children: [], relationship: edge, partnerRelationships: { [partner]: edge } });
    }
  }
  for (const values of groups.values()) values.sort((a, b) =>
    (a.relationship?.marriageDate ?? "9999").localeCompare(b.relationship?.marriageDate ?? "9999") || a.id.localeCompare(b.id));

  return { byId, groups };
}
