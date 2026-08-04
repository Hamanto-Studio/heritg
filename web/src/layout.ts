import { deriveKinshipLabels } from "./kinship";
import type {
  AppData,
  FamilyRelationship,
  GenerationLimits,
  Person,
  PositionedPerson,
  TreeLayout
} from "./types";
export const LAYOUT_METRICS = {
  avatarDiameter: 64, avatarRadius: 32, innerAvatarDiameter: 54,
  labelWidth: 190, labelTop: 42, nameHeight: 20,
  roleTop: 64, roleHeight: 18,
  lifeTop: 84, lifeHeight: 16,
  nodeBottom: 100, parentPortWithoutLife: 84,
  horizontalSpacing: 260, generationSpacing: 260
} as const;
export interface LayoutBounds {
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}
export interface DeterministicTreeLayout extends TreeLayout {
  bounds: LayoutBounds;
}
export interface FilteredFamily {
  people: Person[];
  relationships: FamilyRelationship[];
}
export interface AvailableGenerationLevels {
  ancestors: number;
  descendants: number;
}
const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const comparePeople = (left: Person, right: Person) => {
  const leftBirth = left.birthDate ?? "\uffff";
  const rightBirth = right.birthDate ?? "\uffff";
  const genderOrder = { male: 0, female: 1, unspecified: 2 } as const;
  return (
    compareText(leftBirth, rightBirth) ||
    genderOrder[left.gender] - genderOrder[right.gender] ||
    compareText(left.displayName.toLowerCase(), right.displayName.toLowerCase()) ||
    compareText(left.displayName, right.displayName) ||
    compareText(left.id, right.id)
  );
};
const compareRelationships = (
  left: FamilyRelationship,
  right: FamilyRelationship
) => {
  const kindOrder = { parent: 0, partner: 1, sibling: 2 } as const;
  return (
    kindOrder[left.kind] - kindOrder[right.kind] ||
    compareText(left.fromPersonId, right.fromPersonId) ||
    compareText(left.toPersonId, right.toPersonId) ||
    compareText(left.subtype, right.subtype) ||
    compareText(left.id, right.id)
  );
};
const normalizedPeople = (people: readonly Person[]) => {
  const seen = new Set<string>();
  return [...people]
    .filter((person) => person.id.trim().length > 0)
    .sort(comparePeople)
    .filter((person) => !seen.has(person.id) && Boolean(seen.add(person.id)));
};
const normalizedRelationships = (
  relationships: readonly FamilyRelationship[],
  validIds: ReadonlySet<string>
) => {
  const seen = new Set<string>();
  return [...relationships]
    .filter(
      (relationship) =>
        relationship.id.trim().length > 0 &&
        relationship.fromPersonId !== relationship.toPersonId &&
        validIds.has(relationship.fromPersonId) &&
        validIds.has(relationship.toPersonId)
    )
    .sort(compareRelationships)
    .filter(
      (relationship) =>
        !seen.has(relationship.id) && Boolean(seen.add(relationship.id))
    );
};
class StableGroups {
  private readonly parents = new Map<string, string>();
  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parents.set(id, id);
  }

  find(id: string): string {
    const parent = this.parents.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parents.set(id, root);
    return root;
  }

  union(firstId: string, secondId: string) {
    const firstRoot = this.find(firstId);
    const secondRoot = this.find(secondId);
    if (firstRoot === secondRoot) return;
    const [root, child] = [firstRoot, secondRoot].sort(compareText);
    this.parents.set(child, root);
  }
  values() {
    const values = new Map<string, string[]>();
    for (const id of [...this.parents.keys()].sort(compareText)) {
      const root = this.find(id);
      const members = values.get(root) ?? [];
      members.push(id);
      values.set(root, members);
    }
    return values;
  }
}
const buildGenerationMap = (
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
) => {
  const ids = people.map((person) => person.id);
  const groups = new StableGroups(ids);

  for (const relationship of relationships) {
    if (relationship.kind !== "parent") {
      groups.union(relationship.fromPersonId, relationship.toPersonId);
    }
  }
  const parentsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== "parent") continue;
    const parents = parentsByChild.get(relationship.toPersonId) ?? [];
    parents.push(relationship.fromPersonId);
    parentsByChild.set(relationship.toPersonId, parents);
  }
  for (const parents of parentsByChild.values()) {
    const ordered = [...new Set(parents)].sort(compareText);
    for (let index = 1; index < ordered.length; index += 1) {
      groups.union(ordered[0], ordered[index]);
    }
  }

  const components = groups.values();
  const outgoing = new Map<string, Set<string>>();
  const indegrees = new Map([...components.keys()].map((id) => [id, 0]));
  for (const relationship of relationships) {
    if (relationship.kind !== "parent") continue;
    const from = groups.find(relationship.fromPersonId);
    const to = groups.find(relationship.toPersonId);
    if (from === to) continue;
    const children = outgoing.get(from) ?? new Set<string>();
    if (!children.has(to)) {
      children.add(to);
      outgoing.set(from, children);
      indegrees.set(to, (indegrees.get(to) ?? 0) + 1);
    }
  }

  const levels = new Map([...components.keys()].map((id) => [id, 0]));
  const queue = [...components.keys()]
    .filter((id) => indegrees.get(id) === 0)
    .sort(compareText);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const children = [...(outgoing.get(current) ?? [])].sort(compareText);
    for (const child of children) {
      levels.set(child, Math.max(levels.get(child) ?? 0, (levels.get(current) ?? 0) + 1));
      indegrees.set(child, (indegrees.get(child) ?? 1) - 1);
      if (indegrees.get(child) === 0) {
        queue.push(child);
        queue.splice(index + 1, queue.length - index - 1, ...queue.slice(index + 1).sort(compareText));
      }
    }
  }

  return new Map(ids.map((id) => [id, levels.get(groups.find(id)) ?? 0]));
};
export function getGenerationMap(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): Record<string, number> {
  const orderedPeople = normalizedPeople(people);
  const ids = new Set(orderedPeople.map((person) => person.id));
  return Object.fromEntries(
    buildGenerationMap(orderedPeople, normalizedRelationships(relationships, ids))
  );
}
interface Adjacency {
  all: Map<string, string[]>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
}
const buildAdjacency = (
  validIds: ReadonlySet<string>,
  relationships: readonly FamilyRelationship[]
): Adjacency => {
  const all = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, from: string, to: string) => {
    const values = map.get(from) ?? new Set<string>();
    values.add(to);
    map.set(from, values);
  };
  for (const relationship of relationships) {
    const from = relationship.fromPersonId;
    const to = relationship.toPersonId;
    if (!validIds.has(from) || !validIds.has(to) || from === to) continue;
    add(all, from, to);
    add(all, to, from);
    if (relationship.kind === "parent") {
      add(parents, to, from);
      add(children, from, to);
    }
  }
  const sorted = (map: Map<string, Set<string>>) =>
    new Map([...map].map(([id, values]) => [id, [...values].sort(compareText)]));
  return { all: sorted(all), parents: sorted(parents), children: sorted(children) };
};
const distances = (startId: string, adjacent: Map<string, string[]>) => {
  const result = new Map<string, number>();
  const queue: Array<[string, number]> = [[startId, 0]];
  for (let index = 0; index < queue.length; index += 1) {
    const [id, distance] = queue[index];
    for (const nextId of adjacent.get(id) ?? []) {
      if (nextId === startId || result.has(nextId)) continue;
      result.set(nextId, distance + 1);
      queue.push([nextId, distance + 1]);
    }
  }
  return result;
};
const relativeGenerationLevels = (
  selectedPersonId: string | undefined,
  validIds: ReadonlySet<string>,
  relationships: readonly FamilyRelationship[],
  generations: ReadonlyMap<string, number>
) => {
  if (!selectedPersonId || !validIds.has(selectedPersonId)) return undefined;
  const selectedGeneration = generations.get(selectedPersonId);
  if (selectedGeneration === undefined) return undefined;
  const adjacent = buildAdjacency(validIds, relationships);
  const connectedDistances = distances(selectedPersonId, adjacent.all);
  const ancestors = distances(selectedPersonId, adjacent.parents);
  const descendants = distances(selectedPersonId, adjacent.children);
  const connectedIds = [selectedPersonId, ...connectedDistances.keys()].sort(compareText);
  return new Map(
    connectedIds.map((id) => {
      const up = ancestors.get(id);
      const down = descendants.get(id);
      const fallback = (generations.get(id) ?? selectedGeneration) - selectedGeneration;
      if (up !== undefined && (down === undefined || up < down)) return [id, -up];
      if (down !== undefined && (up === undefined || down < up)) return [id, down];
      if (up !== undefined && down !== undefined) return [id, fallback < 0 ? -up : down];
      return [id, fallback];
    })
  );
};

