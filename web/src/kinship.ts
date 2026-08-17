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
const activeUnionSubtypes = new Set<RelationshipSubtype>(["partner", "spouse"]);
const emptyIds = new Set<string>();

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

interface KinshipIndex {
  peopleById: Map<string, Person>;
  relationshipsByPair: Map<string, FamilyRelationship[]>;
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  activePartners: Map<string, Set<string>>;
  explicitSiblings: Set<string>;
  ancestors: Map<string, Map<string, number>>;
}

const pairKey = (firstId: string, secondId: string) => {
  const [first, second] = compareText(firstId, secondId) <= 0
    ? [firstId, secondId]
    : [secondId, firstId];
  return `${first.length}:${first}${second.length}:${second}`;
};

const addIndexedId = (values: Map<string, Set<string>>, key: string, value: string) => {
  const ids = values.get(key) ?? new Set<string>();
  ids.add(value);
  values.set(key, ids);
};

const createKinshipIndex = (
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): KinshipIndex => {
  const index: KinshipIndex = {
    peopleById: new Map(people.map((person) => [person.id, person])),
    relationshipsByPair: new Map(),
    parents: new Map(),
    children: new Map(),
    activePartners: new Map(),
    explicitSiblings: new Set(),
    ancestors: new Map()
  };
  for (const relationship of relationships) {
    const key = pairKey(relationship.fromPersonId, relationship.toPersonId);
    const pairRelationships = index.relationshipsByPair.get(key) ?? [];
    pairRelationships.push(relationship);
    index.relationshipsByPair.set(key, pairRelationships);
    if (relationship.kind === "parent" && ancestrySubtypes.has(relationship.subtype)) {
      addIndexedId(index.parents, relationship.toPersonId, relationship.fromPersonId);
      addIndexedId(index.children, relationship.fromPersonId, relationship.toPersonId);
    } else if (relationship.kind === "partner" && activeUnionSubtypes.has(relationship.subtype)) {
      addIndexedId(index.activePartners, relationship.fromPersonId, relationship.toPersonId);
      addIndexedId(index.activePartners, relationship.toPersonId, relationship.fromPersonId);
    } else if (relationship.kind === "sibling") {
      index.explicitSiblings.add(key);
    }
  }
  for (const values of index.relationshipsByPair.values()) values.sort(relationshipOrder);
  return index;
};

const indexedIds = (values: Map<string, Set<string>>, personId: string) =>
  values.get(personId) ?? emptyIds;

const indexedAncestorDistances = (personId: string, index: KinshipIndex) => {
  const cached = index.ancestors.get(personId);
  if (cached) return cached;
  const distances = new Map<string, number>();
  const queue: Array<[string, number]> = [[personId, 0]];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const [currentId, distance] = queue[queueIndex];
    for (const parentId of indexedIds(index.parents, currentId)) {
      if (parentId === personId || distances.has(parentId)) continue;
      distances.set(parentId, distance + 1);
      queue.push([parentId, distance + 1]);
    }
  }
  index.ancestors.set(personId, distances);
  return distances;
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
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
): string | undefined {
  const relationship = index
    ? index.relationshipsByPair.get(pairKey(person.id, relativeToPersonId))?.[0]
    : relationships
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
  "Selected person": "Orang terpilih",
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
  "Father-in-law": "Ayah mertua", "Mother-in-law": "Ibu mertua", "Parent-in-law": "Mertua",
  "Son-in-law": "Menantu laki-laki", "Daughter-in-law": "Menantu perempuan", "Child-in-law": "Menantu",
  "Brother-in-law": "Ipar laki-laki", "Sister-in-law": "Ipar perempuan", "Sibling-in-law": "Ipar",
  "Family member": "Anggota keluarga"
};

