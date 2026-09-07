import { describe, expect, it } from "vitest";
import { ancestorChartLayout, ancestorNodes, familyIndex, filterPeople } from "./familyExplorers";
import type { Person, FamilyRelationship } from "./types";

const person = (id: string, fields: Partial<Person> = {}): Person => ({ id, displayName: id, treeId: "t", gender: "unspecified", birthDatePrecision: "year", createdAt: "2026-01-01", notes: "", addressLine: "", city: "", province: "", country: "", postalCode: "", ...fields });
const parent = (from: string, to: string): FamilyRelationship => ({ id: `${from}-${to}`, treeId: "t", kind: "parent", subtype: "biologicalParent", fromPersonId: from, toPersonId: to, createdAt: "2026-01-01" });
describe("alternate family views", () => {
  it("preserves all parent types, half-siblings and repeated ancestors without cycles or data changes", () => {
    const people = ['a', 'b', 'c', 'd', 'sibling', 'grandparent'].map((id) => person(id));
    const relationships = [parent('b', 'a'), parent('c', 'a'), { ...parent('d', 'a'), subtype: 'adoptiveParent' as const },
      parent('b', 'sibling'), parent('grandparent', 'b'), parent('grandparent', 'c'), parent('a', 'grandparent'), parent('missing', 'a')];
    const before = JSON.stringify({ people, relationships });
    const index = familyIndex(people, relationships);
    expect(index.parents.get('a')).toEqual(['b', 'c', 'd']);
    expect(index.siblings.get('a')).toContain('sibling');
    const { nodes } = ancestorNodes(index, 'a', 5);
    expect(nodes.filter((n) => n.personId === 'grandparent')).toHaveLength(2);
    expect(nodes.some((n) => n.personId === 'a' && n.repeat)).toBe(true);
    expect(nodes.some((n) => !n.personId)).toBe(true);
    expect(new Set(nodes.map((n) => n.key)).size).toBe(nodes.length);
    expect(nodes.every((n) => n.depth <= 5 && n.start >= 0 && n.end <= 1)).toBe(true);
    expect(JSON.stringify({ people, relationships })).toBe(before);
  });
  it("bounds very broad ancestor graphs and handles empty data", () => {
    const people = Array.from({ length: 800 }, (_, i) => person(String(i)));
    const relationships = people.slice(1).map((p) => parent(p.id, String(Math.floor((Number(p.id) - 1) / 8))));
    const result = ancestorNodes(familyIndex(people, relationships), '0', 5);
    expect(result.nodes.length).toBeLessThanOrEqual(512);
    expect(result.truncated).toBe(true);
    const layout = ancestorChartLayout(result.nodes);
    expect(layout.height).toBeLessThanOrEqual(result.nodes.length * 86);
    expect([...layout.y.values()].every((y) => Number.isFinite(y) && y >= 0 && y <= layout.height)).toBe(true);
    expect(ancestorNodes(familyIndex([], []), 'missing', 3).nodes).toEqual([]);
  });
  it("sorts a copy and keeps missing birthdays at the end in either date order", () => {
    const people = [person('Z'), person('A', { birthDate: '1980', city: 'Bandung' }), person('B', { birthDate: '2000' })];
    expect(filterPeople(people, '', 'youngest').map((p) => p.id)).toEqual(['B', 'A', 'Z']);
    expect(filterPeople(people, ' bandung ', 'name').map((p) => p.id)).toEqual(['A']);
    expect(people.map((p) => p.id)).toEqual(['Z', 'A', 'B']);
  });
});
