import { personAge } from "./lifeSummary";
import type { AppData } from "./types";

export interface ExportPrivacySelection {
  birthDates: boolean;
  relationshipDates: boolean;
  photos: boolean;
  ages: boolean;
}

export const DEFAULT_EXPORT_PRIVACY_SELECTION: ExportPrivacySelection = {
  birthDates: true,
  relationshipDates: true,
  photos: true,
  ages: true
};

export const prepareDataForExport = (
  data: AppData,
  treeId: string,
  selection: ExportPrivacySelection = DEFAULT_EXPORT_PRIVACY_SELECTION,
  now = new Date()
) => {
  const ageByPersonId: Record<string, number> = {};
  const people = data.people.map((person) => {
    if (person.treeId !== treeId) return person;
    if (selection.ages && !selection.birthDates) {
      const age = personAge(person, now);
      if (age !== undefined) ageByPersonId[person.id] = age;
    }
    return {
      ...person,
      birthDate: selection.birthDates ? person.birthDate : undefined,
      birthOrderOverride: selection.birthDates ? person.birthOrderOverride : undefined,
      photoDataUrl: selection.photos ? person.photoDataUrl : undefined
    };
  });
  const relationships = data.relationships.map((relationship) =>
    relationship.treeId !== treeId || selection.relationshipDates
      ? relationship
      : { ...relationship, marriageDate: undefined, divorceDate: undefined }
  );
  return { data: { ...data, people, relationships }, ageByPersonId };
};
