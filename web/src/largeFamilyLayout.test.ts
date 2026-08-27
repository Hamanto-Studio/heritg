import { describe, expect, it } from "vitest";

import { createConnectionPlan } from "./connectionPlan";
import { ROUTE_EPSILON, segmentOrientation, type RouteSegment } from "./connectionGeometry";
import { createTreeLayout, LAYOUT_METRICS } from "./layout";
import type { FamilyRelationship, Gender, Person } from "./types";

const personData: Array<[string, Gender, string]> = [
  ["Hadi Santoso", "male", "1922-02-12"], ["Aminah Mulyani", "female", "1926-07-08"],
  ["Darmawan Pranoto", "male", "1924-05-21"], ["Sri Wahyuni", "female", "1928-09-02"],
  ["Ahmad Rahman", "male", "1923-03-17"], ["Nurhayati Karim", "female", "1927-10-30"],
  ["Yusuf Setiawan", "male", "1925-01-06"], ["Fatimah Zahra", "female", "1929-12-19"],
  ["Sutrisno Santoso", "male", "1947-04-04"], ["Bambang Santoso", "male", "1950-11-16"],
  ["Rini Santoso", "female", "1954-06-28"], ["Dewi Pranoto", "female", "1950-01-09"],
  ["Indra Pranoto", "male", "1953-08-25"], ["Hasan Rahman", "male", "1948-02-07"],
  ["Hendra Rahman", "male", "1951-07-13"], ["Mariam Rahman", "female", "1955-12-22"],
  ["Salmah Setiawan", "female", "1952-05-11"], ["Zainab Setiawan", "female", "1956-10-03"],
  ["Budi Santoso", "male", "1971-01-15"], ["Ratna Lestari", "female", "1974-09-27"],
  ["Agus Santoso", "male", "1978-06-06"], ["Lestari Handayani", "female", "1953-03-18"],
  ["Dimas Santoso", "male", "1976-02-12"], ["Maya Santoso", "female", "1979-11-30"],
  ["Joko Wijaya", "male", "1951-08-01"], ["Arif Wijaya", "male", "1978-04-23"],
  ["Nita Wijaya", "female", "1981-12-14"], ["Kusuma Dewi", "female", "1956-05-05"],
  ["Reza Pranoto", "male", "1980-07-19"], ["Putri Pranoto", "female", "1984-03-08"],
  ["Siti Rahmawati", "female", "1973-10-02"], ["Farid Rahman", "male", "1976-01-17"],
  ["Lina Rahman", "female", "1980-05-29"], ["Yuliana Sari", "female", "1955-09-10"],
  ["Rafi Rahman", "male", "1979-11-21"], ["Dina Rahman", "female", "1983-04-07"],
  ["Wahyu Nugroho", "male", "1952-02-26"], ["Ilham Nugroho", "male", "1981-06-13"],
  ["Fitri Nugroho", "female", "1984-10-31"], ["Ridwan Hakim", "male", "1954-12-09"],
  ["Nadia Hakim", "female", "1982-03-24"], ["Fikri Hakim", "male", "1985-08-16"],
  ["Andi Pratama Santoso", "male", "1996-07-11"], ["Citra Ayu Santoso", "female", "1999-02-05"],
  ["Bayu Mahendra Santoso", "male", "2003-10-18"], ["Eko Saputra", "male", "1972-05-03"],
  ["Ayu Sekar Saputra", "female", "1998-01-22"], ["Fajar Aditya Saputra", "male", "2001-09-09"],
  ["Rina Kurnia", "female", "1980-04-14"], ["Galih Santoso", "male", "2004-06-27"],
  ["Kirana Santoso", "female", "2007-12-08"], ["Wulan Pertiwi", "female", "1979-08-20"],
  ["Naufal Santoso", "male", "2003-03-06"], ["Zahra Santoso", "female", "2006-11-12"],
  ["Melati Putri", "female", "1981-10-25"], ["Rizky Wijaya", "male", "2007-02-01"],
  ["Anisa Wijaya", "female", "2010-07-19"], ["Intan Permata", "female", "1978-01-07"],
  ["Salman Rahman", "male", "2002-05-30"], ["Sekar Larasati", "female", "1982-09-15"]
];

const familyData: Array<[number, number, number[]]> = [
  [1, 2, [9, 10, 11]], [3, 4, [12, 13]], [5, 6, [14, 15, 16]], [7, 8, [17, 18]],
  [9, 12, [19, 20, 21]], [10, 22, [23, 24]], [25, 11, [26, 27]], [13, 28, [29, 30]],
  [14, 17, [31, 32, 33]], [15, 34, [35, 36]], [37, 16, [38, 39]], [40, 18, [41, 42]],
  [19, 31, [43, 44, 45]], [46, 20, [47, 48]], [21, 49, [50, 51]], [23, 52, [53, 54]],
  [26, 55, [56, 57]], [32, 58, [59]], [35, 60, []]
];

