import type {
  AppData,
  FamilyRelationship,
  Gender,
  Person,
  RelationshipSubtype
} from "./types";

const ancestrySubtypes = new Set<RelationshipSubtype>([
  "biologicalParent",
  "adoptiveParent"
]);

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const relationshipOrder = (
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

const gendered = (
  gender: Gender,
  male: string,
  female: string,
  neutral: string
) => (gender === "male" ? male : gender === "female" ? female : neutral);

const directParentLabel = (
  gender: Gender,
  subtype: RelationshipSubtype,
  isParent: boolean
) => {
  if (subtype === "adoptiveParent") {
    return isParent
      ? gendered(gender, "Adoptive father", "Adoptive mother", "Adoptive parent")
      : gendered(gender, "Adoptive son", "Adoptive daughter", "Adoptive child");
  }
  if (subtype === "fosterParent") {
    return isParent
      ? gendered(gender, "Foster father", "Foster mother", "Foster parent")
      : gendered(gender, "Foster son", "Foster daughter", "Foster child");
  }
  if (subtype === "guardian") return isParent ? "Guardian" : "Ward";
  if (subtype === "stepParent") {
    return isParent
      ? gendered(gender, "Stepfather", "Stepmother", "Step-parent")
      : gendered(gender, "Stepson", "Stepdaughter", "Stepchild");
  }
  return isParent
    ? gendered(gender, "Father", "Mother", "Parent")
    : gendered(gender, "Son", "Daughter", "Child");
};

const directSiblingLabel = (gender: Gender, subtype: RelationshipSubtype) => {
  if (subtype === "halfSibling") {
    return gendered(gender, "Half-brother", "Half-sister", "Half-sibling");
  }
  if (subtype === "adoptiveSibling") {
    return gendered(
      gender,
      "Adoptive brother",
      "Adoptive sister",
      "Adoptive sibling"
    );
  }
  if (subtype === "fosterSibling") {
    return gendered(gender, "Foster brother", "Foster sister", "Foster sibling");
  }
  if (subtype === "stepSibling") {
    return gendered(gender, "Stepbrother", "Stepsister", "Stepsibling");
  }
  return gendered(gender, "Brother", "Sister", "Sibling");
};

function directRelationshipLabelEnglish(
  person: Person,
  relativeToPersonId: string,
  relationships: readonly FamilyRelationship[]
): string | undefined {
  const relationship = relationships
    .filter(
      (candidate) =>
        (candidate.fromPersonId === person.id &&
          candidate.toPersonId === relativeToPersonId) ||
        (candidate.toPersonId === person.id &&
          candidate.fromPersonId === relativeToPersonId)
    )
    .sort(relationshipOrder)[0];

  if (!relationship) return undefined;
  if (relationship.kind === "parent") {
    return directParentLabel(
      person.gender,
      relationship.subtype,
      relationship.fromPersonId === person.id
    );
  }
  if (relationship.kind === "sibling") {
    return directSiblingLabel(person.gender, relationship.subtype);
  }
  if (relationship.subtype === "spouse") {
    return gendered(person.gender, "Husband", "Wife", "Spouse");
  }
  if (relationship.subtype === "formerSpouse") {
    return gendered(
      person.gender,
      "Former husband",
      "Former wife",
      "Former spouse"
    );
  }
  return relationship.subtype === "formerPartner" ? "Former partner" : "Partner";
}

const INDONESIAN_LABELS: Record<string, string> = {
  "You": "Anda",
  "Father": "Ayah", "Mother": "Ibu", "Parent": "Orang tua",
  "Son": "Putra", "Daughter": "Putri", "Child": "Anak",
  "Brother": "Saudara laki-laki", "Sister": "Saudara perempuan", "Sibling": "Saudara",
  "Husband": "Suami", "Wife": "Istri", "Spouse": "Pasangan",
  "Partner": "Pasangan", "Former partner": "Mantan pasangan",
  "Former husband": "Mantan suami", "Former wife": "Mantan istri", "Former spouse": "Mantan pasangan",
  "Adoptive father": "Ayah angkat", "Adoptive mother": "Ibu angkat", "Adoptive parent": "Orang tua angkat",
  "Adoptive son": "Putra angkat", "Adoptive daughter": "Putri angkat", "Adoptive child": "Anak angkat",
  "Foster father": "Ayah asuh", "Foster mother": "Ibu asuh", "Foster parent": "Orang tua asuh",
  "Foster son": "Putra asuh", "Foster daughter": "Putri asuh", "Foster child": "Anak asuh",
  "Guardian": "Wali", "Ward": "Anak di bawah perwalian",
  "Stepfather": "Ayah tiri", "Stepmother": "Ibu tiri", "Step-parent": "Orang tua tiri",
  "Stepson": "Putra tiri", "Stepdaughter": "Putri tiri", "Stepchild": "Anak tiri",
  "Half-brother": "Saudara laki-laki seayah/seibu", "Half-sister": "Saudara perempuan seayah/seibu", "Half-sibling": "Saudara seayah/seibu",
  "Adoptive brother": "Saudara laki-laki angkat", "Adoptive sister": "Saudara perempuan angkat", "Adoptive sibling": "Saudara angkat",
  "Foster brother": "Saudara laki-laki asuh", "Foster sister": "Saudara perempuan asuh", "Foster sibling": "Saudara asuh",
  "Stepbrother": "Saudara laki-laki tiri", "Stepsister": "Saudara perempuan tiri", "Stepsibling": "Saudara tiri",
  "Grandfather": "Kakek", "Grandmother": "Nenek", "Grandparent": "Kakek/Nenek",
  "Grandson": "Cucu laki-laki", "Granddaughter": "Cucu perempuan", "Grandchild": "Cucu",
  "Uncle": "Paman", "Aunt": "Bibi", "Aunt/Uncle": "Paman/Bibi",
  "Nephew": "Keponakan laki-laki", "Niece": "Keponakan perempuan", "Niece/Nephew": "Keponakan",
  "Family member": "Anggota keluarga"
};

const localizedLabel = (label: string, language: AppData["language"]) => {
  if (language === "en") return label;
  if (INDONESIAN_LABELS[label]) return INDONESIAN_LABELS[label];
  if (/cousin/i.test(label)) return "Sepupu";
  if (/^Great-/i.test(label)) {
    return /grand(?:father|mother|parent)/i.test(label) ? "Leluhur" : "Keturunan";
  }
  return label;
};

export function directRelationshipLabel(
  person: Person,
  relativeToPersonId: string,
  relationships: readonly FamilyRelationship[],
  language: AppData["language"] = "en"
): string | undefined {
  const label = directRelationshipLabelEnglish(person, relativeToPersonId, relationships);
  return label ? localizedLabel(label, language) : undefined;
}

const ancestorDistances = (
  personId: string,
  validIds: ReadonlySet<string>,
  relationships: readonly FamilyRelationship[]
) => {
  const parents = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (
      relationship.kind !== "parent" ||
      !ancestrySubtypes.has(relationship.subtype) ||
      !validIds.has(relationship.fromPersonId) ||
      !validIds.has(relationship.toPersonId)
    ) {
      continue;
    }
    const values = parents.get(relationship.toPersonId) ?? [];
    values.push(relationship.fromPersonId);
    parents.set(relationship.toPersonId, values);
  }
  for (const values of parents.values()) values.sort(compareText);

  const distances = new Map<string, number>();
  const queue: Array<[string, number]> = [[personId, 0]];
  for (let index = 0; index < queue.length; index += 1) {
    const [currentId, distance] = queue[index];
    for (const parentId of parents.get(currentId) ?? []) {
      if (parentId === personId || distances.has(parentId)) continue;
      distances.set(parentId, distance + 1);
      queue.push([parentId, distance + 1]);
    }
  }
  return distances;
};

