export type Gender = "female" | "male" | "unspecified";
export type RelationshipTerminology = "id" | "jv-yogyakarta" | "jv-east-java";
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
  language: "en" | "id";
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
  language: navigator.language.toLowerCase().startsWith("id") ? "id" : "en",
  relationshipTerminology: "id",
  viewports: {}
});

export const newId = () => crypto.randomUUID().toLowerCase();
