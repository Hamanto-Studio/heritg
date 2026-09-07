import { deriveKinshipLabels, type KinshipLanguage } from "./kinship";
import { deriveBirthOrders } from "./birthOrder";
import { formatPersonName } from "./personName";
import { joinedFamilyPositions } from "./joinedFamilyLayout";
import { independentInlawGroups, insetInlawAncestors } from "./inlawCorridors";
import { staggerUnionParents } from "./unionCorridors";
import { insetCareParents } from "./careCorridors";
import { familyRouteLanes, FAMILY_ROUTE_LANE_SPACING } from "./familyRouteLanes";
import { isCareRelationship, isFamilyParent } from "./parentConnections";
import type {
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
  horizontalSpacing: 260, familyGap: 200, generationSpacing: 260
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
    if (relationship.kind === "partner") {
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
  const parentGroupGraph = () => {
    const graph = new Map<string, Set<string>>();
    for (const relationship of relationships) {
      if (relationship.kind !== "parent") continue;
      const from = groups.find(relationship.fromPersonId);
      const to = groups.find(relationship.toPersonId);
      if (from === to) continue;
      if (!graph.has(from)) graph.set(from, new Set());
      graph.get(from)!.add(to);
    }
    return graph;
  };
  const reachable = (start: string, graph: Map<string, Set<string>>) => {
    const visited = new Set<string>();
    const queue = [start];
    for (let index = 0; index < queue.length; index++) {
      for (const next of graph.get(queue[index]) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    return visited;
  };
  const alignSiblings = (first: string, second: string) => {
    const from = groups.find(first);
    const to = groups.find(second);
    if (from === to) return;
    const graph = parentGroupGraph();
    // Row alignment is a preference, not a genealogical constraint. A marriage
    // across generations can put one sibling's partner below another sibling.
    // Merging those rows would erase a parent edge or introduce a rank cycle.
    if (reachable(from, graph).has(to) || reachable(to, graph).has(from)) return;
    groups.union(first, second);
  };
  for (const relationship of relationships) {
    if (relationship.kind === "sibling") alignSiblings(relationship.fromPersonId, relationship.toPersonId);
  }
  const childrenByParent = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== "parent") continue;
    const children = childrenByParent.get(relationship.fromPersonId) ?? [];
    children.push(relationship.toPersonId);
    childrenByParent.set(relationship.fromPersonId, children);
  }
  for (const children of childrenByParent.values()) {
    const ordered = [...new Set(children)].sort(compareText);
    const graph = parentGroupGraph();
    const downstream = new Set<string>();
    const peers = new Set(ordered.map((id) => groups.find(id)));
    for (const peer of peers) for (const descendant of reachable(peer, graph)) {
      if (peers.has(descendant)) downstream.add(descendant);
    }
    // Align ordinary siblings first, leaving the cross-generation spouse on
    // the lower row rather than pulling all their siblings down with them.
    ordered.sort((a, b) => Number(downstream.has(groups.find(a))) - Number(downstream.has(groups.find(b))) || compareText(a, b));
    for (let index = 1; index < ordered.length; index += 1) {
      alignSiblings(ordered[0], ordered[index]);
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
  for (const current of [...queue].reverse()) {
    const childLevels = [...(outgoing.get(current) ?? [])]
      .map((child) => levels.get(child))
      .filter((level): level is number => level !== undefined);
    if (childLevels.length === 0) continue;
    const latestValidLevel = Math.min(...childLevels) - 1;
    levels.set(current, Math.max(levels.get(current) ?? 0, latestValidLevel));
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
    const memberIds = new Set(members.map((person) => person.id));
    const parentRelationships = relationships
      .filter(
        (relationship) =>
          relationship.kind === "parent" && memberIds.has(relationship.toPersonId)
      );
    const memberParentX = (personId: string) => {
      const values = parentRelationships
        .filter((relationship) => relationship.toPersonId === personId)
        .map((relationship) => positioned.get(relationship.fromPersonId)?.x)
        .filter((value): value is number => value !== undefined);
      return values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : Number.POSITIVE_INFINITY;
    };
    members.sort((left, right) =>
      memberParentX(left.id) - memberParentX(right.id) || comparePeople(left, right)
    );
    const stableRank = new Map(members.map((person, index) => [person.id, index]));
    const partnerGroups = new StableGroups(memberIds);
    const partnerDegree = new Map<string, number>();
    const partnerNeighbors = new Map<string, Set<string>>();
    for (const relationship of relationships) {
      if (
        relationship.kind !== "partner" ||
        !memberIds.has(relationship.fromPersonId) ||
        !memberIds.has(relationship.toPersonId)
      ) continue;
      partnerGroups.union(relationship.fromPersonId, relationship.toPersonId);
      for (const [from, to] of [[relationship.fromPersonId, relationship.toPersonId], [relationship.toPersonId, relationship.fromPersonId]]) {
        if (!partnerNeighbors.has(from)) partnerNeighbors.set(from, new Set());
        partnerNeighbors.get(from)!.add(to);
      }
      partnerDegree.set(
        relationship.fromPersonId,
        (partnerDegree.get(relationship.fromPersonId) ?? 0) + 1
      );
      partnerDegree.set(
        relationship.toPersonId,
        (partnerDegree.get(relationship.toPersonId) ?? 0) + 1
      );
    }
    const partnerComponents = [...partnerGroups.values().values()]
      .map((ids) => ids.map((id) => peopleById.get(id)!)
        .sort((left, right) =>
          (stableRank.get(left.id) ?? 0) - (stableRank.get(right.id) ?? 0)
        ))
      .sort((left, right) =>
        (stableRank.get(left[0].id) ?? 0) - (stableRank.get(right[0].id) ?? 0)
      );
    members.splice(0, members.length, ...partnerComponents.flatMap((component) => {
      // Remarriage often forms a simple chain, not a star: former spouse ↔
      // parent ↔ current spouse ↔ their former spouse. Follow the actual
      // partnerships so every couple is adjacent instead of centering one hub.
      const endpoints = component.filter((person) => partnerNeighbors.get(person.id)?.size === 1);
      if (component.length > 2 && endpoints.length === 2 && component.every((person) => (partnerNeighbors.get(person.id)?.size ?? 0) <= 2)) {
        const path: Person[] = [];
        let id: string | undefined = endpoints[0].id, previous: string | undefined;
        while (id && path.length < component.length) {
          path.push(peopleById.get(id)!);
          const next: string | undefined = [...partnerNeighbors.get(id)!].find((neighbor) => neighbor !== previous);
          previous = id; id = next;
        }
        if (path.length === component.length) return path;
      }
      const hub = [...component].sort((left, right) =>
        (partnerDegree.get(right.id) ?? 0) - (partnerDegree.get(left.id) ?? 0) ||
        (stableRank.get(left.id) ?? 0) - (stableRank.get(right.id) ?? 0)
      )[0];
      if (!hub || (partnerDegree.get(hub.id) ?? 0) <= 1) return component;
      const ordered = component.filter((person) => person.id !== hub.id);
      ordered.splice(Math.floor((ordered.length + 1) / 2), 0, hub);
      return ordered;
    }));
    const memberIndex = new Map(members.map((person, index) => [person.id, index]));
    const parentPositions = parentRelationships
      .map((relationship) => {
        const parentX = positioned.get(relationship.fromPersonId)?.x;
        const childIndex = memberIndex.get(relationship.toPersonId);
        return parentX === undefined || childIndex === undefined
          ? undefined
          : parentX - childIndex * LAYOUT_METRICS.horizontalSpacing;
      })
      .filter((value): value is number => value !== undefined);
    const familyKeys = new Set(
      members.flatMap((person) => {
        const parentIds = parentRelationships
          .filter((relationship) => relationship.toPersonId === person.id)
          .map((relationship) => relationship.fromPersonId)
          .sort(compareText);
        return parentIds.length > 0 ? [parentIds.join("\u001f")] : [];
      })
    );
    return {
      members,
      familyKeys,
      parentX:
        parentPositions.length > 0
          ? parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length
          : Number.POSITIVE_INFINITY,
      key: members.map((person) => person.id).join("\u001f")
    };
  });
  blocks.sort((left, right) => {
    if (left.parentX !== right.parentX) return left.parentX - right.parentX;
    const memberCount = Math.min(left.members.length, right.members.length);
    for (let index = 0; index < memberCount; index += 1) {
      const comparison = comparePeople(left.members[index], right.members[index]);
      if (comparison) return comparison;
    }
    if (left.members.length !== right.members.length) {
      return left.members.length - right.members.length;
    }
    return compareText(left.key, right.key);
  });
  return blocks;
};

const needsFamilyGap = (
  left: ReturnType<typeof orderRow>[number],
  right: ReturnType<typeof orderRow>[number]
) => {
  if (left.members.length > 1 || right.members.length > 1) return true;
  if (left.familyKeys.size === 0 || right.familyKeys.size === 0) return true;
  return ![...left.familyKeys].some((key) => right.familyKeys.has(key));
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
  language: KinshipLanguage = "en"
): DeterministicTreeLayout {
  const orderedPeople = normalizedPeople(people);
  const validIds = new Set(orderedPeople.map((person) => person.id));
  const orderedRelationships = normalizedRelationships(relationships, validIds);
  const generations = buildGenerationMap(orderedPeople, orderedRelationships);
  const birthOrders = deriveBirthOrders(orderedPeople, orderedRelationships);
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

  const labels = selectedPersonId && visiblePeople.length > 1
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
  const blocksByGeneration = new Map<number, ReturnType<typeof orderRow>>();
  for (const generation of rowGenerations) {
    const blocks = orderRow(rows.get(generation) ?? [], orderedRelationships, positioned);
    blocksByGeneration.set(generation, blocks);
    const personCount = blocks.reduce((sum, block) => sum + block.members.length, 0);
    const familyGapCount = blocks.slice(1).filter((block, index) =>
      needsFamilyGap(blocks[index], block)
    ).length;
    const rowWidth =
      (personCount - 1) * LAYOUT_METRICS.horizontalSpacing +
      familyGapCount * LAYOUT_METRICS.familyGap;
    let nextX = generation === minimumGeneration ? -rowWidth / 2 : undefined;
    blocks.forEach((block, blockIndex) => {
      const gap = blockIndex > 0 && needsFamilyGap(blocks[blockIndex - 1], block)
        ? LAYOUT_METRICS.familyGap : 0;
      const minimumX = nextX === undefined ? undefined : nextX + gap;
      const parentX = Number.isFinite(block.parentX) ? block.parentX : minimumX ?? 0;
      let x = minimumX === undefined ? parentX : Math.max(parentX, minimumX);
      block.members.forEach((person) => {
        const value: PositionedPerson = {
          ...person,
          x,
          y: (generation - minimumGeneration) * LAYOUT_METRICS.generationSpacing,
          role: labels?.[person.id] ?? "",
          generation,
          birthOrder: birthOrders.get(person.id)
        };
        positioned.set(person.id, value);
        resultPeople.push(value);
        x += LAYOUT_METRICS.horizontalSpacing;
      });
      nextX = x;
    });
  }

  // Let wide descendant branches pull their parents apart instead of crossing nearby family rails.
  const blockChildCenter = (
    block: ReturnType<typeof orderRow>[number],
    generation: number
  ) => {
    const memberIds = new Set(block.members.map((person) => person.id));
    const children = orderedRelationships
      .filter((relationship) => relationship.kind === "parent" && memberIds.has(relationship.fromPersonId))
      .map((relationship) => positioned.get(relationship.toPersonId))
      .filter((person): person is PositionedPerson =>
        person !== undefined && person.generation > generation
      );
    if (children.length === 0) {
      const members = block.members.map((person) => positioned.get(person.id)!);
      return (members[0].x + members.at(-1)!.x) / 2;
    }
    const nearestGeneration = Math.min(...children.map((person) => person.generation));
    const xs = children.filter((person) => person.generation === nearestGeneration)
      .map((person) => person.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };
  for (let rowIndex = rowGenerations.length - 2; rowIndex >= 0; rowIndex -= 1) {
    const generation = rowGenerations[rowIndex];
    const blocks = [...(blocksByGeneration.get(generation) ?? [])].sort((left, right) =>
      blockChildCenter(left, generation) - blockChildCenter(right, generation) ||
      compareText(left.key, right.key)
    );
    blocksByGeneration.set(generation, blocks);
    let nextX: number | undefined;
    blocks.forEach((block, blockIndex) => {
      const memberIds = new Set(block.members.map((person) => person.id));
      const directChildren = orderedRelationships
        .filter((relationship) => relationship.kind === "parent" && memberIds.has(relationship.fromPersonId))
        .map((relationship) => positioned.get(relationship.toPersonId))
        .filter((person): person is PositionedPerson =>
          person !== undefined && person.generation > generation
        );
      const nearestChildGeneration = directChildren.length > 0
        ? Math.min(...directChildren.map((person) => person.generation))
        : undefined;
      const childXs = directChildren
        .filter((person) => person.generation === nearestChildGeneration)
        .map((person) => person.x);
      const currentMembers = block.members.map((person) => positioned.get(person.id)!);
      const currentStart = currentMembers[0].x;
      const desiredCenter = childXs.length > 0
        ? (Math.min(...childXs) + Math.max(...childXs)) / 2
        : (currentMembers[0].x + currentMembers.at(-1)!.x) / 2;
      const desiredStart = desiredCenter -
        ((currentMembers.length - 1) * LAYOUT_METRICS.horizontalSpacing) / 2;
      const gap = blockIndex > 0 && needsFamilyGap(blocks[blockIndex - 1], block)
        ? LAYOUT_METRICS.familyGap : 0;
      const minimumX = nextX === undefined ? desiredStart : nextX + gap;
      const startX = Math.max(desiredStart, minimumX);
      const descendantShift = startX - desiredStart;
      if (descendantShift > 0 && childXs.length > 0) {
        const descendantIds = new Set<string>();
        const queue = [...memberIds];
        for (let index = 0; index < queue.length; index += 1) {
          for (const relationship of orderedRelationships) {
            if (
              relationship.kind !== "parent" ||
              relationship.fromPersonId !== queue[index] ||
              descendantIds.has(relationship.toPersonId)
            ) continue;
            descendantIds.add(relationship.toPersonId);
            queue.push(relationship.toPersonId);
          }
        }
        for (const descendantGeneration of rowGenerations) {
          if (descendantGeneration <= generation) continue;
          for (const descendantBlock of blocksByGeneration.get(descendantGeneration) ?? []) {
            const members = descendantBlock.members.map((person) => positioned.get(person.id)!);
            if (!members.some((person) => descendantIds.has(person.id))) continue;
            members.forEach((person) => {
              person.x += descendantShift;
            });
          }
        }
      }
      const shift = startX - currentStart;
      currentMembers.forEach((person) => {
        person.x += shift;
      });
      nextX = startX + currentMembers.length * LAYOUT_METRICS.horizontalSpacing;
    });
    for (let blockIndex = blocks.length - 2; blockIndex >= 0; blockIndex -= 1) {
      const block = blocks[blockIndex];
      const nextBlock = blocks[blockIndex + 1];
      const sharesParentFamily = [...block.familyKeys]
        .some((key) => nextBlock.familyKeys.has(key));
      if (!sharesParentFamily) continue;
      const memberIds = new Set(block.members.map((person) => person.id));
      const hasDirectDescendants = orderedRelationships.some((relationship) =>
        relationship.kind === "parent" &&
        memberIds.has(relationship.fromPersonId) &&
        (positioned.get(relationship.toPersonId)?.generation ?? generation) > generation
      );
      if (hasDirectDescendants) continue;
      const currentMembers = block.members.map((person) => positioned.get(person.id)!);
      const nextStart = positioned.get(nextBlock.members[0].id)!.x;
      const gap = needsFamilyGap(block, nextBlock) ? LAYOUT_METRICS.familyGap : 0;
      const compactStart = nextStart - gap -
        currentMembers.length * LAYOUT_METRICS.horizontalSpacing;
      const shift = compactStart - currentMembers[0].x;
      if (shift <= 0) continue;
      currentMembers.forEach((person) => {
        person.x += shift;
      });
    }
  }

  // Ancestor alignment can move branches after their rows were laid out. Sweep downward
  // once more from the updated parent positions to regroup siblings and remove crossings.
  for (const generation of rowGenerations) {
    // Recompute partner order too: the upward pass may have reversed the order
    // of their parent families since the first placement.
    const updatedBlocks = generation === minimumGeneration
      ? [...(blocksByGeneration.get(generation) ?? [])]
      : orderRow(rows.get(generation) ?? [], orderedRelationships, positioned);
    const parentStart = (block: ReturnType<typeof orderRow>[number]) => {
      const memberIndex = new Map(block.members.map((person, index) => [person.id, index]));
      const starts = orderedRelationships
        .filter((relationship) => relationship.kind === "parent" && memberIndex.has(relationship.toPersonId))
        .map((relationship) => {
          const parentX = positioned.get(relationship.fromPersonId)?.x;
          const index = memberIndex.get(relationship.toPersonId)!;
          return parentX === undefined
            ? undefined : parentX - index * LAYOUT_METRICS.horizontalSpacing;
        })
        .filter((value): value is number => value !== undefined);
      return starts.length > 0
        ? starts.reduce((sum, value) => sum + value, 0) / starts.length
        : positioned.get(block.members[0].id)!.x;
    };
    const hasDescendants = (block: ReturnType<typeof orderRow>[number]) => {
      const ids = new Set(block.members.map((person) => person.id));
      return orderedRelationships.some((relationship) =>
        relationship.kind === "parent" && ids.has(relationship.fromPersonId)
      );
    };
    const blocks = updatedBlocks.sort((left, right) =>
      parentStart(left) - parentStart(right) ||
      Number(hasDescendants(left)) - Number(hasDescendants(right)) ||
      compareText(left.key, right.key)
    );
    blocksByGeneration.set(generation, blocks);
    let nextX: number | undefined;
    blocks.forEach((block, blockIndex) => {
      const members = block.members.map((person) => positioned.get(person.id)!);
      const gap = blockIndex > 0 && needsFamilyGap(blocks[blockIndex - 1], block)
        ? LAYOUT_METRICS.familyGap : 0;
      // Keep the space allocated by the upward pass for descendant families.
      // Pulling these parents back toward their own parents collapses wide
      // sibling branches and sends their child rails across neighboring trees.
      const desiredStart = generation === minimumGeneration || hasDescendants(block)
        ? Math.min(...members.map((person) => person.x)) : parentStart(block);
      const startX = nextX === undefined ? desiredStart : Math.max(desiredStart, nextX + gap);
      members.forEach((person, index) => {
        person.x = startX + index * LAYOUT_METRICS.horizontalSpacing;
      });
      nextX = members[0].x + members.length * LAYOUT_METRICS.horizontalSpacing;
    });
  }

  // Reserve subtree widths before placing simple forests and unions whose
  // ancestry can share a primary branch. Keep the general alignment sweeps for
  // other joined ancestry, without accumulating whitespace on ordinary trees.
  const simpleBlocks = rowGenerations.flatMap((generation) => blocksByGeneration.get(generation) ?? []);
  const blockForPerson = new Map(simpleBlocks.flatMap((block) => block.members.map((person) => [person.id, block] as const)));
  // A hanging, single-child in-law couple is an inset ancestor, not a second
  // descendant backbone. Do not let it interleave otherwise disjoint sibling
  // subtrees in the general DAG ordering. Its people and edges remain present;
  // the physical inset is placed after the descendant slots are reserved.
  const insetRootBlocks = new Set(independentInlawGroups(resultPeople, orderedRelationships).flatMap((family) => {
    const parent = blockForPerson.get(family.parentIds[0])!;
    const child = blockForPerson.get(family.childIds[0])!;
    return parent.members.length === 2 && child.members.length === 2 &&
      family.parentIds.every((id) => blockForPerson.get(id) === parent) ? [parent] : [];
  }));
  const parentsOfBlock = new Map(simpleBlocks.map((block) => [block, new Set<typeof block>()]));
  const childrenOfBlock = new Map(simpleBlocks.map((block) => [block, new Set<typeof block>()]));
  for (const relationship of orderedRelationships) {
    if (relationship.kind !== "parent") continue;
    const parentBlock = blockForPerson.get(relationship.fromPersonId);
    const childBlock = blockForPerson.get(relationship.toPersonId);
    if (!parentBlock || !childBlock || parentBlock === childBlock) continue;
    if (insetRootBlocks.has(parentBlock)) continue;
    if (positioned.get(relationship.fromPersonId)!.generation >= positioned.get(relationship.toPersonId)!.generation) continue;
    parentsOfBlock.get(childBlock)!.add(parentBlock);
    childrenOfBlock.get(parentBlock)!.add(childBlock);
  }
  const isSimpleForest = simpleBlocks.every((block) => {
    const parents = parentsOfBlock.get(block)!;
    // A descendant's spouse does not stop this being a branch. Reserve the
    // complete household's descendant width, including all of its partners.
    // Only unions connecting independent ancestral branches need the DAG path.
    return parents.size <= 1;
  });
  type Block = typeof simpleBlocks[number];
  const primaryParent = new Map<Block, Block>();
  const crossGenerationUnions: Block[] = [];
  const isAncestorBlock = (ancestor: Block, descendant: Block) => {
    const queue = [descendant];
    const seen = new Set(queue);
    for (let index = 0; index < queue.length; index++) {
      for (const parent of parentsOfBlock.get(queue[index])!) {
        if (parent === ancestor) return true;
        if (!seen.has(parent)) { seen.add(parent); queue.push(parent); }
      }
    }
    return false;
  };
  const canUsePrimaryBranches = simpleBlocks.every((block) => {
    const parents = [...parentsOfBlock.get(block)!];
    if (!parents.length) return true;
    const level = (parent: Block) => positioned.get(parent.members[0].id)!.generation;
    parents.sort((a, b) => level(b) - level(a) || compareText(a.key, b.key));
    const closest = parents[0];
    if (parents.slice(1).some((parent) => level(parent) === level(closest) || !isAncestorBlock(parent, closest))) return false;
    primaryParent.set(block, closest);
    if (parents.length > 1) crossGenerationUnions.push(block);
    return true;
  });
  const usePrimaryBranches = canUsePrimaryBranches && crossGenerationUnions.length > 0;
  const outerBranches = new Set<Block>();
  if (usePrimaryBranches) {
    // A union can belong to both a nearby parent and an earlier ancestor.
    // Allocate its space once under the nearby branch, retaining ALL edges for
    // routing. Put that branch at the outside so the long ancestor stem has a
    // clear corridor rather than cutting across unrelated descendants.
    for (const children of childrenOfBlock.values()) children.clear();
    for (const [child, parent] of primaryParent) childrenOfBlock.get(parent)!.add(child);
    for (const union of crossGenerationUnions) {
      const nearbyParent = primaryParent.get(union)!;
      const remoteChild = (id: string) => orderedRelationships.some((edge) => edge.kind === "parent" && edge.toPersonId === id && blockForPerson.get(edge.fromPersonId) !== nearbyParent);
      union.members.sort((a, b) => Number(remoteChild(b.id)) - Number(remoteChild(a.id)) || comparePeople(a, b));
      let branch: Block | undefined = nearbyParent;
      while (branch) { outerBranches.add(branch); branch = primaryParent.get(branch); }
    }
  }
  if (isSimpleForest || usePrimaryBranches) {
    // Name sorting must not interleave children from different unions. Keep
    // each recorded parent set under its own side of the shared household;
    // name order is only a tie-break within that branch.
    const childSource = (block: Block, child: Block) => {
      const ids = new Set(child.members.map((person) => person.id));
      const source = orderedRelationships.filter((edge) => isFamilyParent(edge) && ids.has(edge.toPersonId))
        .map((edge) => block.members.findIndex((person) => person.id === edge.fromPersonId)).filter((index) => index >= 0);
      return source.length ? source.reduce((sum, index) => sum + index, 0) / source.length : block.members.length / 2;
    };
    const childSources = new Map(simpleBlocks.flatMap((block) => [...childrenOfBlock.get(block)!].map((child) => [child, childSource(block, child)] as const)));
    const orderedChildren = (block: typeof simpleBlocks[number]) => [...childrenOfBlock.get(block)!]
      .sort((left, right) => Number(outerBranches.has(right)) - Number(outerBranches.has(left)) ||
        childSources.get(left)! - childSources.get(right)! || comparePeople(left.members[0], right.members[0]) || compareText(left.key, right.key));
    const widths = new Map<typeof simpleBlocks[number], number>();
    const childrenSpan = (children: typeof simpleBlocks) => children.reduce((sum, child, index) =>
      sum + widths.get(child)! + (index > 0 && needsFamilyGap(children[index - 1], child) ? LAYOUT_METRICS.familyGap : 0), 0);
    for (const generation of [...rowGenerations].reverse()) {
      for (const block of blocksByGeneration.get(generation) ?? []) {
        const children = orderedChildren(block);
        const childrenWidth = childrenSpan(children);
        widths.set(block, Math.max(block.members.length * LAYOUT_METRICS.horizontalSpacing, childrenWidth));
      }
    }
    const roots = simpleBlocks.filter((block) => !insetRootBlocks.has(block) && parentsOfBlock.get(block)!.size === 0)
      .sort((left, right) => comparePeople(left.members[0], right.members[0]) || compareText(left.key, right.key));
    const totalWidth = roots.reduce((sum, root) => sum + widths.get(root)!, 0) +
      Math.max(0, roots.length - 1) * LAYOUT_METRICS.familyGap;
    const queue: { block: typeof simpleBlocks[number]; left: number }[] = [];
    let rootLeft = -totalWidth / 2;
    for (const root of roots) {
      queue.push({ block: root, left: rootLeft });
      rootLeft += widths.get(root)! + LAYOUT_METRICS.familyGap;
    }
    for (let index = 0; index < queue.length; index += 1) {
      const { block, left } = queue[index];
      const center = left + widths.get(block)! / 2;
      block.members.forEach((person, memberIndex) => {
        positioned.get(person.id)!.x = center + (memberIndex - (block.members.length - 1) / 2) * LAYOUT_METRICS.horizontalSpacing;
      });
      const children = orderedChildren(block);
      const childrenWidth = childrenSpan(children);
      let childLeft = center - childrenWidth / 2;
      for (const [childIndex, child] of children.entries()) {
        if (childIndex > 0 && needsFamilyGap(children[childIndex - 1], child)) childLeft += LAYOUT_METRICS.familyGap;
        queue.push({ block: child, left: childLeft });
        childLeft += widths.get(child)!;
      }
    }
    if (isSimpleForest || usePrimaryBranches) {
      // Align to the actual child within a couple, not to the couple's midpoint.
      // This gives ordinary branches a straight stem and avoids parallel rails.
      for (const generation of [...rowGenerations].reverse()) {
        for (const block of blocksByGeneration.get(generation) ?? []) {
          const ids = new Set(block.members.map((person) => person.id));
          const childXs = orderedRelationships.filter((edge) => edge.kind === "parent" && ids.has(edge.fromPersonId))
            .map((edge) => positioned.get(edge.toPersonId))
            .filter((person): person is PositionedPerson => person !== undefined && person.generation > generation)
            .map((person) => person.x);
          if (!childXs.length) continue;
          const center = (Math.min(...childXs) + Math.max(...childXs)) / 2;
          // A guardian without a recorded partnership belongs beside the
          // branch they care for, not before the couple because they are older.
          // Keep couples intact and move only care-only members of this block.
          const careTargets = new Map(block.members.flatMap((person) => {
            const outgoing = orderedRelationships.filter((edge) => edge.fromPersonId === person.id && edge.kind === "parent");
            if (!outgoing.length || outgoing.some((edge) => !isCareRelationship(edge)) ||
                orderedRelationships.some((edge) => edge.kind === "partner" && [edge.fromPersonId, edge.toPersonId].includes(person.id))) return [];
            const xs = outgoing.map((edge) => positioned.get(edge.toPersonId)!.x);
            return [[person.id, xs.reduce((sum, x) => sum + x, 0) / xs.length] as const];
          }));
          const carers = block.members.filter((person) => careTargets.has(person.id))
            .sort((a, b) => careTargets.get(a.id)! - careTargets.get(b.id)! || comparePeople(a, b));
          if (carers.length) block.members.splice(0, block.members.length,
            ...carers.filter((person) => careTargets.get(person.id)! < center),
            ...block.members.filter((person) => !careTargets.has(person.id)),
            ...carers.filter((person) => careTargets.get(person.id)! >= center));
          block.members.forEach((person, index) => {
            positioned.get(person.id)!.x = center + (index - (block.members.length - 1) / 2) * LAYOUT_METRICS.horizontalSpacing;
          });
        }
      }
    }
  }

  if (!isSimpleForest && !usePrimaryBranches) {
    const joined = joinedFamilyPositions(simpleBlocks, positioned, orderedRelationships,
      LAYOUT_METRICS.horizontalSpacing, LAYOUT_METRICS.familyGap);
    for (const [id, x] of joined) positioned.get(id)!.x = x;
  }

  // Do not squeeze several relationship corridors into the ordinary row gap.
  // Reserve enough space above the child rails and below the longest labels;
  // generation numbers stay logical while their physical spacing can grow.
  const laneReservations = familyRouteLanes(resultPeople, orderedRelationships);
  const newRowY = new Map<number, number>([[rowGenerations[0], 0]]);
  for (let index = 1; index < rowGenerations.length; index++) {
    const previous = rowGenerations[index - 1], generation = rowGenerations[index];
    const row = resultPeople.filter((person) => person.generation === previous);
    const originalY = row[0].y;
    const childY = resultPeople.find((person) => person.generation === generation)!.y;
    const parentLanes = Math.max(0, ...laneReservations.filter((family) => family.parentBand === originalY).map((family) => family.parentLaneCount - 1));
    const childLanes = Math.max(0, ...laneReservations.filter((family) => family.children.some((child) => child.y === childY)).map((family) => family.childLaneIndex));
    const childStemClearance = Math.max(40, ...laneReservations.filter((family) => family.children.some((child) => child.y === childY)).map((family) => family.childStemClearance));
    const labelBottom = Math.max(...row.map((person) => LAYOUT_METRICS.nodeBottom +
      formatPersonName(person.displayName).extraHeight + (person.city.trim() ? LAYOUT_METRICS.lifeHeight : 0) + 16));
    const clearance = labelBottom + 8 + 32 + childStemClearance + LAYOUT_METRICS.avatarRadius + (parentLanes + childLanes) * FAMILY_ROUTE_LANE_SPACING;
    newRowY.set(generation, newRowY.get(previous)! + Math.max(LAYOUT_METRICS.generationSpacing, clearance));
  }
  for (const person of resultPeople) person.y = newRowY.get(person.generation)!;
  staggerUnionParents(resultPeople, orderedRelationships);
  const familyRailY = insetInlawAncestors(resultPeople, orderedRelationships, LAYOUT_METRICS.horizontalSpacing);
  insetCareParents(resultPeople, orderedRelationships, familyRailY);

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
  const maxY = Math.max(...resultPeople.map((person) =>
    person.y + LAYOUT_METRICS.nodeBottom + formatPersonName(person.displayName).extraHeight +
      (person.city.trim() ? LAYOUT_METRICS.lifeHeight : 0)
  ));
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
    bounds,
    ...(Object.keys(familyRailY).length ? { familyRailY } : {})
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