const withGreatPrefix = (label: string, count: number) => {
  if (count <= 0) return label;
  return `${"Great-"}${"great-".repeat(count - 1)}${label[0].toLowerCase()}${label.slice(1)}`;
};

const generationLabel = (distance: number, gender: Gender, ancestor: boolean) => {
  if (distance === 1) {
    return ancestor
      ? gendered(gender, "Father", "Mother", "Parent")
      : gendered(gender, "Son", "Daughter", "Child");
  }
  const base = ancestor
    ? gendered(gender, "Grandfather", "Grandmother", "Grandparent")
    : gendered(gender, "Grandson", "Granddaughter", "Grandchild");
  return withGreatPrefix(base, Math.max(0, distance - 2));
};

const ordinal = (value: number) => {
  const modulo100 = value % 100;
  if (modulo100 >= 11 && modulo100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
};

const cousinLabel = (degree: number, removal: number) => {
  const base =
    degree === 1
      ? "First cousin"
      : degree === 2
        ? "Second cousin"
        : degree === 3
          ? "Third cousin"
          : `${ordinal(degree)} cousin`;
  if (removal === 0) return base;
  if (removal === 1) return `${base} once removed`;
  if (removal === 2) return `${base} twice removed`;
  return `${base} ${removal} times removed`;
};

function kinshipLabelEnglish(
  personId: string,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): string | undefined {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const person = peopleById.get(personId);
  if (!person || !peopleById.has(relativeToPersonId)) return undefined;
  if (personId === relativeToPersonId) return "You";

  const direct = directRelationshipLabel(person, relativeToPersonId, relationships);
  if (direct) return direct;

  const validIds = new Set(peopleById.keys());
  const personAncestors = ancestorDistances(personId, validIds, relationships);
  const referenceAncestors = ancestorDistances(
    relativeToPersonId,
    validIds,
    relationships
  );

  const ancestorDistance = referenceAncestors.get(personId);
  if (ancestorDistance !== undefined) {
    return generationLabel(ancestorDistance, person.gender, true);
  }
  const descendantDistance = personAncestors.get(relativeToPersonId);
  if (descendantDistance !== undefined) {
    return generationLabel(descendantDistance, person.gender, false);
  }

  const commonAncestors = [...personAncestors.keys()]
    .filter((id) => referenceAncestors.has(id))
    .sort((left, right) => {
      const leftPersonDistance = personAncestors.get(left) ?? 0;
      const leftReferenceDistance = referenceAncestors.get(left) ?? 0;
      const rightPersonDistance = personAncestors.get(right) ?? 0;
      const rightReferenceDistance = referenceAncestors.get(right) ?? 0;
      return (
        Math.max(leftPersonDistance, leftReferenceDistance) -
          Math.max(rightPersonDistance, rightReferenceDistance) ||
        leftPersonDistance +
          leftReferenceDistance -
          rightPersonDistance -
          rightReferenceDistance ||
        compareText(left, right)
      );
    });
  const commonAncestor = commonAncestors[0];
  if (!commonAncestor) return undefined;

  const personDistance = personAncestors.get(commonAncestor) ?? 0;
  const referenceDistance = referenceAncestors.get(commonAncestor) ?? 0;
  if (personDistance === 1 && referenceDistance === 1) {
    return gendered(person.gender, "Brother", "Sister", "Sibling");
  }
  if (personDistance === 1) {
    return withGreatPrefix(
      gendered(person.gender, "Uncle", "Aunt", "Aunt/Uncle"),
      Math.max(0, referenceDistance - 2)
    );
  }
  if (referenceDistance === 1) {
    return withGreatPrefix(
      gendered(person.gender, "Nephew", "Niece", "Niece/Nephew"),
      Math.max(0, personDistance - 2)
    );
  }
  return cousinLabel(
    Math.min(personDistance, referenceDistance) - 1,
    Math.abs(personDistance - referenceDistance)
  );
}

export function kinshipLabel(
  personId: string,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  language: AppData["language"] = "en"
): string | undefined {
  const label = kinshipLabelEnglish(personId, relativeToPersonId, people, relationships);
  return label ? localizedLabel(label, language) : undefined;
}

export function deriveKinshipLabels(
  selectedPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  language: AppData["language"] = "en"
): Record<string, string> {
  return [...people]
    .sort((left, right) => compareText(left.id, right.id))
    .reduce<Record<string, string>>((labels, person) => {
      labels[person.id] =
        kinshipLabel(person.id, selectedPersonId, people, relationships, language) ??
        localizedLabel("Family member", language);
      return labels;
    }, {});
}

export const getKinshipLabel = kinshipLabel;
