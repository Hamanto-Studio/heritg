import { encodeBase64, parsePlistDictionary } from "rork-plist";

import { newId, RELATIONSHIP_LANGUAGES, RELATIONSHIP_TERMINOLOGIES } from "./types";
import { downloadBlob, downloadText, safeFilename } from "./images";
import {
  DEFAULT_EXPORT_PRIVACY_SELECTION,
  prepareDataForExport,
  type ExportPrivacySelection
} from "./exportPrivacy";
import type { AppData, FamilyRelationship, FamilyTree, Gender, Person, RelationshipKind, RelationshipSubtype } from "./types";
export { downloadBlob, downloadText, safeFilename };
export const HERITG_FORMAT = "heritg-web-backup";
export const HERITG_SCHEMA_VERSION = 1;
export const MAX_PORTABILITY_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 450_000;
const MAX_FIELD_LENGTH = 4_096;
const MAX_NOTES_LENGTH = 1_024 * 1_024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const NATIVE_HEADER_BYTES = 10;
const NATIVE_ENVELOPE_VERSION = 1;
const NATIVE_MAGIC = "HERITG00";
const NATIVE_ENCRYPTED_MAGIC = "HERITG01";
const GENDERS = ["female", "male", "unspecified"] as const;
const KINDS = ["parent", "partner", "sibling"] as const;
const SUBTYPES = [
  "biologicalParent", "adoptiveParent", "fosterParent", "guardian", "stepParent", "partner", "spouse",
  "formerPartner", "formerSpouse", "sibling", "halfSibling", "adoptiveSibling", "fosterSibling", "stepSibling"
] as const;
const SUBTYPES_BY_KIND: Record<RelationshipKind, ReadonlySet<RelationshipSubtype>> = {
  parent: new Set(SUBTYPES.slice(0, 5)), partner: new Set(SUBTYPES.slice(5, 9)),
  sibling: new Set(SUBTYPES.slice(9))
};
const PRECISIONS = ["exact", "month", "year"] as const;
<<<<<<< HEAD
=======
const RELATIONSHIP_TERMINOLOGIES = [
  "id", "jv-yogyakarta", "jv-east-java", "btm-mandailing", "akb-angkola"
] as const;
const RELATIONSHIP_LANGUAGES = ["en", ...RELATIONSHIP_TERMINOLOGIES] as const;
>>>>>>> fcd9ccd (Web: Add Heritg Family plan preview)
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
type JsonObject = Record<string, unknown>;
type IdFactory = () => string;
type PartnerSubtype = Extract<
  RelationshipSubtype,
  "partner" | "spouse" | "formerPartner" | "formerSpouse"
>;
export type HeritgBackup = { format: typeof HERITG_FORMAT; schemaVersion: 1; exportedAt: string; data: AppData };
export type BackupImportOptions = { into?: AppData; idFactory?: IdFactory };
export interface ParsedGedcomPerson {
  sourceId: string;
  displayName: string;
  gender: Gender;
  birthDate?: string; deathDate?: string;
  birthDatePrecision: Person["birthDatePrecision"];
  city: string;
  associations: {
    sourceId: string;
    kind: RelationshipKind;
    subtype: RelationshipSubtype;
  }[];
}
export interface ParsedGedcomFamily {
  parents: string[]; children: string[]; married: boolean;
  marriageDate?: string;
  divorced: boolean;
  divorceDate?: string;
  partnerSubtype?: PartnerSubtype;
  hasHusband?: true;
  hasWife?: true;
}
export type ParsedGedcom = {
  people: ParsedGedcomPerson[];
  families: ParsedGedcomFamily[];
  source?: string;
};
export type GedcomImportOptions = { title?: string; language?: AppData["language"]; idFactory?: IdFactory; now?: Date | string };
const invalid = (message: string): never => {
  throw new Error(`Invalid portability data: ${message}`);
};
const objectValue = (value: unknown, label: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  return value as JsonObject;
};
const arrayValue = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) invalid(`${label} must be a bounded array.`);
  return value as unknown[];
};
const textValue = (value: unknown, label: string, maximum = MAX_FIELD_LENGTH): string => {
  if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    invalid(`${label} must be valid text.`);
  }
  return value as string;
};
const optionalId = (value: unknown, label: string): string | undefined =>
  value === undefined ? undefined : idValue(value, label);
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(`${label} is unsupported.`);
  return value as T;
};
const idValue = (value: unknown, label: string): string => {
  const id = textValue(value, label);
  if (!id.trim()) invalid(`${label} is malformed.`);
  return id;
};
const validDateParts = (year: number, month: number, day: number): boolean => {
  const comparableYear = year < 100 ? year + 400 : year;
  const date = new Date(Date.UTC(comparableYear, month - 1, day));
  return year >= 1 && date.getUTCFullYear() === comparableYear && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const dateValue = (value: unknown, label: string): string => {
  const valueText = textValue(value, label, 64);
  const partial = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(valueText);
  if (partial) {
    const year = Number(partial[1]);
    const month = Number(partial[2] ?? 1);
    const day = Number(partial[3] ?? 1);
    if (validDateParts(year, month, day)) return valueText;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T/.exec(valueText);
  if (iso && validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) && Number.isFinite(Date.parse(valueText))) {
    return valueText;
  }
  return invalid(`${label} must be an ISO date.`);
};
const optionalDate = (value: unknown, label: string): string | undefined =>
  value === undefined ? undefined : dateValue(value, label);
const optionalPositiveInteger = (value: unknown, label: string): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid(`${label} must be a positive whole number.`);
  return value as number;
};
const optionalCalendarDate = (value: unknown, label: string): string | undefined => {
  if (value === undefined) return undefined;
  const result = textValue(value, label, 10);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!parts || !validDateParts(Number(parts[1]), Number(parts[2]), Number(parts[3]))) {
    invalid(`${label} must use YYYY-MM-DD.`);
  }
  return result;
};
const nativeDateValue = (value: unknown, label: string, dateOnly = false): string => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(`${label} must be a valid date.`);
  const iso = (value as Date).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
};
const optionalNativeDate = (value: unknown, label: string, dateOnly = false): string | undefined =>
  value === undefined ? undefined : nativeDateValue(value, label, dateOnly);
