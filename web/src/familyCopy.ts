import type { FamilyRelationship, Person } from "./types";

export interface FocusedFamilySelection {
  people: Person[];
  relationships: FamilyRelationship[];
  excludedPeople: Person[];
}

const addToIndex = (index: Map<string, string[]>, from: string, to: string) => {
  const values = index.get(from) ?? [];
  values.push(to);
  index.set(from, values);
};

export function selectFocusedFamily(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  focusPersonId: string,
  excludedPersonIds: readonly string[] = []
): FocusedFamilySelection {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  if (!peopleById.has(focusPersonId)) {
    throw new Error("The focus person does not exist in this family tree.");
  }

  const excluded = new Set(excludedPersonIds.filter((id) => id !== focusPersonId));
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  const siblingsByPerson = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (!peopleById.has(relationship.fromPersonId) || !peopleById.has(relationship.toPersonId)) {
      continue;
    }
    if (relationship.kind === "parent") {
      addToIndex(parentsByChild, relationship.toPersonId, relationship.fromPersonId);
      addToIndex(childrenByParent, relationship.fromPersonId, relationship.toPersonId);
    } else if (relationship.kind === "sibling") {
      addToIndex(siblingsByPerson, relationship.fromPersonId, relationship.toPersonId);
      addToIndex(siblingsByPerson, relationship.toPersonId, relationship.fromPersonId);
    }
  }

  const familyIds = new Set([focusPersonId]);
  const ancestorQueue = [focusPersonId];
  for (let index = 0; index < ancestorQueue.length; index += 1) {
    for (const parentId of parentsByChild.get(ancestorQueue[index]) ?? []) {
      if (excluded.has(parentId) || familyIds.has(parentId)) continue;
      familyIds.add(parentId);
      ancestorQueue.push(parentId);
    }
  }

  // Every descendant of the focus lineage belongs to the focused family. Explicit
  // sibling links extend that lineage when parent records are incomplete.
  const familyQueue = [...familyIds];
  for (let index = 0; index < familyQueue.length; index += 1) {
    const nextIds = [
      ...(childrenByParent.get(familyQueue[index]) ?? []),
      ...(siblingsByPerson.get(familyQueue[index]) ?? [])
    ];
    for (const personId of nextIds) {
      if (excluded.has(personId) || familyIds.has(personId)) continue;
      familyIds.add(personId);
      familyQueue.push(personId);
    }
  }

  const retainedIds = new Set(familyIds);
  for (const relationship of relationships) {
    if (relationship.kind === "partner") {
      if (familyIds.has(relationship.fromPersonId) && !excluded.has(relationship.toPersonId)) {
        retainedIds.add(relationship.toPersonId);
      }
      if (familyIds.has(relationship.toPersonId) && !excluded.has(relationship.fromPersonId)) {
        retainedIds.add(relationship.fromPersonId);
      }
    } else if (
      relationship.kind === "parent" &&
      familyIds.has(relationship.toPersonId) &&
      !excluded.has(relationship.fromPersonId)
    ) {
      retainedIds.add(relationship.fromPersonId);
    }
  }

  const selectedPeople = people.filter((person) => retainedIds.has(person.id));
  return {
    people: selectedPeople,
    relationships: relationships.filter((relationship) =>
      retainedIds.has(relationship.fromPersonId) && retainedIds.has(relationship.toPersonId)
    ),
    excludedPeople: people.filter((person) => !retainedIds.has(person.id))
  };
}
