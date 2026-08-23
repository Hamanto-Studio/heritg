import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import { createTreeLayout } from "./layout";
import type {
  AppData,
  FamilyRelationship,
  GenerationLimits,
  Person,
  RelationshipLanguage,
  TreeLayout
} from "./types";

export interface TreePreparationRequest {
  requestKey: string;
  people: Person[];
  relationships: FamilyRelationship[];
  layoutSelectionId?: string;
  generationLimits: GenerationLimits;
  language: AppData["language"];
  relationshipLanguage: RelationshipLanguage;
  controlsVisible: boolean;
}

export interface TreePreparationResult {
  requestKey: string;
  geometryLayout: TreeLayout;
  connectionPlan: ConnectionPlan;
}

export function prepareTree({
  requestKey,
  people,
  relationships,
  layoutSelectionId,
  generationLimits,
  language,
  relationshipLanguage,
  controlsVisible
}: TreePreparationRequest): TreePreparationResult {
  const geometryLayout = createTreeLayout(
    people,
    relationships,
    layoutSelectionId,
    generationLimits,
    relationshipLanguage
  );
  const routingLayout = {
    ...geometryLayout,
    people: geometryLayout.people.map((person) => ({ ...person, role: " " }))
  };
  return {
    requestKey,
    geometryLayout,
    connectionPlan: createConnectionPlan(routingLayout, language, undefined, controlsVisible)
  };
}

export const personForTreePreparation = (person: Person): Person => ({
  id: person.id,
  treeId: person.treeId,
  displayName: person.displayName,
  gender: person.gender,
  createdAt: person.createdAt,
  birthDate: person.birthDate,
  birthOrderOverride: person.birthOrderOverride,
  deathDate: person.deathDate,
  birthDatePrecision: person.birthDatePrecision,
  notes: "",
  addressLine: "",
  city: person.city,
  province: "",
  country: "",
  postalCode: ""
});