const photoValue = (value: unknown, label: string): string | undefined => {
  if (value === undefined) return undefined;
  const photo = textValue(value, label, Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 64);
  const match = /^data:(?:image\/(?:jpeg|png|webp|gif|heic)|application\/octet-stream);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match || match[1].length % 4 !== 0 || Math.floor(match[1].length * 3 / 4) > MAX_PHOTO_BYTES) {
    invalid(`${label} must be a bounded raster image data URL.`);
  }
  return photo;
};
const nativePhotoValue = (value: unknown, label: string): string | undefined => {
  if (value === undefined) return undefined;
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > MAX_PHOTO_BYTES) {
    invalid(`${label} must be a bounded raster image.`);
  }
  const bytes = value as Uint8Array;
  let mime: "image/jpeg" | "image/png" | "image/webp" | undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
  else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = "image/png";
  else if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) mime = "image/webp";
  if (!mime) invalid(`${label} uses an unsupported image format.`);
  return `data:${mime};base64,${encodeBase64(bytes)}`;
};
const numberValue = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 10_000_000) invalid(`${label} is invalid.`);
  return value as number;
};
const uniqueIds = (items: { id: string }[], label: string): Set<string> => {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) invalid(`${label} IDs must be unique.`);
  return ids;
};
export function validateAppData(value: unknown): AppData {
  const root = objectValue(value, "data");
  if (root.version !== 1) invalid("data.version is unsupported.");
  const trees = arrayValue(root.trees, "data.trees").map((entry, index): FamilyTree => {
    const item = objectValue(entry, `tree ${index}`);
    return {
      id: idValue(item.id, `tree ${index}.id`),
      title: textValue(item.title, `tree ${index}.title`, 2_048),
      createdAt: dateValue(item.createdAt, `tree ${index}.createdAt`),
      updatedAt: dateValue(item.updatedAt, `tree ${index}.updatedAt`),
      lastSelectedPersonId: optionalId(item.lastSelectedPersonId, `tree ${index}.lastSelectedPersonId`)
    };
  });
  const people = arrayValue(root.people, "data.people").map((entry, index): Person => {
    const item = objectValue(entry, `person ${index}`);
    return {
      id: idValue(item.id, `person ${index}.id`),
      treeId: idValue(item.treeId, `person ${index}.treeId`),
      displayName: textValue(item.displayName, `person ${index}.displayName`, 2_048),
      gender: enumValue(item.gender, GENDERS, `person ${index}.gender`),
      createdAt: dateValue(item.createdAt, `person ${index}.createdAt`),
      birthDate: optionalDate(item.birthDate, `person ${index}.birthDate`),
      birthOrderOverride: optionalPositiveInteger(
        item.birthOrderOverride,
        `person ${index}.birthOrderOverride`
      ),
      deathDate: optionalDate(item.deathDate, `person ${index}.deathDate`),
      birthDatePrecision: enumValue(item.birthDatePrecision, PRECISIONS, `person ${index}.birthDatePrecision`),
      notes: textValue(item.notes, `person ${index}.notes`, MAX_NOTES_LENGTH),
      addressLine: textValue(item.addressLine, `person ${index}.addressLine`),
      city: textValue(item.city, `person ${index}.city`),
      province: textValue(item.province, `person ${index}.province`),
      country: textValue(item.country, `person ${index}.country`),
      postalCode: textValue(item.postalCode, `person ${index}.postalCode`, 256),
      photoDataUrl: photoValue(item.photoDataUrl, `person ${index}.photoDataUrl`)
    };
  });
  const relationships = arrayValue(root.relationships, "data.relationships").map((entry, index): FamilyRelationship => {
    const item = objectValue(entry, `relationship ${index}`);
    const subtype = enumValue(item.subtype, SUBTYPES, `relationship ${index}.subtype`);
    const marriageDate = optionalDate(item.marriageDate, `relationship ${index}.marriageDate`);
    const isFormer = subtype === "formerPartner" || subtype === "formerSpouse";
    const divorceDate = isFormer
      ? optionalCalendarDate(item.divorceDate, `relationship ${index}.divorceDate`)
      : undefined;
    if (marriageDate && divorceDate && divorceDate < marriageDate.slice(0, 10)) {
      invalid(`relationship ${index}.divorceDate cannot be earlier than marriageDate.`);
    }
    return {
      id: idValue(item.id, `relationship ${index}.id`),
      treeId: idValue(item.treeId, `relationship ${index}.treeId`),
      fromPersonId: idValue(item.fromPersonId, `relationship ${index}.fromPersonId`),
      toPersonId: idValue(item.toPersonId, `relationship ${index}.toPersonId`),
      kind: enumValue(item.kind, KINDS, `relationship ${index}.kind`),
      subtype,
      createdAt: dateValue(item.createdAt, `relationship ${index}.createdAt`),
      marriageDate,
      ...(divorceDate ? { divorceDate } : {})
    };
  });
  if (trees.length + people.length + relationships.length > MAX_RECORDS) invalid("there are too many records.");
  const treeIds = uniqueIds(trees, "tree");
  const personIds = uniqueIds(people, "person");
  uniqueIds(relationships, "relationship");
  const personTrees = new Map(people.map((person) => [person.id, person.treeId]));
  for (const person of people) if (!treeIds.has(person.treeId)) invalid(`person ${person.id} references a missing tree.`);
  for (const tree of trees) {
    if (tree.lastSelectedPersonId && personTrees.get(tree.lastSelectedPersonId) !== tree.id) invalid(`tree ${tree.id} has an invalid selected person.`);
  }
  const relationshipSignatures = new Set<string>();
  for (const relationship of relationships) {
    if (!SUBTYPES_BY_KIND[relationship.kind].has(relationship.subtype)) invalid(`relationship ${relationship.id} has an invalid subtype.`);
    if (!treeIds.has(relationship.treeId) || !personIds.has(relationship.fromPersonId) || !personIds.has(relationship.toPersonId)) {
      invalid(`relationship ${relationship.id} has a missing endpoint.`);
    }
    if (relationship.fromPersonId === relationship.toPersonId || personTrees.get(relationship.fromPersonId) !== relationship.treeId || personTrees.get(relationship.toPersonId) !== relationship.treeId) {
      invalid(`relationship ${relationship.id} has invalid endpoints.`);
    }
    const endpoints = relationship.kind === "parent"
      ? [relationship.fromPersonId, relationship.toPersonId]
      : [relationship.fromPersonId, relationship.toPersonId].sort();
    const signature = `${relationship.kind}|${endpoints[0]}|${endpoints[1]}`;
    if (relationshipSignatures.has(signature)) invalid(`relationship ${relationship.id} duplicates existing semantics.`);
    relationshipSignatures.add(signature);
  }
  const selectedTreeId = optionalId(root.selectedTreeId, "data.selectedTreeId");
  if (selectedTreeId && !treeIds.has(selectedTreeId)) invalid("data.selectedTreeId references a missing tree.");
  const rawViewports = objectValue(root.viewports, "data.viewports");
  if (Object.keys(rawViewports).length > MAX_RECORDS) invalid("data.viewports has too many entries.");
  const viewports: AppData["viewports"] = {};
  for (const [treeId, entry] of Object.entries(rawViewports)) {
    if (!treeIds.has(treeId)) invalid(`viewport ${treeId} references a missing tree.`);
    const item = objectValue(entry, `viewport ${treeId}`);
    const zoom = numberValue(item.zoom, `viewport ${treeId}.zoom`);
    if (zoom <= 0 || zoom > 100) invalid(`viewport ${treeId}.zoom is invalid.`);
    viewports[treeId] = {
      scrollX: numberValue(item.scrollX, `viewport ${treeId}.scrollX`),
      scrollY: numberValue(item.scrollY, `viewport ${treeId}.scrollY`),
      zoom
    };
  }
  const language = enumValue(root.language, ["en", "id"], "data.language");
  const relationshipTerminology = enumValue(
    root.relationshipTerminology ?? "id",
    RELATIONSHIP_TERMINOLOGIES,
    "data.relationshipTerminology"
  );
  const relationshipLanguage = root.relationshipLanguage === undefined
    ? language === "en" ? "en" : relationshipTerminology
    : enumValue(
        root.relationshipLanguage,
        RELATIONSHIP_LANGUAGES,
        "data.relationshipLanguage"
      );
  return {
    version: 1,
    trees,
    people,
    relationships,
    selectedTreeId,
    language,
    relationshipLanguage,
    relationshipTerminology,
    viewports
  };
}
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;
const assertBoundedText = (value: string, label: string) => {
  if (byteLength(value) > MAX_PORTABILITY_BYTES) invalid(`${label} is larger than 32 MB.`);
};
export function exportHeritgBackup(data: AppData, exportedAt: Date | string = new Date()): string {
  const cleanData = validateAppData(data);
  const timestamp = timestampValue(exportedAt);
  const backup: HeritgBackup = { format: HERITG_FORMAT, schemaVersion: HERITG_SCHEMA_VERSION, exportedAt: timestamp, data: cleanData };
  const json = JSON.stringify(backup, null, 2);
  assertBoundedText(json, "backup");
  return json;
}
export function parseHeritgBackup(source: string): HeritgBackup {
  if (typeof source !== "string") invalid("backup must be text.");
  assertBoundedText(source, "backup");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return invalid("backup is not valid JSON.");
  }
  const root = objectValue(parsed, "backup");
  if (root.format !== HERITG_FORMAT || root.schemaVersion !== HERITG_SCHEMA_VERSION) invalid("backup schema is unsupported.");
  return {
    format: HERITG_FORMAT,
    schemaVersion: HERITG_SCHEMA_VERSION,
    exportedAt: dateValue(root.exportedAt, "backup.exportedAt"),
    data: validateAppData(root.data)
  };
}
const nextId = (factory: IdFactory, used: Set<string>): string => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = idValue(factory(), "generated ID");
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return invalid("the ID generator did not produce a unique ID.");
};
export const mergeImportedData = (imported: AppData, options: BackupImportOptions = {}): AppData => {
  const target = options.into ? validateAppData(options.into) : undefined;
  const used = new Set<string>(target ? [...target.trees, ...target.people, ...target.relationships].map((item) => item.id) : []);
  const factory = options.idFactory ?? newId;
  const treeIds = new Map(imported.trees.map((tree) => [tree.id, nextId(factory, used)]));
  const personIds = new Map(imported.people.map((person) => [person.id, nextId(factory, used)]));
  const relationshipIds = new Map(imported.relationships.map((relationship) => [relationship.id, nextId(factory, used)]));
  const remapped: AppData = {
    version: 1,
    trees: imported.trees.map((tree) => ({ ...tree, id: treeIds.get(tree.id)!, lastSelectedPersonId: tree.lastSelectedPersonId ? personIds.get(tree.lastSelectedPersonId) : undefined })),
    people: imported.people.map((person) => ({ ...person, id: personIds.get(person.id)!, treeId: treeIds.get(person.treeId)! })),
    relationships: imported.relationships.map((relationship) => ({ ...relationship, id: relationshipIds.get(relationship.id)!, treeId: treeIds.get(relationship.treeId)!, fromPersonId: personIds.get(relationship.fromPersonId)!, toPersonId: personIds.get(relationship.toPersonId)! })),
    selectedTreeId: imported.selectedTreeId ? treeIds.get(imported.selectedTreeId) : undefined,
    language: imported.language,
    relationshipLanguage: imported.relationshipLanguage,
    relationshipTerminology: imported.relationshipTerminology ?? "id",
    viewports: Object.fromEntries(Object.entries(imported.viewports).map(([treeId, viewport]) => [treeIds.get(treeId)!, viewport]))
  };
  if (!target) return validateAppData(remapped);
  return validateAppData({
    version: 1,
    trees: [...target.trees, ...remapped.trees],
    people: [...target.people, ...remapped.people],
    relationships: [...target.relationships, ...remapped.relationships],
    selectedTreeId: remapped.selectedTreeId ?? target.selectedTreeId,
    language: target.language,
    relationshipLanguage: target.relationshipLanguage,
    relationshipTerminology: target.relationshipTerminology ?? "id",
    viewports: { ...target.viewports, ...remapped.viewports }
  });
};
export function importHeritgBackup(source: string, options: BackupImportOptions = {}): AppData {
  return mergeImportedData(parseHeritgBackup(source).data, options);
}