const visibleIds = (
  selectedPersonId: string | undefined,
  validIds: ReadonlySet<string>,
  relationships: readonly FamilyRelationship[],
  generations: ReadonlyMap<string, number>,
  limits: GenerationLimits
) => {
  if (limits.ancestors === null && limits.descendants === null) return new Set(validIds);
  const relative = relativeGenerationLevels(
    selectedPersonId,
    validIds,
    relationships,
    generations
  );
  if (!relative) return new Set(validIds);
  return new Set(
    [...relative]
      .filter(([, level]) => {
        if (level < 0 && limits.ancestors !== null) {
          return -level <= Math.max(0, limits.ancestors);
        }
        if (level > 0 && limits.descendants !== null) {
          return level <= Math.max(0, limits.descendants);
        }
        return true;
      })
      .map(([id]) => id)
  );
};

export function availableGenerationLevels(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  selectedPersonId?: string
): AvailableGenerationLevels {
  const orderedPeople = normalizedPeople(people);
  const validIds = new Set(orderedPeople.map((person) => person.id));
  const orderedRelationships = normalizedRelationships(relationships, validIds);
  const relative = relativeGenerationLevels(
    selectedPersonId,
    validIds,
    orderedRelationships,
    buildGenerationMap(orderedPeople, orderedRelationships)
  );
  if (!relative) return { ancestors: 0, descendants: 0 };
  const levels = [...relative.values()];
  return {
    ancestors: Math.max(0, -(Math.min(...levels) || 0)),
    descendants: Math.max(0, Math.max(...levels) || 0)
  };
}

