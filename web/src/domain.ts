import { newId } from "./types";
import type {
  AppData, DirectRole, FamilyRelationship, FamilyTree, Gender, Person,
  RelationshipKind, RelationshipSubtype, ViewportState
} from "./types";
import {
  DIRECT_ROLE_DEFAULTS,
  directRoleDefaults,
  isPartnerRole
} from "./relationshipRoles";

export { DIRECT_ROLE_DEFAULTS, directRoleDefaults } from "./relationshipRoles";
export type { DirectRoleDefaults } from "./relationshipRoles";

export type AppLanguage = AppData["language"];
export type DomainErrorCode =
  | "emptyName" | "notFound" | "selfRelationship"
  | "crossTreeRelationship" | "duplicateRelationship"
  | "invalidData";

const errorMessages: Record<DomainErrorCode, string> = {
  emptyName: "Enter a name.",
  notFound: "The requested family tree item does not exist.",
  selfRelationship: "A person cannot be related to themselves.",
  crossTreeRelationship: "People from different family trees cannot be linked.",
  duplicateRelationship: "This relationship already exists.",
  invalidData: "The family tree data is invalid."
};
export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message = errorMessages[code]) {
    super(message);
    this.name = "DomainError";
  }
}
export interface DomainMeta {
  id?: string;
  now?: string;
}
export interface NewPersonInput {
  displayName: string;
  gender?: Gender;
  role?: DirectRole;
  birthDate?: string;
  deathDate?: string;
  birthDatePrecision?: Person["birthDatePrecision"];
  notes?: string;
  addressLine?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  photoDataUrl?: string;
}
export type PersonChanges = Partial<Omit<Person, "id" | "treeId" | "createdAt">>;
const VALID_SUBTYPES: Record<RelationshipKind, RelationshipSubtype[]> = {
  parent: ["biologicalParent", "adoptiveParent", "fosterParent", "guardian", "stepParent"],
  partner: ["partner", "spouse", "formerPartner", "formerSpouse"],
  sibling: ["sibling", "halfSibling", "adoptiveSibling", "fosterSibling", "stepSibling"]
};
const resolvedMeta = (meta: DomainMeta) => ({
  id: meta.id ?? newId(),
  now: meta.now ?? new Date().toISOString()
});
const requiredName = (value: string) => {
  const name = value.trim();
  if (!name) throw new DomainError("emptyName");
  return name;
};
const findTree = (data: AppData, treeId: string) => {
  const tree = data.trees.find((item) => item.id === treeId);
  if (!tree) throw new DomainError("notFound");
  return tree;
};
const findPerson = (data: AppData, personId: string) => {
  const person = data.people.find((item) => item.id === personId);
  if (!person) throw new DomainError("notFound");
  return person;
};
const touchTree = (data: AppData, treeId: string, updatedAt: string) => ({
  ...data,
  trees: data.trees.map((tree) =>
    tree.id === treeId ? { ...tree, updatedAt } : tree
  )
});
const validateLifeDates = (birthDate?: string, deathDate?: string) => {
  if (birthDate && deathDate && Date.parse(deathDate) < Date.parse(birthDate)) {
    throw new DomainError("invalidData", "Death date cannot be earlier than birth date.");
  }
};
const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const relationshipDates = (
  subtype: RelationshipSubtype,
  marriageDate?: string,
  divorceDate?: string
) => {
  const isFormer = subtype === "formerPartner" || subtype === "formerSpouse";
  if (!isFormer || !divorceDate) {
    return marriageDate ? { marriageDate } : {};
  }
  if (!validCalendarDate(divorceDate)) {
    throw new DomainError("invalidData", "Divorce date must use YYYY-MM-DD.");
  }
  if (marriageDate && Number.isFinite(Date.parse(marriageDate))) {
    const marriageDay = new Date(marriageDate).toISOString().slice(0, 10);
    if (divorceDate < marriageDay) {
      throw new DomainError("invalidData", "Divorce date cannot be earlier than marriage date.");
    }
  }
  return {
    ...(marriageDate ? { marriageDate } : {}),
    divorceDate
  };
};
export const localizedDefaultTreeTitle = (language: AppLanguage) =>
  language === "id" ? "Silsilah Keluarga Saya" : "My Family Tree";

export function createInitialAppData(
  language?: AppLanguage,
  meta: DomainMeta = {}
): AppData {
  const selectedLanguage = language ??
    (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("id")
      ? "id"
      : "en");
  const empty: AppData = {
    version: 1,
    trees: [],
    people: [],
    relationships: [],
    language: selectedLanguage,
    viewports: {}
  };
  return createTree(empty, localizedDefaultTreeTitle(selectedLanguage), meta);
}

