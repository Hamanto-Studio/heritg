import type { FamilyRelationship, Person } from "./types";

export interface BloodFamilyHighlight {
  personIds: ReadonlySet<string>;
  relationshipIds: ReadonlySet<string>;
}

const isBloodSibling = (relationship: FamilyRelationship) =>
  relationship.kind === "sibling" &&
  (relationship.subtype === "sibling" || relationship.subtype === "halfSibling");

export function deriveBloodFamilyHighlight(
  selectedPersonId: string | undefined,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): BloodFamilyHighlight {
  const validIds = new Set(people.map((person) => person.id));
  if (!selectedPersonId || !validIds.has(selectedPersonId)) {
    return { personIds: new Set(), relationshipIds: new Set() };
  }

  const biologicalParents = relationships.filter((relationship) =>
    relationship.kind === "parent" && relationship.subtype === "biologicalParent" &&
    validIds.has(relationship.fromPersonId) && validIds.has(relationship.toPersonId)
  );
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  biologicalParents.forEach((relationship) => {
    parentsByChild.set(relationship.toPersonId, [
      ...(parentsByChild.get(relationship.toPersonId) ?? []),
      relationship.fromPersonId
    ]);
    childrenByParent.set(relationship.fromPersonId, [
      ...(childrenByParent.get(relationship.fromPersonId) ?? []),
      relationship.toPersonId
    ]);
  });

  const lineageIds = new Set([selectedPersonId]);
  const visitAncestors = [selectedPersonId];
  while (visitAncestors.length) {
    const personId = visitAncestors.pop()!;
    for (const parentId of parentsByChild.get(personId) ?? []) {
      if (lineageIds.has(parentId)) continue;
      lineageIds.add(parentId);
      visitAncestors.push(parentId);
    }
  }

  const personIds = new Set(lineageIds);
  const descendantSeeds = new Set(lineageIds);
  relationships.filter(isBloodSibling).forEach((relationship) => {
    const fromLineage = lineageIds.has(relationship.fromPersonId);
    const toLineage = lineageIds.has(relationship.toPersonId);
    if (fromLineage === toLineage) return;
    descendantSeeds.add(fromLineage ? relationship.toPersonId : relationship.fromPersonId);
  });

  const visitDescendants = [...descendantSeeds];
  while (visitDescendants.length) {
    const personId = visitDescendants.pop()!;
    if (!validIds.has(personId)) continue;
    personIds.add(personId);
    for (const childId of childrenByParent.get(personId) ?? []) {
      if (personIds.has(childId)) continue;
      personIds.add(childId);
      visitDescendants.push(childId);
    }
  }

  const relationshipIds = new Set(relationships.filter((relationship) =>
    personIds.has(relationship.fromPersonId) && personIds.has(relationship.toPersonId) &&
    (relationship.kind === "parent" && relationship.subtype === "biologicalParent" ||
      isBloodSibling(relationship))
  ).map((relationship) => relationship.id));

  return { personIds, relationshipIds };
}
