import type { FamilyRelationship, Person } from "./types";

export interface FamilyFocus {
  personId: string;
  ancestors: number;
  descendants: number;
  siblings?: boolean;
}

export function sharedParentSiblingIds(people: Person[], relationships: FamilyRelationship[], personId: string) {
  const valid = new Set(people.map((person) => person.id));
  if (!valid.has(personId)) return new Set<string>();
  const edges = relationships.filter((edge) => edge.kind === "parent" && valid.has(edge.fromPersonId) && valid.has(edge.toPersonId));
  const parents = new Set(edges.filter((edge) => edge.toPersonId === personId).map((edge) => edge.fromPersonId));
  return new Set(edges.filter((edge) => parents.has(edge.fromPersonId) && edge.toPersonId !== personId).map((edge) => edge.toPersonId));
}

/** A viewing window only: never pass this subset to archive or sharing code. */
export function focusedFamily(people: Person[], relationships: FamilyRelationship[], focus?: FamilyFocus) {
  if (!focus || !people.some((person) => person.id === focus.personId)) return { people, relationships };
  const valid = new Set(people.map((person) => person.id));
  const edges = relationships.filter((edge) => valid.has(edge.fromPersonId) && valid.has(edge.toPersonId));
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const partners = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, from: string, to: string) => {
    if (!map.has(from)) map.set(from, new Set());
    map.get(from)!.add(to);
  };
  for (const edge of edges) {
    if (edge.kind === "parent") {
      add(parents, edge.toPersonId, edge.fromPersonId);
      add(children, edge.fromPersonId, edge.toPersonId);
    } else if (edge.kind === "partner") {
      add(partners, edge.fromPersonId, edge.toPersonId);
      add(partners, edge.toPersonId, edge.fromPersonId);
    }
  }
  const visible = new Set([focus.personId, ...partners.get(focus.personId) ?? []]);
  const walk = (map: Map<string, Set<string>>, depth: number) => {
    let frontier = new Set([focus.personId]);
    const visited = new Set(frontier);
    for (let level = 0; level < depth && frontier.size; level++) {
      const next = new Set<string>();
      for (const id of frontier) for (const relative of map.get(id) ?? []) {
        visible.add(relative);
        if (!visited.has(relative)) { visited.add(relative); next.add(relative); }
      }
      frontier = next;
    }
  };
  walk(parents, focus.ancestors);
  walk(children, focus.descendants);
  if (focus.siblings) {
    for (const sibling of sharedParentSiblingIds(people, edges, focus.personId)) visible.add(sibling);
  }
  // Include co-parents for the focus person's children, even without a partner
  // edge. Do not pull in their unrelated children or extended family.
  if (focus.descendants > 0) for (const child of children.get(focus.personId) ?? []) {
    for (const parent of parents.get(child) ?? []) visible.add(parent);
  }
  return {
    people: people.filter((person) => visible.has(person.id)),
    relationships: edges.filter((edge) => visible.has(edge.fromPersonId) && visible.has(edge.toPersonId))
  };
}

export function defaultFamilyFocus(people: Person[], relationships: FamilyRelationship[]) {
  const parentIds = new Set(relationships.filter((edge) => edge.kind === "parent").map((edge) => edge.fromPersonId));
  const childIds = new Set(relationships.filter((edge) => edge.kind === "parent").map((edge) => edge.toPersonId));
  // Start within a branch, not above every branch of a broad descendant tree.
  return [...people].sort((a, b) => {
    const rank = (person: Person) => parentIds.has(person.id) ? (childIds.has(person.id) ? 0 : 1) : 2;
    return rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  })[0]?.id;
}

export function nextFamilyExpansion(people: Person[], relationships: FamilyRelationship[], focus: FamilyFocus, direction: "ancestors" | "descendants") {
  const adjacent = new Map<string, string[]>();
  for (const edge of relationships) {
    if (edge.kind !== "parent") continue;
    const from = direction === "ancestors" ? edge.toPersonId : edge.fromPersonId;
    const to = direction === "ancestors" ? edge.fromPersonId : edge.toPersonId;
    adjacent.set(from, [...adjacent.get(from) ?? [], to]);
  }
  const queue = [{ id: focus.personId, depth: 0 }];
  const visited = new Set([focus.personId]);
  let maximum = 0;
  for (let index = 0; index < queue.length; index++) {
    const { id, depth } = queue[index];
    maximum = Math.max(maximum, depth);
    for (const next of adjacent.get(id) ?? []) if (!visited.has(next)) {
      visited.add(next);
      queue.push({ id: next, depth: depth + 1 });
    }
  }
  const currentCount = focusedFamily(people, relationships, focus).people.length;
  for (let depth = focus[direction] + 1; depth <= maximum; depth++) {
    const candidate = { ...focus, [direction]: depth };
    if (focusedFamily(people, relationships, candidate).people.length > currentCount) return candidate;
  }
  return undefined;
}