const idFor = (value: number) => `person-${String(value).padStart(2, "0")}`;
const createdAt = "2026-08-25T00:00:00.000Z";
const people: Person[] = personData.map(([displayName, gender, birthDate], index) => ({
  id: idFor(index + 1), treeId: "marketing", displayName, gender, birthDate,
  createdAt, birthDatePrecision: "exact", notes: "", addressLine: "", city: "",
  province: "", country: "", postalCode: ""
}));
const relationships: FamilyRelationship[] = familyData.flatMap(([first, second, children], familyIndex) => [
  {
    id: `partner-${familyIndex}`, treeId: "marketing", fromPersonId: idFor(first),
    toPersonId: idFor(second), kind: "partner" as const, subtype: "spouse" as const, createdAt
  },
  ...children.flatMap((child) => [first, second].map((parent) => ({
    id: `parent-${familyIndex}-${parent}-${child}`, treeId: "marketing", fromPersonId: idFor(parent),
    toPersonId: idFor(child), kind: "parent" as const,
    subtype: "biologicalParent" as const, createdAt
  })))
]);

const horizontalOverlap = (left: RouteSegment, right: RouteSegment) =>
  Math.min(Math.max(left.start.x, left.end.x), Math.max(right.start.x, right.end.x)) -
  Math.max(Math.min(left.start.x, left.end.x), Math.min(right.start.x, right.end.x));

describe("large connected family layout", () => {
  it("keeps the 60-person marketing family spacious, grouped, and readable", () => {
    const layout = createTreeLayout(people, relationships);
    const plan = createConnectionPlan(layout, "id", undefined, false);
    const generationCounts = [...new Set(layout.people.map(({ generation }) => generation))]
      .sort().map((generation) => layout.people.filter((person) => person.generation === generation).length);
    expect(generationCounts).toEqual([8, 16, 24, 12]);
    expect([...new Set(layout.people.map(({ y }) => y))]).toEqual([0, 360, 720, 1080]);
    for (const generation of [0, 1, 2, 3]) {
      const row = layout.people.filter((person) => person.generation === generation)
        .sort((left, right) => left.x - right.x);
      row.slice(1).forEach((person, index) =>
        expect(person.x - row[index].x).toBeGreaterThanOrEqual(
          LAYOUT_METRICS.horizontalSpacing - ROUTE_EPSILON
        )
      );
    }

    const parent = new Map<string, string>();
    people.forEach(({ id }) => parent.set(id, id));
    const find = (id: string): string => parent.get(id) === id ? id : find(parent.get(id)!);
    relationships.filter(({ kind }) => kind === "partner").forEach((relationship) =>
      parent.set(find(relationship.toPersonId), find(relationship.fromPersonId))
    );
    let intruders = 0;
    for (const family of plan.families) {
      const childGroups = new Set(family.childIds.map(find));
      const rowGroups = layout.people.filter((person) => family.childIds.some((id) =>
        layout.people.find((candidate) => candidate.id === id)?.generation === person.generation
      )).sort((left, right) => left.x - right.x).map(({ id }) => find(id));
      const indices = rowGroups.map((group, index) => childGroups.has(group) ? index : -1)
        .filter((index) => index >= 0);
      for (let index = Math.min(...indices); index <= Math.max(...indices); index += 1) {
        if (!childGroups.has(rowGroups[index])) intruders += 1;
      }
    }
    expect(intruders).toBe(0);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
    expect(plan.crossings.length).toBeLessThanOrEqual(5);
    expect(new Set(plan.families.flatMap(({ relationshipIds }) => relationshipIds)).size)
      .toBe(relationships.filter(({ kind }) => kind === "parent").length);
    expect(plan.nonParentRoutes.map(({ id }) => id).sort()).toEqual(
      relationships.filter(({ kind }) => kind !== "parent").map(({ id }) => id).sort()
    );

    const familyHorizontals = plan.families.map((family) => family.segments
      .filter((segment) => segmentOrientation(segment) === "horizontal"));
    const longest = Math.max(...familyHorizontals.flat().map((segment) =>
      Math.abs(segment.end.x - segment.start.x)
    ));
    expect(longest).toBeLessThanOrEqual(1_600);
    familyHorizontals.forEach((segments, familyIndex) => segments.forEach((segment) =>
      familyHorizontals.slice(familyIndex + 1).flat().forEach((other) => {
        if (Math.abs(segment.start.y - other.start.y) >= 20) return;
        expect(horizontalOverlap(segment, other)).toBeLessThanOrEqual(ROUTE_EPSILON);
      })
    ));

    const reversed = createTreeLayout([...people].reverse(), [...relationships].reverse());
    expect(reversed.people.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      layout.people.map(({ id, x, y }) => ({ id, x, y }))
    );
    expect(createConnectionPlan(reversed, "id", undefined, false)).toEqual(plan);
  });
});