export function ensureDefaultTree(data: AppData, meta: DomainMeta = {}): AppData {
  return data.trees.length
    ? data
    : createTree(data, localizedDefaultTreeTitle(data.language), meta);
}
export function createTree(
  data: AppData, title: string, meta: DomainMeta = {}
): AppData {
  const { id, now } = resolvedMeta(meta);
  if (data.trees.some((tree) => tree.id === id)) {
    throw new DomainError("invalidData", "A family tree with this ID already exists.");
  }
  const tree: FamilyTree = {
    id,
    title: requiredName(title),
    createdAt: now,
    updatedAt: now
  };
  return { ...data, trees: [...data.trees, tree], selectedTreeId: id };
}

export function renameTree(
  data: AppData, treeId: string, title: string,
  now = new Date().toISOString()
): AppData {
  const tree = findTree(data, treeId);
  const nextTitle = requiredName(title);
  if (tree.title === nextTitle) return data;
  return {
    ...data,
    trees: data.trees.map((item) =>
      item.id === treeId ? { ...item, title: nextTitle, updatedAt: now } : item
    )
  };
}

export function deleteTree(data: AppData, treeId: string): AppData {
  findTree(data, treeId);
  const trees = data.trees.filter((tree) => tree.id !== treeId);
  const viewports = Object.fromEntries(
    Object.entries(data.viewports).filter(([id]) => id !== treeId)
  );
  return {
    ...data,
    trees,
    people: data.people.filter((person) => person.treeId !== treeId),
    relationships: data.relationships.filter((item) => item.treeId !== treeId),
    selectedTreeId:
      data.selectedTreeId === treeId ? trees[0]?.id : data.selectedTreeId,
    viewports
  };
}

export function selectTree(data: AppData, treeId?: string): AppData {
  if (treeId) findTree(data, treeId);
  return data.selectedTreeId === treeId ? data : { ...data, selectedTreeId: treeId };
}
export function createPerson(
  data: AppData, treeId: string, input: NewPersonInput,
  meta: DomainMeta = {}
): AppData {
  findTree(data, treeId);
  const { id, now } = resolvedMeta(meta);
  if (data.people.some((person) => person.id === id)) {
    throw new DomainError("invalidData", "A person with this ID already exists.");
  }
  validateLifeDates(input.birthDate, input.deathDate);
  const roleGender = input.role && DIRECT_ROLE_DEFAULTS[input.role].gender;
  const person: Person = {
    id,
    treeId,
    displayName: requiredName(input.displayName),
    gender: input.gender ?? roleGender ?? "unspecified",
    createdAt: now,
    birthDatePrecision: input.birthDatePrecision ?? "exact",
    notes: input.notes?.trim() ?? "",
    addressLine: input.addressLine?.trim() ?? "",
    city: input.city?.trim() ?? "",
    province: input.province?.trim() ?? "",
    country: input.country?.trim() ?? "",
    postalCode: input.postalCode?.trim() ?? "",
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    ...(input.deathDate ? { deathDate: input.deathDate } : {}),
    ...(input.photoDataUrl ? { photoDataUrl: input.photoDataUrl } : {})
  };
  return touchTree({ ...data, people: [...data.people, person] }, treeId, now);
}

export function updatePerson(
  data: AppData, personId: string, changes: PersonChanges,
  now = new Date().toISOString()
): AppData {
  const person = findPerson(data, personId);
  const next: Person = {
    ...person,
    ...changes,
    id: person.id,
    treeId: person.treeId,
    createdAt: person.createdAt,
    displayName: changes.displayName === undefined
      ? person.displayName
      : requiredName(changes.displayName),
    gender: changes.gender ?? person.gender,
    birthDatePrecision: changes.birthDatePrecision ?? person.birthDatePrecision,
    notes: changes.notes === undefined ? person.notes : changes.notes.trim(),
    addressLine: changes.addressLine?.trim() ?? person.addressLine,
    city: changes.city === undefined ? person.city : changes.city.trim(),
    province: changes.province?.trim() ?? person.province,
    country: changes.country === undefined ? person.country : changes.country.trim(),
    postalCode: changes.postalCode?.trim() ?? person.postalCode
  };
  validateLifeDates(next.birthDate, next.deathDate);
  return touchTree(
    {
      ...data,
      people: data.people.map((item) => (item.id === personId ? next : item))
    },
    person.treeId,
    now
  );
}

