import { indonesianFamilyFixture } from "./indonesianFamilies";
import type { FamilyRelationship, Person } from "../types";

/** Synthetic kinship care: a birth father and an adoptive father have the same
 * recorded parents. Preserve both parent sets and all descendants. This is
 * historical relationship data, not an assertion about custody or eligibility. */
export function relatedParentSetsFixture(count: number, scenario: "shared-adoption" | "shared-parent-sets" = "shared-adoption", seed = 0) {
  if (count < 15) throw new Error("Related-parent-set fixtures need at least 15 people.");
  const data = indonesianFamilyFixture(count - 2, scenario, seed);
  const father = data.people[0];
  const children = new Set(data.relationships.filter((edge) => edge.fromPersonId === father.id && edge.subtype === "biologicalParent").map((edge) => edge.toPersonId));
  const adopterId = data.relationships.find((edge) => edge.subtype === "adoptiveParent" && children.has(edge.toPersonId) &&
    data.people.some((person) => person.id === edge.fromPersonId && person.gender === "male"))?.fromPersonId;
  const adopter = data.people.find((person) => person.id === adopterId);
  if (!adopter) throw new Error("Related-parent-set fixture has no adoptive household.");
  const birthYear = Number(father.birthDate!.slice(0, 4));
  const makeGrandparent = (id: string, displayName: string, gender: Person["gender"], year: number): Person => ({
    ...father, id, displayName, gender, birthDate: `${year}-01-01`, deathDate: `${year + 80}-01-01`
  });
  const grandparents = [makeGrandparent("synthetic-care-grandfather", "Sutrisno Pranoto", "male", birthYear - 28),
    makeGrandparent("synthetic-care-grandmother", "Sulastri Pranoto", "female", birthYear - 26)];
  const added: FamilyRelationship[] = grandparents.flatMap((parent) => [father, adopter].map((child) => ({
    id: `${parent.id}:${child.id}`, treeId: father.treeId, fromPersonId: parent.id, toPersonId: child.id,
    kind: "parent", subtype: "biologicalParent", createdAt: father.createdAt
  })));
  added.push({ id: "synthetic-care-grandparents-marriage", treeId: father.treeId, fromPersonId: grandparents[0].id,
    toPersonId: grandparents[1].id, kind: "partner", subtype: "spouse", marriageDate: `${birthYear - 2}-01-01`, createdAt: father.createdAt });
  return { ...data, people: [...data.people, ...grandparents], relationships: [...data.relationships, ...added],
    relatedParentIds: [father.id, adopter.id] as const, grandparentIds: grandparents.map((person) => person.id) };
}
