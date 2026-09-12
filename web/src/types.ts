import { browserAppLanguage, type AppLanguage } from "./locale";
export type Gender = "female" | "male" | "unspecified";
export const RELATIONSHIP_TERMINOLOGIES = [
  "id",
  "jv-yogyakarta",
  "jv-east-java",
  "jv-cirebon",
  "su-priangan",
  "bbc-toba",
  "btx-karo",
  "btm-mandailing",
  "akb-angkola",
  "bts-simalungun",
  "btd-pakpak"
] as const;
export type RelationshipTerminology = typeof RELATIONSHIP_TERMINOLOGIES[number];
export const RELATIONSHIP_LANGUAGES = ["en", "ms", ...RELATIONSHIP_TERMINOLOGIES] as const;
export type RelationshipLanguage = "en" | "ms" | RelationshipTerminology;
export type RelationshipKind = "parent" | "partner" | "sibling";
export type RelationshipSubtype =
  | "biologicalParent"
  | "adoptiveParent"
  | "fosterParent"
  | "guardian"
  | "stepParent"
  | "partner"
  | "spouse"
  | "formerPartner"
  | "formerSpouse"
  | "sibling"
  | "halfSibling"
  | "adoptiveSibling"
  | "fosterSibling"
  | "stepSibling";

export type DirectRole =
  | "father"
  | "mother"
  | "son"
  | "daughter"
  | "adoptiveFather"
  | "adoptiveMother"
  | "adoptiveSon"
  | "adoptiveDaughter"
  | "fosterFather"
  | "fosterMother"
  | "fosterSon"
  | "fosterDaughter"
  | "guardian"
  | "ward"
  | "stepfather"
  | "stepmother"
  | "stepson"
  | "stepdaughter"
  | "brother"
  | "sister"
  | "halfBrother"
  | "halfSister"
  | "adoptiveBrother"
  | "adoptiveSister"
  | "fosterBrother"
  | "fosterSister"
  | "stepbrother"
  | "stepsister"
  | "partner"
  | "husband"
  | "wife"
  | "formerPartner"
  | "formerHusband"
  | "formerWife";

export interface FamilyTree {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastSelectedPersonId?: string;
}

export interface Person {
  id: string;
  treeId: string;
  displayName: string;
  gender: Gender;
  createdAt: string;
  birthDate?: string;
  birthOrderOverride?: number;
  deathDate?: string;
  birthDatePrecision: "exact" | "month" | "year";
  notes: string;
  addressLine: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  photoDataUrl?: string;
}

export interface FamilyRelationship {
  id: string;
  treeId: string;
  fromPersonId: string;
  toPersonId: string;
  kind: RelationshipKind;
  subtype: RelationshipSubtype;
  createdAt: string;
  marriageDate?: string;
  divorceDate?: string;
}

export interface ViewportState {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface AppData {
  version: 1;
  trees: FamilyTree[];
  people: Person[];
  relationships: FamilyRelationship[];
  selectedTreeId?: string;
  language: AppLanguage;
  relationshipLanguage?: RelationshipLanguage;
  relationshipTerminology?: RelationshipTerminology;
  viewports: Record<string, ViewportState>;
}

export interface GenerationLimits {
  ancestors: number | null;
  descendants: number | null;
}

export interface PositionedPerson extends Person {
  x: number;
  y: number;
  role: string;
  generation: number;
  birthOrder?: number;
}

export interface TreeLayout {
  people: PositionedPerson[];
  relationships: FamilyRelationship[];
  width: number;
  height: number;
  /** Layout-only sibling rails above inset ancestry; never archive data. */
  familyRailY?: Record<string, number>;
  /** Candidate layout-only family corridors; never saved in an archive. */
  familyRouteGeometry?: Record<string, {
    parentPorts: Record<string, { x: number; y: number }>;
    childPorts: Record<string, { x: number; y: number }>;
    segments: { start: { x: number; y: number }; end: { x: number; y: number } }[];
  }>;
  partnerRouteCandidates?: Record<string, { start: { x: number; y: number }; end: { x: number; y: number } }[][]>;
}

export interface SceneLifeSummaryOptions {
  showBirthDate: boolean;
  showAge: boolean;
  ageByPersonId?: Readonly<Record<string, number>>;
}

export interface RelativeDraft {
  mode: "new" | "existing";
  role: DirectRole;
  existingPersonId?: string;
  displayName: string;
  birthDate?: string;
  city: string;
  marriageDate?: string;
  divorceDate?: string;
  photoDataUrl?: string;
  coParentId?: string;
}

export const emptyAppData = (): AppData => ({
  version: 1,
  trees: [],
  people: [],
  relationships: [],
  language: browserAppLanguage(),
  relationshipLanguage: browserAppLanguage(),
  relationshipTerminology: "id",
  viewports: {}
});

export const newId = () => crypto.randomUUID().toLowerCase();
