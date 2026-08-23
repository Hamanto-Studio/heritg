import type {
  AppData,
  FamilyRelationship,
  Gender,
  Person,
  RelationshipLanguage,
  RelationshipSubtype,
  RelationshipTerminology
} from "./types";

export type KinshipLanguage = RelationshipLanguage;
type JavaneseTerminology = Extract<
  RelationshipTerminology,
  "jv-yogyakarta" | "jv-east-java"
>;
type CulturalTerminology = Exclude<RelationshipTerminology, "id" | JavaneseTerminology>;

export const effectiveKinshipLanguage = (
  language: AppData["language"],
  terminology: RelationshipTerminology = "id"
): KinshipLanguage => language === "en" ? "en" : terminology;

export const relationshipLanguageForData = (data: AppData): RelationshipLanguage =>
  data.relationshipLanguage ?? effectiveKinshipLanguage(
    data.language,
    data.relationshipTerminology
  );

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
  biologicalParents: Map<string, Set<string>>;
  biologicalChildren: Map<string, Set<string>>;
  activePartners: Map<string, Set<string>>;
  explicitSiblings: Set<string>;
  ancestors: Map<string, Map<string, number>>;
  biologicalAncestors: Map<string, Map<string, number>>;
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
    biologicalParents: new Map(),
    biologicalChildren: new Map(),
    activePartners: new Map(),
    explicitSiblings: new Set(),
    ancestors: new Map(),
    biologicalAncestors: new Map()
  };
  for (const relationship of relationships) {
    const key = pairKey(relationship.fromPersonId, relationship.toPersonId);
    const pairRelationships = index.relationshipsByPair.get(key) ?? [];
    pairRelationships.push(relationship);
    index.relationshipsByPair.set(key, pairRelationships);
    if (relationship.kind === "parent" && ancestrySubtypes.has(relationship.subtype)) {
      addIndexedId(index.parents, relationship.toPersonId, relationship.fromPersonId);
      addIndexedId(index.children, relationship.fromPersonId, relationship.toPersonId);
      if (relationship.subtype === "biologicalParent") {
        addIndexedId(index.biologicalParents, relationship.toPersonId, relationship.fromPersonId);
        addIndexedId(index.biologicalChildren, relationship.fromPersonId, relationship.toPersonId);
      }
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

const indexedBiologicalAncestorDistances = (personId: string, index: KinshipIndex) => {
  const cached = index.biologicalAncestors.get(personId);
  if (cached) return cached;
  const distances = new Map<string, number>();
  const queue: Array<[string, number]> = [[personId, 0]];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const [currentId, distance] = queue[queueIndex];
    for (const parentId of indexedIds(index.biologicalParents, currentId)) {
      if (parentId === personId || distances.has(parentId)) continue;
      const nextDistance = distance + 1;
      distances.set(parentId, nextDistance);
      queue.push([parentId, nextDistance]);
    }
  }
  index.biologicalAncestors.set(personId, distances);
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

const JAVANESE_LABELS: Record<string, string> = {
  "Selected person": "Wong kapilih",
  "Father": "Bapak", "Mother": "Ibu", "Parent": "Wong tuwa",
  "Son": "Anak", "Daughter": "Anak", "Child": "Anak",
  "Brother": "Sedulur", "Sister": "Sedulur", "Sibling": "Sedulur",
  "Husband": "Bojo", "Wife": "Bojo", "Spouse": "Bojo", "Partner": "Bojo",
  "Former partner": "Mantan bojo", "Former husband": "Mantan bojo",
  "Former wife": "Mantan bojo", "Former spouse": "Mantan bojo",
  "Adoptive father": "Bapak angkat", "Adoptive mother": "Ibu angkat",
  "Adoptive parent": "Wong tuwa angkat", "Adoptive son": "Anak pupon",
  "Adoptive daughter": "Anak pupon", "Adoptive child": "Anak pupon",
  "Foster father": "Bapak asuh", "Foster mother": "Ibu asuh",
  "Foster parent": "Wong tuwa asuh", "Foster son": "Anak asuh",
  "Foster daughter": "Anak asuh", "Foster child": "Anak asuh",
  "Guardian": "Wali", "Ward": "Anak sing diwaleni",
  "Stepfather": "Bapak kuwalon", "Stepmother": "Ibu kuwalon",
  "Step-parent": "Wong tuwa kuwalon", "Stepson": "Anak kuwalon",
  "Stepdaughter": "Anak kuwalon", "Stepchild": "Anak kuwalon",
  "Half-brother": "Sedulur tunggal bapak utawa ibu",
  "Half-sister": "Sedulur tunggal bapak utawa ibu",
  "Half-sibling": "Sedulur tunggal bapak utawa ibu",
  "Adoptive brother": "Sedulur angkat", "Adoptive sister": "Sedulur angkat",
  "Adoptive sibling": "Sedulur angkat", "Foster brother": "Sedulur asuh",
  "Foster sister": "Sedulur asuh", "Foster sibling": "Sedulur asuh",
  "Stepbrother": "Sedulur kuwalon", "Stepsister": "Sedulur kuwalon",
  "Stepsibling": "Sedulur kuwalon",
  "Grandson": "Putu", "Granddaughter": "Putu", "Grandchild": "Putu",
  "Uncle": "Pak", "Aunt": "Bu", "Aunt/Uncle": "Sedulur wong tuwa",
  "Nephew": "Keponakan", "Niece": "Keponakan", "Niece/Nephew": "Keponakan",
  "Father-in-law": "Bapak maratuwa", "Mother-in-law": "Ibu maratuwa",
  "Parent-in-law": "Maratuwa", "Son-in-law": "Mantu", "Daughter-in-law": "Mantu",
  "Child-in-law": "Mantu", "Brother-in-law": "Ipe", "Sister-in-law": "Ipe",
  "Sibling-in-law": "Ipe", "Family member": "Sanak-sedulur"
};

const javaneseGenerationLabel = (label: string, terminology: JavaneseTerminology) => {
  const grandparent = terminology === "jv-yogyakarta" ? "Simbah" : "Mbah";
  if (label === "Grandfather") return `${grandparent} Kakung`;
  if (label === "Grandmother") return `${grandparent} Putri`;
  if (label === "Grandparent") return grandparent;
  if (/^Great-/i.test(label)) {
    const greatCount = label.match(/great-/gi)?.length ?? 1;
    const level = ["Buyut", "Canggah", "Wareng", "Udeg-udeg", "Gantung siwur"][
      Math.min(greatCount - 1, 4)
    ];
    return /grand(?:father|mother|parent)/i.test(label) ? `${grandparent} ${level}` : level;
  }
  return undefined;
};

const javaneseBasicLabel = (
  label: string,
  terminology: JavaneseTerminology
): string => {
  if (label.endsWith(" by marriage")) {
    return javaneseBasicLabel(label.slice(0, -" by marriage".length), terminology);
  }
  const generation = javaneseGenerationLabel(label, terminology);
  if (generation) return generation;
  if (JAVANESE_LABELS[label]) return JAVANESE_LABELS[label];
  if (/cousin/i.test(label)) return "Sedulur";
  return INDONESIAN_LABELS[label] ?? label;
};

type ProfileLabels = Partial<Record<string, string>>;

const CULTURAL_LABELS: Record<CulturalTerminology, ProfileLabels> = {
  "jv-cirebon": {
    "Selected person": "Wong sing dipilih",
    "Father": "Mama", "Mother": "Mimi", "Parent": "Wongtuwa",
    "Son": "Anak lanang", "Daughter": "Anak wadon", "Child": "Anak",
    "Brother": "Sedulur lanang", "Sister": "Sedulur wadon", "Sibling": "Sedulur",
    "Husband": "Laki", "Wife": "Rabi", "Spouse": "Laki/rabi", "Partner": "Pasangan",
    "Former husband": "Mantan laki", "Former wife": "Mantan rabi",
    "Former spouse": "Mantan pasangan", "Former partner": "Mantan pasangan",
    "Grandfather": "Bapa tuwa", "Grandmother": "Mbok tuwa", "Grandparent": "Embah",
    "Grandson": "Putu lanang", "Granddaughter": "Putu wadon", "Grandchild": "Putu",
    "Uncle": "Seduluré wongtuwa", "Aunt": "Seduluré wongtuwa",
    "Aunt/Uncle": "Seduluré wongtuwa",
    "Nephew": "Keponakan lanang", "Niece": "Keponakan wadon",
    "Niece/Nephew": "Keponakan",
    "Father-in-law": "Mama mertua", "Mother-in-law": "Mimi mertua",
    "Parent-in-law": "Mertua", "Son-in-law": "Mantu lanang",
    "Daughter-in-law": "Mantu wadon", "Child-in-law": "Mantu",
    "Brother-in-law": "Ipe lanang", "Sister-in-law": "Ipe wadon",
    "Sibling-in-law": "Ipe", "Family member": "Sanak-sedulur",
    "Stepfather": "Mama tiri", "Stepmother": "Mimi tiri",
    "Stepson": "Anak tiri lanang", "Stepdaughter": "Anak tiri wadon",
    "Stepchild": "Anak tiri"
  },
  "su-priangan": {
    "Selected person": "Diri sorangan",
    "Father": "Bapa", "Mother": "Indung",
    "Son": "Anak lalaki", "Daughter": "Anak awéwé", "Child": "Anak",
    "Brother": "Dulur lalaki", "Sister": "Dulur awéwé", "Sibling": "Dulur",
    "Husband": "Salaki", "Wife": "Pamajikan", "Spouse": "Salaki/pamajikan",
    "Partner": "Pasangan", "Former partner": "Mantan pasangan",
    "Grandfather": "Aki", "Grandmother": "Nini", "Grandparent": "Aki/Nini",
    "Grandson": "Incu lalaki", "Granddaughter": "Incu awéwé", "Grandchild": "Incu",
    "Uncle": "Dulur lalaki kolot", "Aunt": "Dulur awéwé kolot",
    "Aunt/Uncle": "Dulur kolot", "Nephew": "Anak dulur lalaki",
    "Niece": "Anak dulur awéwé", "Niece/Nephew": "Anak dulur",
    "Father-in-law": "Bapa mitoha", "Mother-in-law": "Indung mitoha",
    "Parent-in-law": "Mitoha", "Son-in-law": "Minantu lalaki",
    "Daughter-in-law": "Minantu awéwé", "Child-in-law": "Minantu",
    "Brother-in-law": "Ipar lalaki", "Sister-in-law": "Ipar awéwé",
    "Sibling-in-law": "Ipar", "Family member": "Baraya",
    "Stepfather": "Bapa téré", "Stepmother": "Indung téré",
    "Stepson": "Anak téré lalaki",
    "Stepdaughter": "Anak téré awéwé", "Stepchild": "Anak téré",
    "Half-brother": "Dulur sabapa/saindung lalaki",
    "Half-sister": "Dulur sabapa/saindung awéwé",
    "Half-sibling": "Dulur sabapa/saindung",
    "Adoptive father": "Ayah angkat", "Adoptive mother": "Ibu angkat",
    "Adoptive son": "Putra angkat", "Adoptive daughter": "Putri angkat",
    "Adoptive child": "Anak angkat"
  },
  "bbc-toba": {
    "Selected person": "Ahu",
    "Father": "Amang", "Mother": "Inang", "Son": "Anak", "Daughter": "Boru",
    "Child": "Anak/boru", "Husband": "Tunggani doli", "Wife": "Tunggani boru",
    "Spouse": "Dongan saripe", "Grandfather": "Ompu", "Grandmother": "Ompu",
    "Grandparent": "Ompu", "Grandson": "Pahompu", "Granddaughter": "Pahompu",
    "Grandchild": "Pahompu", "Father-in-law": "Simatua",
    "Mother-in-law": "Simatua boru", "Parent-in-law": "Simatua",
    "Son-in-law": "Hela", "Daughter-in-law": "Parumaen", "Child-in-law": "Hela/Parumaen"
  },
  "btx-karo": {
    "Father": "Bapa", "Mother": "Nande", "Son": "Anak dilaki",
    "Daughter": "Anak diberu", "Child": "Anak", "Husband": "Perbulangen",
    "Wife": "Ndehara", "Grandfather": "Nini bulang", "Grandmother": "Nini tudung",
    "Grandparent": "Nini", "Grandson": "Kempu", "Granddaughter": "Kempu",
    "Grandchild": "Kempu", "Son-in-law": "Kaila", "Daughter-in-law": "Permen"
  },
  "btm-mandailing": {
    "Selected person": "Ahu", "Father": "Amang", "Mother": "Inang",
    "Son": "Anak", "Daughter": "Boru", "Child": "Anak/boru",
    "Grandfather": "Ompung halaklahi", "Grandmother": "Ompung boru",
    "Grandparent": "Ompung", "Grandson": "Pahompu", "Granddaughter": "Pahompu",
    "Grandchild": "Pahompu", "Son-in-law": "Hela"
  },
  "akb-angkola": {
    "Selected person": "Ahu", "Father": "Amang", "Mother": "Inang",
    "Son": "Anak", "Daughter": "Boru", "Child": "Anak/boru",
    "Grandfather": "Ompung halaklahi", "Grandmother": "Ompung boru",
    "Grandparent": "Ompung", "Grandson": "Pahompu", "Granddaughter": "Pahompu",
    "Grandchild": "Pahompu", "Son-in-law": "Hela", "Daughter-in-law": "Parumaen"
  },
  "bts-simalungun": {
    "Selected person": "Ahu", "Father": "Amang", "Mother": "Inang",
    "Parent": "Namatoras", "Son": "Anak", "Daughter": "Boru", "Child": "Niombah",
    "Husband": "Pargotong", "Wife": "Parsonduk",
    "Grandfather": "Ompung", "Grandmother": "Ompung", "Grandparent": "Ompung",
    "Grandson": "Pahompu", "Granddaughter": "Pahompu", "Grandchild": "Pahompu",
    "Son-in-law": "Hela", "Daughter-in-law": "Parumaen",
    "Stepmother": "Inang paduahon", "Stepchild": "Anduh"
  },
  "btd-pakpak": {
    "Father": "Bapa", "Mother": "Inang", "Son": "Dukak", "Daughter": "Dukak",
    "Child": "Dukak", "Wife": "Si ni bagas", "Grandfather": "Empung",
    "Grandparent": "Empung", "Grandson": "Kempu", "Granddaughter": "Kempu",
    "Grandchild": "Kempu", "Son-in-law": "Kela", "Daughter-in-law": "Purmain"
  }
};

const culturalGenerationLabel = (label: string, terminology: CulturalTerminology) => {
  if (!/^(?:Great-)+(?:grandfather|grandmother|grandparent|grandson|granddaughter|grandchild)$/i
      .test(label)) return undefined;
  const greatCount = label.match(/great-/gi)?.length ?? 1;
  const ancestor = /grand(?:father|mother|parent)/i.test(label);
  if (terminology === "jv-cirebon") {
    const generations = [
      "Buyut", "Canggah", "Waréng", "Udeg-udeg", "Gantung siwur", "Grepak sénté"
    ];
    return generations[Math.min(greatCount - 1, generations.length - 1)];
  }
  if (terminology === "su-priangan" && greatCount === 1) return "Buyut";
  if (terminology === "bts-simalungun" && greatCount === 1) {
    return ancestor ? "Ompung nini" : "Nono";
  }
  if (terminology === "btx-karo" && greatCount === 1) {
    return ancestor ? "Empung" : "Ente";
  }
  return undefined;
};

const culturalBasicLabel = (label: string, terminology: CulturalTerminology) => {
  const generation = culturalGenerationLabel(label, terminology);
  if (generation) return generation;
  if (/^(?:Great-)+(?:uncle|aunt)/i.test(label)) return "Kerabat generasi atas";
  if (/^(?:Great-)+(?:nephew|niece)/i.test(label)) return "Kerabat generasi bawah";
  return CULTURAL_LABELS[terminology][label] ?? localizedLabel(label, "id");
};

export function directRelationshipLabel(
  person: Person,
  relativeToPersonId: string,
  relationships: readonly FamilyRelationship[],
  language: KinshipLanguage = "en"
): string | undefined {
  const label = directRelationshipLabelEnglish(person, relativeToPersonId, relationships);
  if (!label) return undefined;
  if (language === "jv-yogyakarta" || language === "jv-east-java") {
    return javaneseBasicLabel(label, language);
  }
  if (language !== "en" && language !== "id") return culturalBasicLabel(label, language);
  return localizedLabel(label, language);
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

const personBirthRange = (person: Person) => {
  if (!person.birthDate) return undefined;
  const [year, month, day] = person.birthDate.split("-").map(Number);
  const timestamp = (monthIndex: number, dayOfMonth: number) => {
    const value = new Date(0);
    value.setUTCFullYear(year, monthIndex, dayOfMonth);
    value.setUTCHours(0, 0, 0, 0);
    return value.getTime();
  };
  const exact = timestamp(month - 1, day);
  const start = person.birthDatePrecision === "year"
    ? timestamp(0, 1)
    : person.birthDatePrecision === "month"
      ? timestamp(month - 1, 1)
      : exact;
  const end = person.birthDatePrecision === "year"
    ? timestamp(11, 31)
    : person.birthDatePrecision === "month"
      ? timestamp(month, 0)
      : exact;
  return { start, end };
};

const compareSeniority = (left: Person, right: Person) => {
  if (left.birthOrderOverride !== undefined && right.birthOrderOverride !== undefined &&
      left.birthOrderOverride !== right.birthOrderOverride) {
    return left.birthOrderOverride < right.birthOrderOverride ? -1 : 1;
  }
  const leftRange = personBirthRange(left);
  const rightRange = personBirthRange(right);
  if (leftRange && rightRange && leftRange.end < rightRange.start) return -1;
  if (leftRange && rightRange && leftRange.start > rightRange.end) return 1;
  return 0;
};

const javaneseSiblingLabel = (
  person: Person,
  reference: Person,
  terminology: JavaneseTerminology
) => {
  const seniority = compareSeniority(person, reference);
  if (seniority === 0) return "Sedulur";
  if (seniority > 0) return terminology === "jv-yogyakarta" ? "Adhi" : "Adik";
  if (person.gender === "male") {
    return terminology === "jv-yogyakarta" ? "Kangmas" : "Mas";
  }
  if (person.gender === "female") {
    return terminology === "jv-yogyakarta" ? "Mbakyu" : "Mbak";
  }
  return "Sedulur tuwa";
};

const javaneseParentSiblingLabel = (
  person: Person,
  referenceId: string,
  relationships: readonly FamilyRelationship[],
  index: KinshipIndex
) => {
  const referenceParents = indexedIds(index.parents, referenceId);
  const connectingParent = [...referenceParents]
    .map((id) => index.peopleById.get(id))
    .find((parent) => parent && areSiblings(person.id, parent.id, relationships, index));
  const seniority = connectingParent ? compareSeniority(person, connectingParent) : 0;
  if (seniority === 0) {
    return person.gender === "male" ? "Pak" : person.gender === "female" ? "Bu" : "Sedulur wong tuwa";
  }
  if (seniority < 0) {
    return person.gender === "male" ? "Pak Dhe" : person.gender === "female" ? "Bu Dhe" : "Sedulur tuwane wong tuwa";
  }
  return person.gender === "male" ? "Pak Lik" : person.gender === "female" ? "Bu Lik" : "Sedulur enome wong tuwa";
};

const javaneseCousinLabel = (
  label: string,
  terminology: JavaneseTerminology
) => {
  if (/^First cousin/i.test(label)) {
    return terminology === "jv-yogyakarta" ? "Nak-sanak" : "Misanan";
  }
  if (/^Second cousin/i.test(label)) {
    return terminology === "jv-yogyakarta" ? "Misan" : "Mindhoan";
  }
  if (/^Third cousin/i.test(label)) {
    return terminology === "jv-yogyakarta" ? "Mindho" : "Sedulur adoh";
  }
  return "Sedulur adoh";
};

const regionalKinshipLabel = (
  label: string,
  personId: string,
  relativeToPersonId: string,
  relationships: readonly FamilyRelationship[],
  terminology: JavaneseTerminology,
  index: KinshipIndex
) => {
  const person = index.peopleById.get(personId);
  const reference = index.peopleById.get(relativeToPersonId);
  if (!person || !reference) return javaneseBasicLabel(label, terminology);
  if (["Brother", "Sister", "Sibling"].includes(label)) {
    return javaneseSiblingLabel(person, reference, terminology);
  }
  if (["Uncle", "Aunt", "Aunt/Uncle"].includes(label)) {
    return javaneseParentSiblingLabel(person, relativeToPersonId, relationships, index);
  }
  if (/cousin/i.test(label)) return javaneseCousinLabel(label, terminology);
  return javaneseBasicLabel(label, terminology);
};

const biologicalSiblings = (firstId: string, secondId: string, index: KinshipIndex) => {
  if (firstId === secondId) return false;
  const explicit = index.relationshipsByPair.get(pairKey(firstId, secondId))?.some(
    (relationship) => relationship.kind === "sibling" && relationship.subtype === "sibling"
  );
  return Boolean(explicit) || [...indexedIds(index.biologicalParents, firstId)].some(
    (parentId) => indexedIds(index.biologicalParents, secondId).has(parentId)
  );
};

const siblingLabelForProfile = (
  person: Person,
  reference: Person,
  terminology: CulturalTerminology
) => {
  const seniority = compareSeniority(person, reference);
  const oppositeSex = person.gender !== "unspecified" &&
    reference.gender !== "unspecified" && person.gender !== reference.gender;
  const genderedTerm = (male: string, female: string, neutral: string) =>
    gendered(person.gender, male, female, neutral);

  switch (terminology) {
    case "jv-cirebon":
      if (seniority < 0) return genderedTerm("Kakang", "Yayu", "Sedulur tuwa");
      if (seniority > 0) return genderedTerm("Adi lanang", "Adi wadon", "Adi");
      return genderedTerm("Sedulur lanang", "Sedulur wadon", "Sedulur");
    case "su-priangan":
      if (seniority < 0) return genderedTerm("Lanceuk lalaki", "Lanceuk awéwé", "Lanceuk");
      if (seniority > 0) return genderedTerm("Adi lalaki", "Adi awéwé", "Adi");
      return genderedTerm("Dulur lalaki", "Dulur awéwé", "Dulur");
    case "bbc-toba":
      if (oppositeSex) return "Iboto";
      if (seniority < 0) return genderedTerm("Haha doli", "Haha boru", "Haha");
      if (seniority > 0) return genderedTerm("Anggi doli", "Anggi boru", "Anggi");
      return culturalBasicLabel(genderedTerm("Brother", "Sister", "Sibling"), terminology);
    case "btx-karo":
      if (seniority < 0) return "Kaka";
      if (seniority > 0) return "Agi";
      return oppositeSex ? "Turang" : "Senina";
    case "btm-mandailing":
    case "akb-angkola":
      if (oppositeSex) return "Iboto";
      if (seniority < 0) return "Angkang";
      if (seniority > 0) return "Anggi";
      return culturalBasicLabel(genderedTerm("Brother", "Sister", "Sibling"), terminology);
    case "bts-simalungun":
      if (oppositeSex) return "Botou";
      if (seniority < 0) return genderedTerm("Abang", "Kaha", "Sanina");
      if (seniority > 0) return "Anggi";
      return "Sanina";
    case "btd-pakpak":
      if (seniority < 0) return "Kaka";
      if (seniority > 0) return "Anggi";
      return oppositeSex ? "Turang" : "Sibeltek";
  }
};

interface ParentSiblingConnection {
  parent: Person;
  sibling: Person;
}

const parentSiblingConnections = (
  siblingId: string,
  referenceId: string,
  index: KinshipIndex
): ParentSiblingConnection[] => {
  const sibling = index.peopleById.get(siblingId);
  if (!sibling) return [];
  return [...indexedIds(index.biologicalParents, referenceId)]
    .sort(compareText)
    .map((id) => index.peopleById.get(id))
    .filter((candidate): candidate is Person =>
      Boolean(candidate && biologicalSiblings(sibling.id, candidate.id, index))
    )
    .map((parent) => ({ parent, sibling }));
};

const parentSiblingLabelForProfile = (
  { parent, sibling }: ParentSiblingConnection,
  terminology: CulturalTerminology
) => {
  const seniority = compareSeniority(sibling, parent);
  const older = seniority < 0;
  const younger = seniority > 0;
  if (terminology === "jv-cirebon") {
    if (older) return "Uwa";
    if (younger) return gendered(sibling.gender, "Mamang", "Bibi", "Seduluré wongtuwa");
    return "Seduluré wongtuwa";
  }
  if (terminology === "su-priangan") {
    if (older) return gendered(sibling.gender, "Ua pameget", "Ua istri", "Ua");
    if (younger) return gendered(sibling.gender, "Paman", "Bibi", "Dulur kolot");
    const side = parent.gender === "male" ? "bapa" : parent.gender === "female" ? "indung" : "kolot";
    return gendered(sibling.gender, `Dulur lalaki ${side}`, `Dulur awéwé ${side}`, `Dulur ${side}`);
  }
  if (terminology === "btx-karo") {
    if (parent.gender === "male") {
      if (sibling.gender === "female") return "Bibi";
      if (sibling.gender === "male") return older ? "Bapa tua" : younger ? "Bapa nguda" : "Bapa";
    }
    if (parent.gender === "female") {
      if (sibling.gender === "male") return "Mama";
      if (sibling.gender === "female") return "Bibi";
    }
    return undefined;
  }
  if (terminology === "btd-pakpak") {
    if (parent.gender === "male") {
      return sibling.gender === "female" ? "Namberu" : sibling.gender === "male" ? "Bapa" : undefined;
    }
    if (parent.gender === "female" && sibling.gender === "male") return "Puhun";
    return undefined;
  }
  if (terminology === "bts-simalungun") {
    if (parent.gender === "male") {
      if (sibling.gender === "female") return "Amboru";
      if (sibling.gender === "male") return older ? "Bapa tua" : "Amburu";
    }
    if (parent.gender === "female" && sibling.gender === "male") return "Tulang";
    return undefined;
  }
  if (parent.gender === "male") {
    if (sibling.gender === "female") return "Namboru";
    if (sibling.gender === "male") return older ? "Amang tua" : younger ? "Amang uda" : "Amang";
  }
  if (parent.gender === "female") {
    if (sibling.gender === "male") return "Tulang";
    if (sibling.gender === "female") {
      if (terminology === "bbc-toba") return "Inang";
      return older ? "Inang tobang" : younger ? "Bujing" : "Inang";
    }
  }
  return undefined;
};

interface CousinConnection {
  personParent: Person;
  referenceParent: Person;
}

const cousinConnections = (
  personId: string,
  referenceId: string,
  index: KinshipIndex
): CousinConnection[] => {
  const connections: CousinConnection[] = [];
  for (const personParentId of [...indexedIds(index.biologicalParents, personId)].sort(compareText)) {
    const personParent = index.peopleById.get(personParentId);
    if (!personParent) continue;
    for (const referenceParentId of [...indexedIds(index.biologicalParents, referenceId)].sort(compareText)) {
      const referenceParent = index.peopleById.get(referenceParentId);
      if (referenceParent && biologicalSiblings(personParent.id, referenceParent.id, index)) {
        connections.push({ personParent, referenceParent });
      }
    }
  }
  return connections;
};

const biologicalCousinLabel = (personId: string, referenceId: string, index: KinshipIndex) => {
  const personAncestors = indexedBiologicalAncestorDistances(personId, index);
  const referenceAncestors = indexedBiologicalAncestorDistances(referenceId, index);
  const commonAncestor = [...personAncestors.keys()]
    .filter((id) => referenceAncestors.has(id))
    .sort((left, right) => {
      const leftPerson = personAncestors.get(left)!;
      const leftReference = referenceAncestors.get(left)!;
      const rightPerson = personAncestors.get(right)!;
      const rightReference = referenceAncestors.get(right)!;
      return leftPerson + leftReference - rightPerson - rightReference ||
        Math.max(leftPerson, leftReference) - Math.max(rightPerson, rightReference) ||
        compareText(left, right);
    })[0];
  if (!commonAncestor) return undefined;
  const personDistance = personAncestors.get(commonAncestor)!;
  const referenceDistance = referenceAncestors.get(commonAncestor)!;
  if (personDistance < 2 || referenceDistance < 2) return undefined;
  return cousinLabel(
    Math.min(personDistance, referenceDistance) - 1,
    Math.abs(personDistance - referenceDistance)
  );
};

const cousinLabelForProfile = (
  englishLabel: string,
  person: Person,
  reference: Person,
  connections: readonly CousinConnection[],
  biologicalLabel: string | undefined,
  terminology: CulturalTerminology
) => {
  const connection = connections.length === 1 ? connections[0] : undefined;
  const biologicallyProven = biologicalLabel === englishLabel;
  if (terminology === "su-priangan") {
    if (englishLabel === "Second cousin") return biologicallyProven ? "Dulur mindo" : "Kerabat melalui adopsi";
    if (englishLabel === "Third cousin") return biologicallyProven ? "Dulur mintelu" : "Kerabat melalui adopsi";
    if (englishLabel !== "First cousin") return localizedLabel(englishLabel, "id");
    if (!biologicallyProven) return "Kerabat melalui adopsi";
    if (!connection) return "Dulur misan";
    const branchSeniority = compareSeniority(
      connection.personParent, connection.referenceParent
    );
    return branchSeniority < 0 ? "Kapilanceuk" : branchSeniority > 0 ? "Kapiadi" : "Dulur misan";
  }
  if (terminology === "jv-cirebon") {
    if (englishLabel === "First cousin") return biologicallyProven ? "Misanan" : "Kerabat melalui adopsi";
    if (englishLabel === "Second cousin") return biologicallyProven ? "Mindoan" : "Kerabat melalui adopsi";
    return localizedLabel(englishLabel, "id");
  }
  if (!biologicallyProven || !connection || englishLabel !== "First cousin") {
    return localizedLabel(englishLabel, "id");
  }
  const crossCousin = connection.personParent.gender !== "unspecified" &&
    connection.referenceParent.gender !== "unspecified" &&
    connection.personParent.gender !== connection.referenceParent.gender;
  if (terminology === "btx-karo" || terminology === "btd-pakpak") {
    return crossCousin ? "Impal" : "Sepupu";
  }
  if (terminology === "bbc-toba") {
    const marriageable = reference.gender === "male" && person.gender === "female" &&
      connection.referenceParent.gender === "female" && connection.personParent.gender === "male" ||
      reference.gender === "female" && person.gender === "male" &&
      connection.referenceParent.gender === "male" && connection.personParent.gender === "female";
    return marriageable ? "Pariban" : "Sepupu";
  }
  if (terminology === "btm-mandailing" || terminology === "akb-angkola") {
    if (connection.referenceParent.gender === "male" && connection.personParent.gender === "female" &&
        person.gender === "male") return "Anak namboru";
    if (connection.referenceParent.gender === "female" && connection.personParent.gender === "male" &&
        person.gender === "female") return "Boru tulang";
    return "Sepupu";
  }
  if (terminology === "bts-simalungun") {
    const botouBanua = reference.gender === "male" && person.gender === "female" &&
      connection.referenceParent.gender === "male" && connection.personParent.gender === "female" ||
      reference.gender === "female" && person.gender === "male" &&
      connection.referenceParent.gender === "female" && connection.personParent.gender === "male";
    return botouBanua ? "Botou banua" : "Sepupu";
  }
  return "Sepupu";
};

const nieceNephewLabelForProfile = (
  person: Person,
  reference: Person,
  parent: Person,
  terminology: CulturalTerminology
) => {
  const parentSeniority = compareSeniority(parent, reference);
  if (terminology === "su-priangan") {
    const base = parentSeniority < 0 ? "Alo" : parentSeniority > 0 ? "Suan" : "Anak dulur";
    return person.gender === "male" ? `${base} lalaki` : person.gender === "female" ? `${base} awéwé` : base;
  }
  if (terminology === "jv-cirebon") {
    return gendered(person.gender, "Keponakan lanang", "Keponakan wadon", "Keponakan");
  }
  if ((terminology === "bbc-toba" || terminology === "btm-mandailing" ||
      terminology === "akb-angkola") && reference.gender === "male" && parent.gender === "female") {
    return terminology === "bbc-toba" ? "Ibebere" : "Bere";
  }
  if (terminology === "bbc-toba" && reference.gender === "female" && parent.gender === "male") {
    return person.gender === "female" ? "Maen" : person.gender === "male" ? "Ama na poso" : undefined;
  }
  if (terminology === "btx-karo") {
    if (reference.gender === "male" && parent.gender === "female") return "Bere-bere";
    if (reference.gender === "female" && parent.gender === "male") return "Permen";
  }
  if (terminology === "bts-simalungun" && parent.gender === "female") return "Panogolan";
  if (terminology === "btd-pakpak" && reference.gender === "male" && parent.gender === "female") {
    return "Bebere";
  }
  return undefined;
};

const affinalLabelForProfile = (
  englishLabel: string,
  person: Person,
  reference: Person,
  terminology: CulturalTerminology,
  index: KinshipIndex
) => {
  const inLawLabel = [
    "Father-in-law", "Mother-in-law", "Parent-in-law",
    "Brother-in-law", "Sister-in-law", "Sibling-in-law"
  ].includes(englishLabel);
  if (!inLawLabel && !englishLabel.endsWith(" by marriage")) return undefined;

  const referencePartners = [...indexedIds(index.activePartners, reference.id)]
    .sort(compareText)
    .map((id) => index.peopleById.get(id))
    .filter((candidate): candidate is Person => Boolean(candidate));
  const parentInLawLabels = new Set<string>();
  for (const referencePartner of referencePartners) {
    if (indexedIds(index.biologicalParents, referencePartner.id).has(person.id)) {
      if (terminology === "btx-karo") {
        if (reference.gender === "male" && referencePartner.gender === "female") {
          if (person.gender === "male") parentInLawLabels.add("Mama");
          if (person.gender === "female") parentInLawLabels.add("Mami");
        }
        if (reference.gender === "female" && referencePartner.gender === "male") {
          if (person.gender === "male") parentInLawLabels.add("Bengkila");
          if (person.gender === "female") parentInLawLabels.add("Bibi");
        }
      }
      if (terminology === "btd-pakpak" && reference.gender === "male" &&
          referencePartner.gender === "female" && person.gender === "male") {
        parentInLawLabels.add("Puhun");
      }
    }
  }
  if (parentInLawLabels.size === 1) return [...parentInLawLabels][0];
  if (!["Brother-in-law", "Sister-in-law", "Sibling-in-law"].includes(englishLabel)) {
    return undefined;
  }

  const spouseSiblingPartners = referencePartners.filter((partner) =>
    biologicalSiblings(person.id, partner.id, index)
  );
  const siblingSpouses = [...indexedIds(index.activePartners, person.id)]
    .map((id) => index.peopleById.get(id))
    .filter((candidate): candidate is Person =>
      Boolean(candidate && biologicalSiblings(candidate.id, reference.id, index))
    );
  if (!spouseSiblingPartners.length && !siblingSpouses.length) return undefined;

  if (terminology === "su-priangan" && spouseSiblingPartners.length) {
    const labels = new Set(spouseSiblingPartners.map((partner) => {
      const seniority = compareSeniority(person, partner);
      return seniority < 0 ? "Lanceuk dahuan" : seniority > 0 ? "Adi beuteung" : undefined;
    }).filter((label) => label !== undefined));
    return labels.size === 1 ? [...labels][0] : undefined;
  }
  if (terminology === "jv-cirebon") {
    return gendered(person.gender, "Ipe lanang", "Ipe wadon", "Ipe");
  }
  if (terminology === "bbc-toba" || terminology === "btm-mandailing" ||
      terminology === "akb-angkola") {
    if (reference.gender === "male" && person.gender === "male" &&
        spouseSiblingPartners.some((partner) => partner.gender === "female")) return "Tunggane";
    if (reference.gender === "male" && person.gender === "male" &&
        siblingSpouses.some((sibling) => sibling.gender === "female")) return "Lae";
    if (reference.gender === "female" && person.gender === "female" &&
        (spouseSiblingPartners.some((partner) => partner.gender === "male") ||
          siblingSpouses.some((sibling) => sibling.gender === "male"))) return "Eda";
    return undefined;
  }
  if (terminology === "btx-karo") {
    if (reference.gender === "male" && person.gender === "male" &&
        siblingSpouses.some((sibling) => sibling.gender === "female")) return "Silih";
    if (reference.gender === "female" && person.gender === "female" &&
        spouseSiblingPartners.some((partner) => partner.gender === "male")) return "Eda";
    return undefined;
  }
  if (terminology === "bts-simalungun") {
    if (reference.gender === "male" && person.gender === "male" &&
        (spouseSiblingPartners.some((partner) => partner.gender === "female") ||
          siblingSpouses.some((sibling) => sibling.gender === "female"))) return "Lae";
    if (reference.gender === "female" && person.gender === "female" &&
        (spouseSiblingPartners.some((partner) => partner.gender === "male") ||
          siblingSpouses.some((sibling) => sibling.gender === "male"))) return "Eda";
    return undefined;
  }
  if (terminology === "btd-pakpak") {
    if (reference.gender === "male" && person.gender === "male" &&
        (spouseSiblingPartners.some((partner) => partner.gender === "female") ||
          siblingSpouses.some((sibling) => sibling.gender === "female"))) return "Silih";
    if (reference.gender === "female" && person.gender === "female" &&
        (spouseSiblingPartners.some((partner) => partner.gender === "male") ||
          siblingSpouses.some((sibling) => sibling.gender === "male"))) return "Eda";
    return undefined;
  }
  return undefined;
};

const culturalKinshipLabel = (
  englishLabel: string,
  personId: string,
  referenceId: string,
  terminology: CulturalTerminology,
  index: KinshipIndex
) => {
  const person = index.peopleById.get(personId);
  const reference = index.peopleById.get(referenceId);
  if (!person || !reference) return culturalBasicLabel(englishLabel, terminology);
  if (["Brother", "Sister", "Sibling"].includes(englishLabel) &&
      biologicalSiblings(person.id, reference.id, index)) {
    return siblingLabelForProfile(person, reference, terminology);
  }
  if (["Uncle", "Aunt", "Aunt/Uncle"].includes(englishLabel)) {
    const connections = parentSiblingConnections(person.id, reference.id, index);
    const pathLabels = new Set(connections
      .map((connection) => parentSiblingLabelForProfile(connection, terminology))
      .filter((label): label is string => Boolean(label)));
    if (pathLabels.size === 1) return [...pathLabels][0];
    if (!connections.length) return "Kerabat melalui adopsi";
  }
  if (["Nephew", "Niece", "Niece/Nephew"].includes(englishLabel)) {
    const parents = [...indexedIds(index.biologicalParents, person.id)]
      .map((id) => index.peopleById.get(id))
      .filter((candidate): candidate is Person =>
        Boolean(candidate && biologicalSiblings(candidate.id, reference.id, index))
      );
    const pathLabels = new Set(parents
      .map((parent) => nieceNephewLabelForProfile(person, reference, parent, terminology))
      .filter((label): label is string => Boolean(label)));
    if (pathLabels.size === 1) return [...pathLabels][0];
    if (!parents.length) return "Kerabat melalui adopsi";
  }
  if (/cousin/i.test(englishLabel)) {
    return cousinLabelForProfile(
      englishLabel,
      person,
      reference,
      cousinConnections(person.id, reference.id, index),
      biologicalCousinLabel(person.id, reference.id, index),
      terminology
    );
  }
  const affinal = affinalLabelForProfile(
    englishLabel, person, reference, terminology, index
  );
  return affinal ?? culturalBasicLabel(englishLabel, terminology);
};

export function kinshipLabel(
  personId: string,
  relativeToPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  language: KinshipLanguage = "en"
): string | undefined {
  const index = createKinshipIndex(people, relationships);
  const label = kinshipLabelEnglish(personId, relativeToPersonId, people, relationships, index);
  if (!label) return undefined;
  if (language === "jv-yogyakarta" || language === "jv-east-java") {
    return regionalKinshipLabel(
      label,
      personId,
      relativeToPersonId,
      relationships,
      language,
      index
    );
  }
  if (language !== "en" && language !== "id") {
    return culturalKinshipLabel(label, personId, relativeToPersonId, language, index);
  }
  return localizedLabel(label, language);
}

export function deriveKinshipLabels(
  selectedPersonId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[],
  language: KinshipLanguage = "en"
): Record<string, string> {
  const index = createKinshipIndex(people, relationships);
  return [...people]
    .sort((left, right) => compareText(left.id, right.id))
    .reduce<Record<string, string>>((labels, person) => {
      const label = kinshipLabelEnglish(
        person.id, selectedPersonId, people, relationships, index
      ) ?? "Family member";
      if (language === "jv-yogyakarta" || language === "jv-east-java") {
        labels[person.id] = regionalKinshipLabel(
          label,
          person.id,
          selectedPersonId,
          relationships,
          language,
          index
        );
      } else if (language !== "en" && language !== "id") {
        labels[person.id] = culturalKinshipLabel(
          label, person.id, selectedPersonId, language, index
        );
      } else {
        labels[person.id] = localizedLabel(label, language);
      }
      return labels;
    }, {});
}

export const getKinshipLabel = kinshipLabel;