export function deletePerson(
  data: AppData, personId: string,
  now = new Date().toISOString()
): AppData {
  const person = findPerson(data, personId);
  const people = data.people.filter((item) => item.id !== personId);
  const fallback = people.find((item) => item.treeId === person.treeId)?.id;
  return {
    ...data,
    people,
    relationships: data.relationships.filter(
      (item) => item.fromPersonId !== personId && item.toPersonId !== personId
    ),
    trees: data.trees.map((tree) =>
      tree.id === person.treeId
        ? {
            ...tree,
            updatedAt: now,
            lastSelectedPersonId: tree.lastSelectedPersonId === personId
              ? fallback
              : tree.lastSelectedPersonId
          }
        : tree
    )
  };
}

export function selectPerson(data: AppData, personId?: string): AppData {
  const treeId = personId
    ? findPerson(data, personId).treeId
    : data.selectedTreeId;
  if (!treeId) return data;
  findTree(data, treeId);
  const tree = data.trees.find((item) => item.id === treeId)!;
  if (tree.lastSelectedPersonId === personId && data.selectedTreeId === treeId) {
    return data;
  }
  return {
    ...data,
    selectedTreeId: treeId,
    trees: data.trees.map((item) =>
      item.id === treeId ? { ...item, lastSelectedPersonId: personId } : item
    )
  };
}

export function relationshipEndpoints(
  personId: string, relativePersonId: string, role: DirectRole
) {
  const defaults = directRoleDefaults(role);
  if (defaults.kind === "parent" && defaults.relativeIsParent) {
    return { fromPersonId: relativePersonId, toPersonId: personId, ...defaults };
  }
  if (defaults.kind === "parent") {
    return { fromPersonId: personId, toPersonId: relativePersonId, ...defaults };
  }
  const [fromPersonId, toPersonId] = [personId, relativePersonId].sort();
  return { fromPersonId, toPersonId, ...defaults };
}

const relationshipSignature = (
  kind: RelationshipKind, fromPersonId: string, toPersonId: string
) => {
  const endpoints =
    kind === "parent"
      ? [fromPersonId, toPersonId]
      : [fromPersonId, toPersonId].sort();
  return `${kind}|${endpoints[0]}|${endpoints[1]}`;
};

export function addRelationship(
  data: AppData, personId: string, relativePersonId: string, role: DirectRole,
  marriageDate?: string,
  meta: DomainMeta = {},
  divorceDate?: string
): AppData {
  if (personId === relativePersonId) throw new DomainError("selfRelationship");
  const person = findPerson(data, personId);
  const relative = findPerson(data, relativePersonId);
  if (person.treeId !== relative.treeId) {
    throw new DomainError("crossTreeRelationship");
  }
  const endpoints = relationshipEndpoints(personId, relativePersonId, role);
  const signature = relationshipSignature(
    endpoints.kind, endpoints.fromPersonId, endpoints.toPersonId
  );
  if (
    data.relationships.some(
      (item) =>
        item.treeId === person.treeId &&
        relationshipSignature(item.kind, item.fromPersonId, item.toPersonId) === signature
    )
  ) {
    throw new DomainError("duplicateRelationship");
  }
  const { id, now } = resolvedMeta(meta);
  if (data.relationships.some((item) => item.id === id)) {
    throw new DomainError("invalidData", "A relationship with this ID already exists.");
  }
  const relationship: FamilyRelationship = {
    id,
    treeId: person.treeId,
    fromPersonId: endpoints.fromPersonId,
    toPersonId: endpoints.toPersonId,
    kind: endpoints.kind,
    subtype: endpoints.subtype,
    createdAt: now,
    ...(isPartnerRole(role)
      ? relationshipDates(endpoints.subtype, marriageDate, divorceDate)
      : {})
  };
  return touchTree(
    { ...data, relationships: [...data.relationships, relationship] },
    person.treeId,
    now
  );
}

export function removeRelationship(
  data: AppData, relationshipId: string,
  now = new Date().toISOString()
): AppData {
  const relationship = data.relationships.find((item) => item.id === relationshipId);
  if (!relationship) throw new DomainError("notFound");
  return touchTree(
    {
      ...data,
      relationships: data.relationships.filter((item) => item.id !== relationshipId)
    },
    relationship.treeId,
    now
  );
}

export function setLanguage(data: AppData, language: AppLanguage): AppData {
  if (language !== "en" && language !== "id") throw new DomainError("invalidData");
  return data.language === language ? data : { ...data, language };
}

