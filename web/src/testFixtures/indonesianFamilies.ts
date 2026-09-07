import type { FamilyRelationship, Person, RelationshipSubtype } from "../types";

export type IndonesianFamilyScenario = "extended" | "multiple-wives" | "remarried" | "adoption" | "in-laws" | "mixed" | "parent-sets" | "compound" | "linked-households" | "shared-adoption" | "shared-parent-sets" | "partial-parent-sets" | "interwoven";
export const indonesianScenarios: IndonesianFamilyScenario[] = ["extended", "multiple-wives", "remarried", "adoption", "in-laws", "mixed", "parent-sets", "compound"];
export const reconnectedScenarios: IndonesianFamilyScenario[] = ["linked-households", "shared-adoption", "shared-parent-sets", "partial-parent-sets", "interwoven"];

/** Entirely synthetic, deterministic stress data — not a prevalence or legal claim.
 * Historical adult generations, no ancestor marriages, at most two biological
 * parents, and explicit (never inferred) step/adoptive/guardian relationships.
 */
export function indonesianFamilyFixture(count: number, scenario: IndonesianFamilyScenario = "mixed", seed = 0) {
  if (!Number.isInteger(count) || count < 2 || count > 1000) throw new Error("Fixture size must be 2–1000.");
  const people: Person[] = [], relationships: FamilyRelationship[] = [];
  const names = {
    male: ["Bambang", "Agus", "Dedi", "Hendra", "Fajar", "Rizky", "Wahyu", "Arif", "Suharno", "Yusuf"],
    female: ["Siti", "Dewi", "Rina", "Ayu", "Ratna", "Nabila", "Fitri", "Wulan", "Sri", "Nur"]
  };
  const surnames = ["Pratama", "Lestari", "Saputra", "Wulandari", "Hidayat", "Maharani", "Setiawan", "Anggraini"];
  const addPerson = (gender: "male" | "female", year: number) => {
    const number = people.length;
    const person: Person = {
      id: `synthetic-${String(number).padStart(4, "0")}`, treeId: "synthetic-indonesia",
      displayName: `${names[gender][(number + seed) % 10]} ${surnames[(Math.floor(number / 10) + seed) % surnames.length]} ${number + 1}`,
      gender, birthDate: `${year}-01-01`, birthDatePrecision: "year", createdAt: "2026-01-01T00:00:00.000Z",
      ...(year + 80 < 2026 ? { deathDate: `${year + 80}-01-01` } : {}),
      notes: "Synthetic layout test data", addressLine: "", city: ["Bandung", "Surabaya", "Yogyakarta", "Makassar"][number % 4],
      province: "", country: "Indonesia", postalCode: ""
    };
    people.push(person); return person;
  };
  const connect = (from: Person, to: Person, subtype: RelationshipSubtype, year?: number) => {
    const kind = ["spouse", "formerSpouse"].includes(subtype) ? "partner" : subtype.endsWith("Sibling") ? "sibling" : "parent";
    const edge: FamilyRelationship = {
      id: `synthetic-edge-${relationships.length}`, treeId: "synthetic-indonesia", fromPersonId: from.id, toPersonId: to.id,
      kind, subtype, createdAt: "2026-01-01T00:00:00.000Z",
      ...(kind === "partner" ? { marriageDate: `${year}-06-01`, ...(subtype === "formerSpouse" ? { divorceDate: `${year! + 6}-06-01` } : {}) } : {})
    };
    relationships.push(edge); return edge;
  };
  const root = addPerson("male", 1820);
  const pending = [root];
  let household = 0;
  while (people.length < count) {
    const father = pending.shift();
    if (!father) throw new Error("Synthetic fixture has no expandable branch.");
    const birth = Number(father.birthDate!.slice(0, 4));
    const variation = (household + seed) % 5;
    const type = scenario === "mixed" ? (["extended", "multiple-wives", "remarried", "adoption", "in-laws"] as const)[variation]
      : scenario === "compound" ? (["multiple-wives", "remarried", "parent-sets", "adoption", "in-laws"] as const)[variation]
      : scenario === "interwoven" ? (["multiple-wives", "remarried", "parent-sets", "adoption", "linked-households"] as const)[variation] : scenario;
    const wives = type === "multiple-wives" ? 3 : type === "remarried" ? 2 : 1;
    const olderChildren: Person[] = [];
    for (let union = 0; union < wives && people.length < count; union++) {
      const wife = addPerson("female", birth + 2 + union * 2);
      const marriageYear = birth + 25 + union * 8;
      connect(father, wife, type === "remarried" && union === 0 ? "formerSpouse" : "spouse", marriageYear);
      let wifeParents: Person[] = [];
      if ((type === "in-laws" || type === "linked-households" || scenario === "compound") && people.length + 2 < count) {
        // Record both ancestral sides of the marriage, not just spouses who
        // arrive without parents. This deliberately joins independent branches.
        const wifeBirth = Number(wife.birthDate!.slice(0, 4));
        const grandfather = addPerson("male", wifeBirth - 27), grandmother = addPerson("female", wifeBirth - 25);
        wifeParents = [grandfather, grandmother];
        connect(grandfather, grandmother, "spouse", wifeBirth - 2);
        connect(grandfather, wife, "biologicalParent"); connect(grandmother, wife, "biologicalParent");
        if (scenario === "compound") {
          // These ancestors have another child's household and occasionally
          // their own parents, so they cannot use the isolated-in-law shortcut.
          if (people.length + 2 <= count) {
            const brother = addPerson("male", wifeBirth + 2);
            connect(grandfather, brother, "biologicalParent"); connect(grandmother, brother, "biologicalParent");
            const nephew = addPerson("female", wifeBirth + 28);
            connect(brother, nephew, "biologicalParent");
          }
          if ((household + union + seed) % 3 === 0 && people.length + 2 <= count) {
            const greatFather = addPerson("male", wifeBirth - 54), greatMother = addPerson("female", wifeBirth - 52);
            connect(greatFather, greatMother, "spouse", wifeBirth - 29);
            connect(greatFather, grandfather, "biologicalParent"); connect(greatMother, grandfather, "biologicalParent");
          }
        }
      }
      if (type === "linked-households" && wifeParents.length === 2 && people.length + 6 <= count) {
        // Two unrelated sibling pairs marry across the same two households.
        // The pedigree stays acyclic; its undirected family graph has a loop.
        let fatherParents = relationships.filter((edge) => edge.toPersonId === father.id && edge.subtype === "biologicalParent")
          .map((edge) => people.find((person) => person.id === edge.fromPersonId)!);
        if (!fatherParents.length) {
          fatherParents = [addPerson("male", birth - 27), addPerson("female", birth - 25)];
          connect(fatherParents[0], fatherParents[1], "spouse", birth - 2);
          for (const parent of fatherParents) connect(parent, father, "biologicalParent");
        }
        const sister = addPerson("female", birth + 2), brother = addPerson("male", birth + 4);
        for (const parent of fatherParents) connect(parent, sister, "biologicalParent");
        for (const parent of wifeParents) connect(parent, brother, "biologicalParent");
        connect(brother, sister, "spouse", birth + 28);
        const cousin = addPerson("female", birth + 30);
        connect(brother, cousin, "biologicalParent"); connect(sister, cousin, "biologicalParent");
      }
      const currentChildren: Person[] = [];
      let sharedAdopters: Person[] = [];
      let sharedFosterParents: Person[] = [];
      if (type === "remarried" && union === 1) {
        olderChildren.forEach((child) => connect(wife, child, "stepParent"));
        // Her daughter from a previous marriage has a recorded biological
        // father, a stepfather, and step-siblings with no shared biological parent.
        if (people.length + 2 <= count) {
          const former = addPerson("male", birth + 1);
          connect(former, wife, "formerSpouse", birth + 25);
          const daughter = addPerson("female", birth + 28);
          connect(former, daughter, "biologicalParent"); connect(wife, daughter, "biologicalParent");
          connect(father, daughter, "stepParent");
          olderChildren.forEach((child) => connect(child, daughter, "stepSibling"));
        }
      }
      for (let childIndex = 0; childIndex < 3 && people.length < count; childIndex++) {
        const child = addPerson(childIndex === 2 ? "female" : "male", marriageYear + 1 + childIndex * 2);
        const subtype = type === "adoption" && childIndex === 2 ? (household % 2 ? "fosterParent" : "adoptiveParent") : "biologicalParent";
        connect(father, child, subtype); connect(wife, child, subtype);
        currentChildren.push(child);
        if (child.gender === "male") pending.push(child);
        if (type === "shared-adoption" || type === "shared-parent-sets" || type === "partial-parent-sets") {
          if (childIndex === 1 && people.length + 2 <= count) {
            sharedAdopters = [addPerson("male", birth + 1), addPerson("female", birth + 3)];
            connect(sharedAdopters[0], sharedAdopters[1], "spouse", birth + 25);
            for (const sibling of currentChildren) for (const parent of sharedAdopters) connect(parent, sibling, "adoptiveParent");
          } else if (childIndex > 1 && type !== "partial-parent-sets") for (const parent of sharedAdopters) connect(parent, child, "adoptiveParent");
          if (type === "shared-parent-sets" || type === "partial-parent-sets") {
            // A historical archive may retain the birth, foster and adoptive
            // families. These are distinct records, not simultaneous custody
            // or a claim that every recorded parent belongs to one household.
            if (childIndex === 1 && people.length + 2 <= count) {
              sharedFosterParents = [addPerson("male", birth - 1), addPerson("female", birth + 1)];
              connect(sharedFosterParents[0], sharedFosterParents[1], "spouse", birth + 24);
              // Partial cohorts retain the first two siblings' adoption and
              // the first/third siblings' foster history. Do not infer either
              // relationship for their sibling merely from shared birth parents.
              for (const [index, sibling] of currentChildren.entries()) {
                if (type === "partial-parent-sets" && index !== 0) continue;
                for (const parent of sharedFosterParents) connect(parent, sibling, "fosterParent");
              }
            } else if (childIndex > 1) for (const parent of sharedFosterParents) connect(parent, child, "fosterParent");
            if (childIndex === 2 && people.length < count) {
              const guardian = addPerson("female", birth - 3);
              connect(guardian, child, "guardian");
            }
          }
        }
        if (type === "parent-sets" && childIndex === 2 && people.length < count) {
          // Preserve birth parents as well as a separately recorded adoptive
          // or foster household. These must not become a four-parent bus.
          const parentType = (household + seed) % 2 ? "fosterParent" : "adoptiveParent";
          const additionalFather = addPerson("male", birth + 1);
          connect(additionalFather, child, parentType);
          if (people.length < count) {
            const additionalMother = addPerson("female", birth + 3);
            connect(additionalFather, additionalMother, "spouse", birth + 25);
            connect(additionalMother, child, parentType);
          }
        }
        if (type === "adoption" && childIndex === 2 && people.length < count) {
          const guardian = addPerson("female", birth - 3);
          connect(guardian, child, "guardian");
        }
      }
      if (union > 0) for (const prior of olderChildren) for (const child of currentChildren) connect(prior, child, "halfSibling");
      olderChildren.push(...currentChildren);
    }
    household++;
  }
  return { people, relationships, rootId: root.id, scenario, seed };
}