export function filterByGeneration(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  selectedPersonId: string | undefined,
  limits: GenerationLimits
): FilteredFamily {
  const orderedPeople = normalizedPeople(people);
  const validIds = new Set(orderedPeople.map((person) => person.id));
  const orderedRelationships = normalizedRelationships(relationships, validIds);
  const visible = visibleIds(
    selectedPersonId,
    validIds,
    orderedRelationships,
    buildGenerationMap(orderedPeople, orderedRelationships),
    limits
  );
  return {
    people: orderedPeople.filter((person) => visible.has(person.id)),
    relationships: orderedRelationships.filter(
      (relationship) =>
        visible.has(relationship.fromPersonId) && visible.has(relationship.toPersonId)
    )
  };
}

const orderRow = (
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  positioned: ReadonlyMap<string, PositionedPerson>
) => {
  const rowIds = new Set(people.map((person) => person.id));
  const groups = new StableGroups(rowIds);
  for (const relationship of relationships) {
    if (
      relationship.kind === "partner" &&
      rowIds.has(relationship.fromPersonId) &&
      rowIds.has(relationship.toPersonId)
    ) {
      groups.union(relationship.fromPersonId, relationship.toPersonId);
    }
  }
  const coParentsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== "parent" || !rowIds.has(relationship.fromPersonId)) continue;
    const coParents = coParentsByChild.get(relationship.toPersonId) ?? [];
    coParents.push(relationship.fromPersonId);
    coParentsByChild.set(relationship.toPersonId, coParents);
  }
  for (const coParents of coParentsByChild.values()) {
    const ordered = [...new Set(coParents)].sort(compareText);
    for (let index = 1; index < ordered.length; index += 1) {
      groups.union(ordered[0], ordered[index]);
    }
  }
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const blocks = [...groups.values().values()].map((ids) => {
    const members = ids.map((id) => peopleById.get(id)).filter((person): person is Person => Boolean(person));
    members.sort(comparePeople);
    const memberIds = new Set(members.map((person) => person.id));
    const parentPositions = relationships
      .filter(
        (relationship) =>
          relationship.kind === "parent" && memberIds.has(relationship.toPersonId)
      )
      .map((relationship) => positioned.get(relationship.fromPersonId)?.x)
      .filter((value): value is number => value !== undefined);
    return {
      members,
      parentX:
        parentPositions.length > 0
          ? parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length
          : Number.POSITIVE_INFINITY,
      key: members.map((person) => person.id).join("\u001f")
    };
  });
  blocks.sort((left, right) => {
    if (left.parentX !== right.parentX) return left.parentX - right.parentX;
    return compareText(left.key, right.key);
  });
  return blocks.flatMap((block) => block.members);
};