const localizedLabel = (label: string, language: AppData["language"]): string => {
  if (language === "en") return label;
  if (label.endsWith(" by marriage")) {
    return `${localizedLabel(label.slice(0, -" by marriage".length), language)} melalui pernikahan`;
  }
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

const parentIds = (
  personId: string,
  relationships: readonly FamilyRelationship[]
) => new Set(relationships.flatMap((relationship) =>
  relationship.kind === "parent" && ancestrySubtypes.has(relationship.subtype) &&
  relationship.toPersonId === personId ? [relationship.fromPersonId] : []
));

const childIds = (
  personId: string,
  relationships: readonly FamilyRelationship[]
) => new Set(relationships.flatMap((relationship) =>
  relationship.kind === "parent" && ancestrySubtypes.has(relationship.subtype) &&
  relationship.fromPersonId === personId ? [relationship.toPersonId] : []
));

const activePartnerIds = (
  personId: string,
  relationships: readonly FamilyRelationship[]
) => new Set(relationships.flatMap((relationship) => {
  if (relationship.kind !== "partner" || !activeUnionSubtypes.has(relationship.subtype)) return [];
  if (relationship.fromPersonId === personId) return [relationship.toPersonId];
  if (relationship.toPersonId === personId) return [relationship.fromPersonId];
  return [];
}));

const areSiblings = (
  firstId: string,
  secondId: string,
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
) => index
  ? index.explicitSiblings.has(pairKey(firstId, secondId)) ||
    [...indexedIds(index.parents, firstId)].some((id) =>
      indexedIds(index.parents, secondId).has(id)
    )
  : relationships.some((relationship) => relationship.kind === "sibling" &&
    new Set([relationship.fromPersonId, relationship.toPersonId]).size === 2 &&
    [relationship.fromPersonId, relationship.toPersonId].includes(firstId) &&
    [relationship.fromPersonId, relationship.toPersonId].includes(secondId)) ||
    [...parentIds(firstId, relationships)].some((id) => parentIds(secondId, relationships).has(id));

const stepLabel = (
  person: Person,
  relativeToPersonId: string,
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
) => {
  const parentsFor = (personId: string) => index
    ? indexedIds(index.parents, personId)
    : parentIds(personId, relationships);
  const partnersFor = (personId: string) => index
    ? indexedIds(index.activePartners, personId)
    : activePartnerIds(personId, relationships);
  const referenceParents = parentsFor(relativeToPersonId);
  if ([...referenceParents].some((id) => partnersFor(id).has(person.id))) {
    return gendered(person.gender, "Stepfather", "Stepmother", "Step-parent");
  }
  const referencePartners = partnersFor(relativeToPersonId);
  if ([...referencePartners].some((id) => parentsFor(person.id).has(id))) {
    return gendered(person.gender, "Stepson", "Stepdaughter", "Stepchild");
  }
  for (const parentId of referenceParents) {
    for (const stepParentId of partnersFor(parentId)) {
      if (parentsFor(person.id).has(stepParentId)) {
        return gendered(person.gender, "Stepbrother", "Stepsister", "Stepsibling");
      }
    }
  }
  return undefined;
};

const inLawLabel = (
  person: Person,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
) => {
  const parentsFor = (personId: string) => index
    ? indexedIds(index.parents, personId)
    : parentIds(personId, relationships);
  const childrenFor = (personId: string) => index
    ? indexedIds(index.children, personId)
    : childIds(personId, relationships);
  const partnersFor = (personId: string) => index
    ? indexedIds(index.activePartners, personId)
    : activePartnerIds(personId, relationships);
  const referencePartners = partnersFor(relativeToPersonId);
  if ([...referencePartners].some((id) => parentsFor(id).has(person.id))) {
    return gendered(person.gender, "Father-in-law", "Mother-in-law", "Parent-in-law");
  }
  const referenceChildren = childrenFor(relativeToPersonId);
  if ([...referenceChildren].some((id) => partnersFor(id).has(person.id))) {
    return gendered(person.gender, "Son-in-law", "Daughter-in-law", "Child-in-law");
  }
  if ([...referencePartners].some((id) => areSiblings(person.id, id, relationships, index)) ||
      [...partnersFor(person.id)].some((id) =>
        areSiblings(id, relativeToPersonId, relationships, index))) {
    return gendered(person.gender, "Brother-in-law", "Sister-in-law", "Sibling-in-law");
  }
  for (const partnerId of referencePartners) {
    const label = lineageLabelEnglish(person.id, partnerId, people, relationships, index);
    if (label) return `${label} by marriage`;
  }
  return undefined;
};

function lineageLabelEnglish(
  personId: string,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
): string | undefined {
  const peopleById = index?.peopleById ?? new Map(people.map((person) => [person.id, person]));
  const person = peopleById.get(personId);
  if (!person || !peopleById.has(relativeToPersonId) || personId === relativeToPersonId) return undefined;

  const personAncestors = index
    ? indexedAncestorDistances(personId, index)
    : ancestorDistances(personId, new Set(peopleById.keys()), relationships);
  const referenceAncestors = index
    ? indexedAncestorDistances(relativeToPersonId, index)
    : ancestorDistances(relativeToPersonId, new Set(peopleById.keys()), relationships);

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

function kinshipLabelEnglish(
  personId: string,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  index?: KinshipIndex
): string | undefined {
  const peopleById = index?.peopleById ?? new Map(people.map((person) => [person.id, person]));
  const person = peopleById.get(personId);
  if (!person || !peopleById.has(relativeToPersonId)) return undefined;
  if (personId === relativeToPersonId) return "Selected person";

  const direct = directRelationshipLabelEnglish(
    person, relativeToPersonId, relationships, index
  );
  if (direct) return direct;
  const lineage = lineageLabelEnglish(
    personId, relativeToPersonId, people, relationships, index
  );
  if (lineage) return lineage;
  const step = stepLabel(person, relativeToPersonId, relationships, index);
  if (step) return step;
  return inLawLabel(person, relativeToPersonId, people, relationships, index);
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
  const index = createKinshipIndex(people, relationships);
  return [...people]
    .sort((left, right) => compareText(left.id, right.id))
    .reduce<Record<string, string>>((labels, person) => {
      labels[person.id] =
        localizedLabel(
          kinshipLabelEnglish(
            person.id, selectedPersonId, people, relationships, index
          ) ?? "Family member",
          language
        );
      return labels;
    }, {});
}

export const getKinshipLabel = kinshipLabel;