const nativeMagic = (bytes: Uint8Array): string =>
  String.fromCharCode(...bytes.subarray(0, 8));

export function importNativeHeritgArchive(
  source: ArrayBuffer | Uint8Array,
  options: BackupImportOptions = {}
): AppData {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength < NATIVE_HEADER_BYTES || bytes.byteLength > MAX_PORTABILITY_BYTES) {
    return invalid("native archive must be between 10 bytes and 32 MB.");
  }
  const magic = nativeMagic(bytes);
  if (magic === NATIVE_ENCRYPTED_MAGIC) {
    throw new Error("Password-protected .heritg archives are not supported on the web yet.");
  }
  if (magic !== NATIVE_MAGIC) invalid("native archive header is invalid.");
  const envelopeVersion = (bytes[8] << 8) | bytes[9];
  if (envelopeVersion !== NATIVE_ENVELOPE_VERSION) invalid("native archive version is unsupported.");

  let payload: JsonObject;
  try {
    payload = objectValue(parsePlistDictionary(bytes.subarray(NATIVE_HEADER_BYTES), { maxDepth: 64 }), "archive");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid portability data:")) throw error;
    return invalid("native archive payload is invalid.");
  }
  if (payload.schemaVersion !== 1) invalid("native archive schema is unsupported.");
  const tree = objectValue(payload.tree, "archive.tree");
  const treeId = idValue(tree.id, "archive.tree.id");
  const people = arrayValue(payload.people, "archive.people").map((entry, index): Person => {
    const item = objectValue(entry, `archive.person ${index}`);
    return {
      id: idValue(item.id, `archive.person ${index}.id`),
      treeId: idValue(item.treeID, `archive.person ${index}.treeID`),
      displayName: textValue(item.displayName, `archive.person ${index}.displayName`, 2_048),
      gender: enumValue(item.genderRaw, GENDERS, `archive.person ${index}.genderRaw`),
      createdAt: nativeDateValue(item.createdAt, `archive.person ${index}.createdAt`),
      birthDate: optionalNativeDate(item.birthDate, `archive.person ${index}.birthDate`, true),
      deathDate: optionalNativeDate(item.deathDate, `archive.person ${index}.deathDate`, true),
      birthDatePrecision: enumValue(item.birthDatePrecisionRaw, PRECISIONS, `archive.person ${index}.birthDatePrecisionRaw`),
      notes: textValue(item.notes, `archive.person ${index}.notes`),
      addressLine: textValue(item.addressLine, `archive.person ${index}.addressLine`),
      city: textValue(item.city, `archive.person ${index}.city`),
      province: textValue(item.province, `archive.person ${index}.province`),
      country: textValue(item.country, `archive.person ${index}.country`),
      postalCode: textValue(item.postalCode, `archive.person ${index}.postalCode`, 256),
      photoDataUrl: nativePhotoValue(item.profilePhotoData, `archive.person ${index}.profilePhotoData`)
    };
  });
  const relationships = arrayValue(payload.relationships, "archive.relationships").map((entry, index): FamilyRelationship => {
    const item = objectValue(entry, `archive.relationship ${index}`);
    const subtype = enumValue(item.subtypeRaw, SUBTYPES, `archive.relationship ${index}.subtypeRaw`);
    const isFormer = subtype === "formerPartner" || subtype === "formerSpouse";
    return {
      id: idValue(item.id, `archive.relationship ${index}.id`),
      treeId: idValue(item.treeID, `archive.relationship ${index}.treeID`),
      fromPersonId: idValue(item.fromPersonID, `archive.relationship ${index}.fromPersonID`),
      toPersonId: idValue(item.toPersonID, `archive.relationship ${index}.toPersonID`),
      kind: enumValue(item.kindRaw, KINDS, `archive.relationship ${index}.kindRaw`),
      subtype,
      createdAt: nativeDateValue(item.createdAt, `archive.relationship ${index}.createdAt`),
      marriageDate: optionalNativeDate(item.marriageDate, `archive.relationship ${index}.marriageDate`, true),
      divorceDate: isFormer
        ? optionalNativeDate(item.divorceDate, `archive.relationship ${index}.divorceDate`, true)
        : undefined
    };
  });
  const imported = validateAppData({
    version: 1,
    trees: [{
      id: treeId,
      title: textValue(tree.title, "archive.tree.title", 2_048),
      createdAt: nativeDateValue(tree.createdAt, "archive.tree.createdAt"),
      updatedAt: nativeDateValue(tree.updatedAt, "archive.tree.updatedAt"),
      lastSelectedPersonId: optionalId(tree.lastSelectedPersonID, "archive.tree.lastSelectedPersonID")
    }],
    people,
    relationships,
    selectedTreeId: treeId,
    language: options.into?.language ?? "en",
    viewports: { [treeId]: { scrollX: 0, scrollY: 0, zoom: 1 } }
  });
  return mergeImportedData(imported, options);
}