const emptyBounds = (): LayoutBounds => ({
  x: 0,
  y: 0,
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  width: 0,
  height: 0
});
export function createTreeLayout(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  selectedPersonId?: string,
  limits: GenerationLimits = { ancestors: null, descendants: null },
  language: AppData["language"] = "en"
): DeterministicTreeLayout {
  const orderedPeople = normalizedPeople(people);
  const validIds = new Set(orderedPeople.map((person) => person.id));
  const orderedRelationships = normalizedRelationships(relationships, validIds);
  const generations = buildGenerationMap(orderedPeople, orderedRelationships);
  const visible = visibleIds(
    selectedPersonId,
    validIds,
    orderedRelationships,
    generations,
    limits
  );
  const visiblePeople = orderedPeople.filter((person) => visible.has(person.id));
  if (visiblePeople.length === 0) {
    return { people: [], relationships: [], width: 0, height: 0, bounds: emptyBounds() };
  }

  const labels = selectedPersonId
    ? deriveKinshipLabels(selectedPersonId, orderedPeople, orderedRelationships, language)
    : undefined;
  const rows = new Map<number, Person[]>();
  for (const person of visiblePeople) {
    const generation = generations.get(person.id) ?? 0;
    const row = rows.get(generation) ?? [];
    row.push(person);
    rows.set(generation, row);
  }
  const rowGenerations = [...rows.keys()].sort((left, right) => left - right);
  const minimumGeneration = rowGenerations[0];
  const positioned = new Map<string, PositionedPerson>();
  const resultPeople: PositionedPerson[] = [];
  for (const generation of rowGenerations) {
    const row = orderRow(rows.get(generation) ?? [], orderedRelationships, positioned);
    const startX = -((row.length - 1) * LAYOUT_METRICS.horizontalSpacing) / 2;
    row.forEach((person, index) => {
      const value: PositionedPerson = {
        ...person,
        x: startX + index * LAYOUT_METRICS.horizontalSpacing,
        y: (generation - minimumGeneration) * LAYOUT_METRICS.generationSpacing,
        role: labels?.[person.id] ?? "",
        generation
      };
      positioned.set(person.id, value);
      resultPeople.push(value);
    });
  }

  const visibleRelationships = orderedRelationships.filter((relationship) => {
    if (!visible.has(relationship.fromPersonId) || !visible.has(relationship.toPersonId)) {
      return false;
    }
    const fromGeneration = generations.get(relationship.fromPersonId) ?? 0;
    const toGeneration = generations.get(relationship.toPersonId) ?? 0;
    return relationship.kind === "parent"
      ? toGeneration > fromGeneration
      : toGeneration === fromGeneration;
  });
  const minX = Math.min(...resultPeople.map((person) => person.x - LAYOUT_METRICS.labelWidth / 2));
  const maxX = Math.max(...resultPeople.map((person) => person.x + LAYOUT_METRICS.labelWidth / 2));
  const minY = Math.min(...resultPeople.map((person) => person.y - LAYOUT_METRICS.avatarRadius));
  const maxY = Math.max(...resultPeople.map((person) => person.y + LAYOUT_METRICS.nodeBottom));
  const bounds: LayoutBounds = {
    x: minX,
    y: minY,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
  return {
    people: resultPeople,
    relationships: visibleRelationships,
    width: bounds.width,
    height: bounds.height,
    bounds
  };
}

export function filterLayoutByGeneration(
  layout: TreeLayout,
  selectedPersonId: string | undefined,
  limits: GenerationLimits
) {
  return createTreeLayout(layout.people, layout.relationships, selectedPersonId, limits);
}

export const generateTreeLayout = createTreeLayout;
