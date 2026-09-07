import { describe, expect, it } from "vitest";
import { ancestorNodes, familyIndex, type AncestorNode } from "./familyExplorers";
import { chartCard, familyPedigreeLayout, fanChildFontSize, fanChildLayout, fanChildrenPerPage, fanLabelLayout } from "./explorerChartGeometry";
import { fitFanName } from "./fanNameLayout";
import type { Person, FamilyRelationship } from "./types";

const person = (id: string): Person => ({ id, treeId: 't', displayName: id, gender: 'unspecified', birthDatePrecision: 'year', createdAt: '', notes: '', addressLine: '', city: '', province: '', country: '', postalCode: '' });
const relationship = (from: string, to: string): FamilyRelationship => ({ id: from + to, treeId: 't', kind: 'parent', subtype: 'adoptiveParent', fromPersonId: from, toPersonId: to, createdAt: '' });
describe('family chart geometry', () => {
  it.each([0, 1, 2, 44, 200])('fits %i children to the left without overlapping or changing ancestry', (count) => {
    const people = ['root', 'parent', 'grandparent'].map(person);
    const nodes = ancestorNodes(familyIndex(people, [relationship('parent', 'root'), relationship('grandparent', 'parent')]), 'root', 5).nodes;
    const before = JSON.stringify(nodes);
    const layout = familyPedigreeLayout(nodes, Array.from({ length: count }, (_, i) => 'child' + i));
    expect(layout.children).toHaveLength(count);
    for (const [i, child] of layout.children.entries()) {
      expect(child.x + chartCard.width).toBeLessThan(layout.rootX);
      expect(child.y - chartCard.height / 2).toBeGreaterThanOrEqual(40);
      expect(child.y + chartCard.height / 2).toBeLessThan(layout.height);
      if (i) expect(child.y - layout.children[i - 1].y).toBeGreaterThan(chartCard.height);
    }
    for (const node of nodes) {
      expect(layout.y.get(node.key)! - chartCard.height / 2).toBeGreaterThanOrEqual(0);
      expect(layout.y.get(node.key)! + chartCard.height / 2).toBeLessThanOrEqual(layout.height);
      if (node.depth) expect(layout.x(node.depth)).toBeGreaterThan(layout.rootX + chartCard.width);
    }
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('keeps tangential label boxes inside their annular sectors', () => {
    for (let depth = 1; depth <= 5; depth++) for (let count = 2; count <= 32; count *= 2) for (let i = 0; i < count; i++) {
      const node: AncestorNode = { key: String(i), depth, start: i / count, end: (i + 1) / count, repeat: false };
      const label = fanLabelLayout(node, 0, 0);
      if (label.width < 16) continue;
      const radius = 72 + (depth - 1) * 78 + 39;
      const halfAngle = Math.PI / count / 2;
      expect(Math.atan2(label.width / 2, radius - 14)).toBeLessThan(halfAngle);
      expect(Math.hypot(label.width / 2, radius + 14)).toBeLessThan(72 + depth * 78);
    }
  });
  it.each([0, 1, 2, 4, 5, 20, 44, 200])('keeps %i children in non-overlapping lower fan sectors and makes every child reachable', (count) => {
    const ids = Array.from({ length: count }, (_, i) => `child-${i}`);
    const seen: string[] = [];
    for (let page = 0; page < Math.max(1, Math.ceil(count / fanChildrenPerPage)); page++) {
      const layout = fanChildLayout(ids, page, 0, 0, 462);
      expect(layout.children.length).toBeLessThanOrEqual(fanChildrenPerPage);
      for (const [i, child] of layout.children.entries()) {
        seen.push(child.id);
        expect(child.label.y).toBeGreaterThan(0);
        expect(child.label.rotation).toBeGreaterThanOrEqual(-90);
        expect(child.label.rotation).toBeLessThanOrEqual(90);
        expect(child.start).toBeGreaterThanOrEqual(i ? layout.children[i - 1].end : 0);
        expect(child.end).toBeLessThanOrEqual(1);
        const radius = (child.inner + child.outer) / 2;
        const angle = Math.PI * (child.end - child.start) / 2;
        expect(Math.atan2(child.label.width / 2, radius - 24)).toBeLessThan(angle);
        expect(Math.hypot(child.label.width / 2, radius + 24)).toBeLessThan(child.outer);
        expect(radius - 24).toBeGreaterThan(child.inner);
      }
    }
    expect(seen).toEqual(ids);
    expect(fanChildLayout(ids, 999, 0, 0, 150).page).toBe(Math.max(0, Math.ceil(count / fanChildrenPerPage) - 1));
    expect(fanChildLayout(ids, -1, 0, 0, 150).page).toBe(0);
  });
  it.each([150, 306, 462])('keeps child text readable and within the ring at ancestor radius %i on narrow phones', (radius) => {
    const renderScale = 296 / (Math.max(radius, 190) * 2 + 48);
    const fontSize = fanChildFontSize(renderScale);
    expect(fontSize * renderScale).toBeGreaterThanOrEqual(12);
    for (const child of fanChildLayout(['a', 'b', 'c', 'd'], 0, 0, 0, radius).children) {
      const centerRadius = (child.inner + child.outer) / 2;
      expect(centerRadius - child.label.height / 2).toBeGreaterThan(child.inner);
      expect(Math.hypot(child.label.width / 2, centerRadius + child.label.height / 2)).toBeLessThan(child.outer);
      expect(fitFanName('Child 10', child.label, fontSize).lines.join(' ')).toBe('Child 10');
    }
  });
});
