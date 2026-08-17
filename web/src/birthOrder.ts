import type { FamilyRelationship, Person } from "./types";

export const BIRTH_ORDER_BADGE = {
  offset: 23,
  radius: 10
} as const;

export function birthOrderLabel(order: number, language: "en" | "id"): string {
  if (language === "id") {
    if (order === 1) return "Anak pertama";
    if (order === 2) return "Anak kedua";
    if (order === 3) return "Anak ketiga";
    return `Anak ke-${order}`;
  }
  if (order === 1) return "First child";
  if (order === 2) return "Second child";
  if (order === 3) return "Third child";
  const remainder = order % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? "th"
    : order % 10 === 1 ? "st" : order % 10 === 2 ? "nd" : order % 10 === 3 ? "rd" : "th";
  return `${order}${suffix} child`;
}

const birthRange = (person: Person) => {
  if (!person.birthDate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.birthDate);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = Date.UTC(year, month - 1, day);
  const end = person.birthDatePrecision === "year"
    ? Date.UTC(year, 11, 31)
    : person.birthDatePrecision === "month"
      ? Date.UTC(year, month, 0)
      : start;
  return { start, end };
};

export function deriveBirthOrders(
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): ReadonlyMap<string, number> {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const parentsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== "parent" || relationship.subtype !== "biologicalParent") continue;
    const parents = parentsByChild.get(relationship.toPersonId) ?? [];
    parents.push(relationship.fromPersonId);
    parentsByChild.set(relationship.toPersonId, parents);
  }
  const childrenByFamily = new Map<string, string[]>();
  for (const [childId, parentIds] of parentsByChild) {
    const familyId = [...new Set(parentIds)].sort().join("\u001f");
    if (!familyId) continue;
    const children = childrenByFamily.get(familyId) ?? [];
    children.push(childId);
    childrenByFamily.set(familyId, children);
  }

  const orders = new Map<string, number>();
  for (const childIds of childrenByFamily.values()) {
    if (childIds.length < 2) continue;
    const dated = childIds.map((id) => {
      const person = peopleById.get(id);
      const range = person && birthRange(person);
      return person && range ? { id, ...range } : undefined;
    });
    if (dated.some((value) => !value)) continue;
    const ordered = dated.filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    if (ordered.some((value, index) => index > 0 && ordered[index - 1].end >= value.start)) {
      continue;
    }
    ordered.forEach((value, index) => orders.set(value.id, index + 1));
  }
  return orders;
}