const cleanGedcomValue = (value: string, maximum = 2_048): string =>
  textValue(value, "GEDCOM value", maximum).replace(/[\r\n@/]+/g, " ").replace(/\s+/g, " ").trim();

const parseGedcomDate = (value: string): { date: string; precision: Person["birthDatePrecision"] } | undefined => {
  const normalized = textValue(value, "GEDCOM date", 128).trim().toUpperCase().replace(/^(?:ABT|BEF|AFT|CAL|EST)\s+/, "");
  let match = /^(\d{4})$/.exec(normalized);
  if (match && validDateParts(Number(match[1]), 1, 1)) return { date: `${match[1]}-01-01`, precision: "year" };
  match = /^([A-Z]{3}) (\d{4})$/.exec(normalized);
  if (match) {
    const month = MONTHS.indexOf(match[1]) + 1;
    if (month && validDateParts(Number(match[2]), month, 1)) return { date: `${match[2]}-${String(month).padStart(2, "0")}-01`, precision: "month" };
  }
  match = /^(\d{1,2}) ([A-Z]{3}) (\d{4})$/.exec(normalized);
  if (match) {
    const month = MONTHS.indexOf(match[2]) + 1;
    const day = Number(match[1]);
    const year = Number(match[3]);
    if (month && validDateParts(year, month, day)) return { date: `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, precision: "exact" };
  }
  return undefined;
};

export function parseGedcom(source: string): ParsedGedcom {
  if (typeof source !== "string") invalid("GEDCOM must be text.");
  assertBoundedText(source, "GEDCOM");
  const people: ParsedGedcomPerson[] = [];
  const families: ParsedGedcomFamily[] = [];
  const sourceIds = new Set<string>();
  let gedcomSource: string | undefined;
  let currentHeader = false;
  let currentPerson: ParsedGedcomPerson | undefined;
  let currentFamily: ParsedGedcomFamily | undefined;
  let associationPointer: string | undefined;
  let event: "birth" | "death" | "address" | "marriage" | "divorce" | undefined;
  let referenceCount = 0;
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > MAX_RECORDS * 4) invalid("GEDCOM has too many lines.");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw) continue;
    if (raw.length > MAX_FIELD_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) invalid(`GEDCOM line ${index + 1} is malformed.`);
    const match = /^(\d{1,2}) (?:@([^@\s]{1,128})@ )?([A-Za-z0-9_]{1,31})(?: (.*))?$/.exec(raw);
    if (!match) return invalid(`GEDCOM line ${index + 1} is malformed.`);
    const level = Number(match[1]);
    const xref = match[2];
    const tag = match[3].toUpperCase();
    const value = match[4] ?? "";
    if (level === 0) {
      currentHeader = tag === "HEAD";
      currentPerson = undefined;
      currentFamily = undefined;
      associationPointer = undefined;
      event = undefined;
      if (tag === "INDI" || tag === "FAM") {
        if (!xref || sourceIds.has(xref)) invalid(`GEDCOM record on line ${index + 1} has a duplicate or missing ID.`);
        sourceIds.add(xref);
        if (tag === "INDI") {
          currentPerson = {
            sourceId: xref,
            displayName: "Unnamed person",
            gender: "unspecified",
            birthDatePrecision: "exact",
            city: "",
            associations: []
          };
          people.push(currentPerson);
        } else {
          currentFamily = { parents: [], children: [], married: false, divorced: false };
          families.push(currentFamily);
        }
        if (people.length + families.length > MAX_RECORDS) invalid("GEDCOM has too many records.");
      }
      continue;
    }
    if (currentHeader && level === 1 && tag === "SOUR") {
      gedcomSource = cleanGedcomValue(value);
    }
    if (level === 1) {
      event = undefined;
      associationPointer = undefined;
    }
    if (currentPerson) {
      if (level === 1 && tag === "NAME") currentPerson.displayName = cleanGedcomValue(value) || "Unnamed person";
      else if (level === 1 && tag === "SEX") currentPerson.gender = value.toUpperCase() === "M" ? "male" : value.toUpperCase() === "F" ? "female" : "unspecified";
      else if (level === 1 && tag === "BIRT") event = "birth";
      else if (level === 1 && tag === "DEAT") event = "death";
      else if (level === 1 && tag === "ADDR") event = "address";
      else if (level === 1 && tag === "ASSO") {
        associationPointer = /^@([^@\s]{1,128})@$/.exec(value)?.[1];
        if (!associationPointer) return invalid(`GEDCOM pointer on line ${index + 1} is malformed.`);
      } else if (level === 2 && tag === "RELA" && associationPointer) {
        const subtype = SUBTYPES.find((candidate) => candidate === cleanGedcomValue(value));
        const kind = subtype && KINDS.find((candidate) => SUBTYPES_BY_KIND[candidate].has(subtype));
        if (kind && subtype) {
          if (!currentPerson.associations.some((association) =>
            association.sourceId === associationPointer &&
            association.kind === kind && association.subtype === subtype
          )) {
            currentPerson.associations.push({ sourceId: associationPointer, kind, subtype });
            if (++referenceCount > MAX_RECORDS) invalid("GEDCOM has too many family references.");
          }
        }
      }
      else if (level === 2 && tag === "DATE" && (event === "birth" || event === "death")) {
        const parsed = parseGedcomDate(value);
        if (parsed && event === "birth") {
          currentPerson.birthDate = parsed.date;
          currentPerson.birthDatePrecision = parsed.precision;
        } else if (parsed) currentPerson.deathDate = parsed.date;
      } else if (level === 2 && tag === "CITY" && event === "address") currentPerson.city = cleanGedcomValue(value);
    } else if (currentFamily) {
      if (level === 1 && (tag === "HUSB" || tag === "WIFE" || tag === "CHIL")) {
        const pointer = /^@([^@\s]{1,128})@$/.exec(value)?.[1];
        if (!pointer) return invalid(`GEDCOM pointer on line ${index + 1} is malformed.`);
        const list = tag === "CHIL" ? currentFamily.children : currentFamily.parents;
        if (tag === "HUSB") currentFamily.hasHusband = true;
        if (tag === "WIFE") currentFamily.hasWife = true;
        if (!list.includes(pointer)) {
          list.push(pointer);
          if (++referenceCount > MAX_RECORDS) invalid("GEDCOM has too many family references.");
        }
      } else if (level === 1 && tag === "MARR") {
        currentFamily.married = true;
        event = "marriage";
      } else if (level === 1 && tag === "DIV") {
        currentFamily.divorced = true;
        event = "divorce";
      } else if (level === 1 && tag === "_HERITG_SUBTYPE") {
        const subtype = SUBTYPES.find((candidate): candidate is PartnerSubtype =>
          candidate === value && SUBTYPES_BY_KIND.partner.has(candidate)
        );
        if (subtype) currentFamily.partnerSubtype = subtype;
      } else if (level === 2 && tag === "DATE" && event === "marriage") {
        currentFamily.marriageDate = parseGedcomDate(value)?.date;
      } else if (level === 2 && tag === "DATE" && event === "divorce") {
        currentFamily.divorceDate = parseGedcomDate(value)?.date;
      }
    }
  }
  if (!people.length) invalid("GEDCOM contains no people.");
  const personIds = new Set(people.map((person) => person.sourceId));
  for (const person of people) {
    for (const association of person.associations) {
      if (!personIds.has(association.sourceId)) {
        invalid(`GEDCOM association references missing person ${association.sourceId}.`);
      }
      if (association.sourceId === person.sourceId) invalid("GEDCOM contains a self relationship.");
    }
  }
  for (const family of families) {
    if (family.parents.length > 2) invalid("GEDCOM family has more than two parents.");
    for (const id of [...family.parents, ...family.children]) if (!personIds.has(id)) invalid(`GEDCOM family references missing person ${id}.`);
    if (family.parents.some((id) => family.children.includes(id))) invalid("GEDCOM family contains a self relationship.");
  }
  return { people, families, source: gedcomSource };
}

const formatGedcomDate = (value: string, precision?: Person["birthDatePrecision"]): string | undefined => {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value);
  if (!match) return undefined;
  if (precision === "year" || !match[2]) return match[1];
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return undefined;
  if (precision === "month" || !match[3]) return `${month} ${match[1]}`;
  return `${Number(match[3])} ${month} ${match[1]}`;
};

interface ExportFamily {
  parents: string[];
  children: string[];
  married: boolean;
  partnerSubtype?: PartnerSubtype;
  marriageDate?: string;
  divorced?: boolean;
  divorceDate?: string;
}

export function exportGedcom(
  data: AppData,
  treeId = data.selectedTreeId,
  privacy: ExportPrivacySelection = DEFAULT_EXPORT_PRIVACY_SELECTION
): string {
  if (!treeId) return invalid("a valid tree is required for GEDCOM export.");
  const clean = validateAppData(prepareDataForExport(data, treeId, privacy).data);
  const tree = clean.trees.find((item) => item.id === treeId);
  if (!tree) return invalid("a valid tree is required for GEDCOM export.");
  const people = clean.people.filter((person) => person.treeId === tree.id);
  const relationships = clean.relationships.filter((relationship) => relationship.treeId === tree.id);
  const personById = new Map(people.map((person) => [person.id, person]));
  const gedcomIds = new Map(people.map((person, index) => [person.id, `I${index + 1}`]));
  const lines = [
    "0 HEAD",
    "1 GEDC",
    "2 VERS 7.0",
    "1 CHAR UTF-8",
    "1 SOUR HERITG-WEB",
    "1 SCHMA",
    "2 TAG _HERITG_SUBTYPE https://heritg.us/gedcom/relationship-subtype",
    `1 FILE ${cleanGedcomValue(safeFilename(tree.title, "ged"))}`
  ];
  for (const person of people) {
    lines.push(`0 @${gedcomIds.get(person.id)}@ INDI`, `1 NAME ${cleanGedcomValue(person.displayName) || "Unnamed person"}`, `1 SEX ${person.gender === "male" ? "M" : person.gender === "female" ? "F" : "U"}`);
    const birth = person.birthDate && formatGedcomDate(person.birthDate, person.birthDatePrecision);
    const death = person.deathDate && formatGedcomDate(person.deathDate);
    if (birth) lines.push("1 BIRT", `2 DATE ${birth}`);
    if (death) lines.push("1 DEAT", `2 DATE ${death}`);
    if (person.city.trim()) lines.push("1 ADDR", `2 CITY ${cleanGedcomValue(person.city)}`);
    for (const relationship of relationships.filter((item) =>
      item.fromPersonId === person.id &&
      (item.kind === "sibling" ||
        (item.kind === "parent" && item.subtype !== "biologicalParent"))
    )) {
      lines.push(
        `1 ASSO @${gedcomIds.get(relationship.toPersonId)}@`,
        `2 RELA ${relationship.subtype}`
      );
    }
  }
  const parentEdges = new Map(relationships
    .filter((item) => item.kind === "parent" && item.subtype === "biologicalParent")
    .map((item) => [`${item.fromPersonId}\u0000${item.toPersonId}`, item]));
  const childrenByParent = new Map<string, Set<string>>();
  for (const relationship of parentEdges.values()) {
    const children = childrenByParent.get(relationship.fromPersonId) ?? new Set<string>();
    children.add(relationship.toPersonId);
    childrenByParent.set(relationship.fromPersonId, children);
  }
  const families = new Map<string, ExportFamily>();
  for (const relationship of relationships.filter((item) => item.kind === "partner")) {
    const parents = [relationship.fromPersonId, relationship.toPersonId].sort();
    const key = parents.join("\u0000");
    const family = families.get(key) ?? { parents, children: [], married: false };
    family.partnerSubtype ??= relationship.subtype as PartnerSubtype;
    family.married ||= Boolean(relationship.marriageDate) || relationship.subtype === "spouse" || relationship.subtype === "formerSpouse";
    family.marriageDate ??= relationship.marriageDate;
    family.divorced ||= relationship.subtype === "formerPartner" || relationship.subtype === "formerSpouse";
    family.divorceDate ??= relationship.divorceDate;
    families.set(key, family);
  }
  for (const family of families.values()) {
    const [first, second] = family.parents;
    for (const childId of childrenByParent.get(first) ?? []) {
      if (!childrenByParent.get(second)?.has(childId)) continue;
      family.children.push(childId);
      parentEdges.delete(`${first}\u0000${childId}`);
      parentEdges.delete(`${second}\u0000${childId}`);
    }
  }
  const singleParentFamilies = new Map<string, ExportFamily>();
  for (const relationship of parentEdges.values()) {
    const family = singleParentFamilies.get(relationship.fromPersonId) ?? { parents: [relationship.fromPersonId], children: [], married: false };
    if (!family.children.includes(relationship.toPersonId)) family.children.push(relationship.toPersonId);
    singleParentFamilies.set(relationship.fromPersonId, family);
  }
  const exportFamilies = [...families.values(), ...singleParentFamilies.values()];
  exportFamilies.forEach((family, index) => {
    lines.push(`0 @F${index + 1}@ FAM`);
    family.parents.forEach((id, parentIndex) => {
      const person = personById.get(id)!;
      const tag = person.gender === "female" ? "WIFE" : person.gender === "male" ? "HUSB" : parentIndex ? "WIFE" : "HUSB";
      lines.push(`1 ${tag} @${gedcomIds.get(id)}@`);
    });
    if (family.partnerSubtype) lines.push(`1 _HERITG_SUBTYPE ${family.partnerSubtype}`);
    family.children.forEach((id) => lines.push(`1 CHIL @${gedcomIds.get(id)}@`));
    if (family.married) {
      lines.push("1 MARR");
      const date = family.marriageDate && formatGedcomDate(family.marriageDate);
      if (date) lines.push(`2 DATE ${date}`);
    }
    if (family.divorced) {
      lines.push("1 DIV");
      const date = family.divorceDate && formatGedcomDate(family.divorceDate);
      if (date) lines.push(`2 DATE ${date}`);
    }
  });
  lines.push("0 TRLR");
  const result = `${lines.join("\r\n")}\r\n`;
  assertBoundedText(result, "GEDCOM");
  return result;
}

const timestampValue = (value: Date | string | undefined): string => {
  const timestamp = value ?? new Date();
  if (timestamp instanceof Date) {
    if (!Number.isFinite(timestamp.getTime())) invalid("timestamp is invalid.");
    return timestamp.toISOString();
  }
  return dateValue(timestamp, "timestamp");
};

export function importGedcom(source: string, options: GedcomImportOptions = {}): AppData {
  const parsed = parseGedcom(source);
  const legacyHeritg = /^(?:heritg|heritg-web)$/i.test(parsed.source ?? "") &&
    !parsed.families.some((family) => family.partnerSubtype);
  const factory = options.idFactory ?? newId;
  const used = new Set<string>();
  const treeId = nextId(factory, used);
  const personIds = new Map(parsed.people.map((person) => [person.sourceId, nextId(factory, used)]));
  const createdAt = timestampValue(options.now);
  const people: Person[] = parsed.people.map((person) => ({
    id: personIds.get(person.sourceId)!, treeId, displayName: person.displayName,
    gender: person.gender, createdAt, birthDate: person.birthDate, deathDate: person.deathDate,
    birthDatePrecision: person.birthDatePrecision, notes: "", addressLine: "", city: person.city,
    province: "", country: "", postalCode: ""
  }));
  const relationships: FamilyRelationship[] = [];
  const signatures = new Set<string>();
  const appendRelationship = (
    from: string,
    to: string,
    kind: RelationshipKind,
    subtype: RelationshipSubtype,
    marriageDate?: string,
    divorceDate?: string
  ) => {
    const signature = kind === "partner" ? `${kind}|${[from, to].sort().join("|")}` : `${kind}|${from}|${to}`;
    if (signatures.has(signature)) return;
    signatures.add(signature);
    if (relationships.length >= MAX_RECORDS) invalid("GEDCOM creates too many relationships.");
    relationships.push({
      id: nextId(factory, used), treeId, fromPersonId: from, toPersonId: to,
      kind, subtype, createdAt, marriageDate, divorceDate
    });
  };
  for (const family of parsed.families) {
    const parents = family.parents.map((id) => personIds.get(id)!);
    const children = family.children.map((id) => personIds.get(id)!);
    if (parents.length === 2) {
      const legacySpouse = legacyHeritg && family.hasHusband && family.hasWife;
      const subtype: RelationshipSubtype = family.partnerSubtype ?? (family.divorced
        ? family.married || legacySpouse ? "formerSpouse" : "formerPartner"
        : family.married || legacySpouse ? "spouse" : "partner");
      appendRelationship(
        parents[0], parents[1], "partner", subtype,
        family.marriageDate, family.divorceDate
      );
    }
    for (const parent of parents) for (const child of children) appendRelationship(parent, child, "parent", "biologicalParent");
  }
  for (const person of parsed.people) {
    const from = personIds.get(person.sourceId)!;
    for (const association of person.associations) {
      const to = personIds.get(association.sourceId)!;
      appendRelationship(from, to, association.kind, association.subtype);
    }
  }
  const title = cleanGedcomValue(options.title ?? "Imported Family Tree") || "Imported Family Tree";
  return validateAppData({
    version: 1,
    trees: [{ id: treeId, title, createdAt, updatedAt: createdAt, lastSelectedPersonId: people[0]?.id }],
    people,
    relationships,
    selectedTreeId: treeId,
    language: options.language ?? "en",
    viewports: {}
  });
}
