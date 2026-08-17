import type { AppData, FamilyRelationship, Person } from "./types";

const DEBUG_CONTEXT_ENDPOINT = "/__heritg/debug-context";

type DebugPerson = Omit<Person, "photoDataUrl"> & {
  photo: {
    present: boolean;
    omitted: true;
  };
};

type DebugRelationship = FamilyRelationship & {
  fromPersonName: string;
  toPersonName: string;
};

export interface ActiveFamilyDebugContext {
  generatedAt: string;
  activeTree: AppData["trees"][number] | null;
  selectedPersonId: string | null;
  selectedPerson: DebugPerson | null;
  counts: {
    people: number;
    relationships: number;
  };
  people: DebugPerson[];
  relationships: DebugRelationship[];
}

const debugPerson = ({ photoDataUrl, ...person }: Person): DebugPerson => ({
  ...person,
  photo: {
    present: photoDataUrl !== undefined,
    omitted: true
  }
});

export function buildActiveFamilyDebugContext(
  data: AppData,
  generatedAt = new Date().toISOString()
): ActiveFamilyDebugContext {
  const activeTree = data.trees.find((tree) => tree.id === data.selectedTreeId) ?? data.trees[0] ?? null;
  if (!activeTree) {
    return {
      generatedAt,
      activeTree: null,
      selectedPersonId: null,
      selectedPerson: null,
      counts: { people: 0, relationships: 0 },
      people: [],
      relationships: []
    };
  }

  const activePeople = data.people.filter((person) => person.treeId === activeTree.id);
  const people = activePeople.map(debugPerson);
  const namesById = new Map(activePeople.map((person) => [person.id, person.displayName]));
  const relationships = data.relationships
    .filter((relationship) => relationship.treeId === activeTree.id)
    .map((relationship) => ({
      ...relationship,
      fromPersonName: namesById.get(relationship.fromPersonId) ?? "Unknown person",
      toPersonName: namesById.get(relationship.toPersonId) ?? "Unknown person"
    }));

  return {
    generatedAt,
    activeTree,
    selectedPersonId: activeTree.lastSelectedPersonId ?? null,
    selectedPerson: people.find((person) => person.id === activeTree.lastSelectedPersonId) ?? null,
    counts: {
      people: activePeople.length,
      relationships: relationships.length
    },
    people,
    relationships
  };
}

export async function publishActiveFamilyDebugContext(data: AppData) {
  if (!__DEBUG_CONTEXT_ENABLED__ || /^\/s\/[^/]+\/?$/u.test(window.location.pathname)) return;

  const response = await fetch(DEBUG_CONTEXT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildActiveFamilyDebugContext(data))
  });
  if (!response.ok) {
    throw new Error(`Unable to publish debug context (${response.status}).`);
  }
}