export function setViewport(
  data: AppData, treeId: string, viewport: ViewportState
): AppData {
  findTree(data, treeId);
  if (
    !Number.isFinite(viewport.scrollX) ||
    !Number.isFinite(viewport.scrollY) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    throw new DomainError("invalidData", "The viewport is invalid.");
  }
  const current = data.viewports[treeId];
  if (
    current?.scrollX === viewport.scrollX &&
    current.scrollY === viewport.scrollY &&
    current.zoom === viewport.zoom
  ) {
    return data;
  }
  return {
    ...data,
    viewports: { ...data.viewports, [treeId]: { ...viewport } }
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasStrings = (value: unknown, fields: string[]) =>
  isRecord(value) && fields.every((field) => typeof value[field] === "string");

export function assertAppData(value: unknown): asserts value is AppData {
  if (!isRecord(value) || value.version !== 1 || !["en", "id"].includes(String(value.language))) {
    throw new DomainError("invalidData");
  }
  if (!Array.isArray(value.trees) || !Array.isArray(value.people) ||
      !Array.isArray(value.relationships) || !isRecord(value.viewports)) {
    throw new DomainError("invalidData");
  }
  const data = value as unknown as AppData;
  if (!data.trees.every((tree) =>
        hasStrings(tree, ["id", "title", "createdAt", "updatedAt"])) ||
      !data.people.every((person) =>
        hasStrings(person, ["id", "treeId", "displayName", "createdAt", "notes",
          "addressLine", "city", "province", "country", "postalCode"]) &&
        ["female", "male", "unspecified"].includes(String(person.gender)) &&
        ["exact", "month", "year"].includes(String(person.birthDatePrecision))) ||
      !data.relationships.every((item) =>
        hasStrings(item, ["id", "treeId", "fromPersonId", "toPersonId", "createdAt"]) &&
        ["parent", "partner", "sibling"].includes(String(item.kind)) &&
        ["biologicalParent", "adoptiveParent", "fosterParent", "guardian", "stepParent",
          "partner", "spouse", "formerPartner", "formerSpouse", "sibling", "halfSibling",
          "adoptiveSibling", "fosterSibling", "stepSibling"].includes(String(item.subtype)) &&
        VALID_SUBTYPES[item.kind]?.includes(item.subtype))) {
    throw new DomainError("invalidData");
  }
  const treeIds = data.trees.map((tree) => tree.id);
  const personIds = data.people.map((person) => person.id);
  const relationshipIds = data.relationships.map((item) => item.id);
  if (new Set(treeIds).size !== treeIds.length ||
      new Set(personIds).size !== personIds.length ||
      new Set(relationshipIds).size !== relationshipIds.length) {
    throw new DomainError("invalidData", "Family tree IDs must be unique.");
  }
  const trees = new Set(treeIds);
  const people = new Map(data.people.map((person) => [person.id, person]));
  if (data.trees.some((tree) => !tree.id || !tree.title || !tree.createdAt || !tree.updatedAt) ||
      data.people.some((person) => !person.id || !person.displayName || !trees.has(person.treeId))) {
    throw new DomainError("invalidData");
  }
  const signatures = new Set<string>();
  for (const relationship of data.relationships) {
    const from = people.get(relationship.fromPersonId);
    const to = people.get(relationship.toPersonId);
    const signature = `${relationship.treeId}|${relationshipSignature(
      relationship.kind,
      relationship.fromPersonId,
      relationship.toPersonId
    )}`;
    if (!from || !to || from.id === to.id || from.treeId !== relationship.treeId ||
        to.treeId !== relationship.treeId || signatures.has(signature)) {
      throw new DomainError("invalidData");
    }
    signatures.add(signature);
  }
  if (data.selectedTreeId && !trees.has(data.selectedTreeId)) {
    throw new DomainError("invalidData");
  }
  for (const tree of data.trees) {
    if (tree.lastSelectedPersonId && people.get(tree.lastSelectedPersonId)?.treeId !== tree.id) {
      throw new DomainError("invalidData");
    }
  }
  for (const [treeId, viewport] of Object.entries(data.viewports)) {
    if (!trees.has(treeId) || !isRecord(viewport) ||
        !Number.isFinite(viewport.scrollX) || !Number.isFinite(viewport.scrollY) ||
        !Number.isFinite(viewport.zoom) || Number(viewport.zoom) <= 0) {
      throw new DomainError("invalidData");
    }
  }
}

export function replaceAppData(value: unknown): AppData {
  assertAppData(value);
  return {
    ...value,
    trees: value.trees.map((tree) => ({ ...tree })),
    people: value.people.map((person) => ({ ...person })),
    relationships: value.relationships.map((item) => ({ ...item })),
    viewports: Object.fromEntries(
      Object.entries(value.viewports).map(([id, viewport]) => [id, { ...viewport }])
    )
  };
}

export const importAppData = replaceAppData;
