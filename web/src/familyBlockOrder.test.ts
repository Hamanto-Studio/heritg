import { describe, expect, it } from "vitest";
import { familyBlockOrder } from "./familyBlockOrder";

const graph = (pairs: string[][]) => {
  const nodes = [...new Set(pairs.flat())].map((id) => ({ id }));
  return { nodes, edges: pairs.map(([from, to]) => ({ from: nodes.find((node) => node.id === from)!, to: nodes.find((node) => node.id === to)! })) };
};
const theta = () => graph([
  ["grandparent", "first-household"], ["grandparent", "second-household"],
  ["other-grandparents", "first-sibling"], ["other-grandparents", "second-sibling"],
  ["first-household", "first-cousins-parent"], ["first-cousins-parent", "third-household"],
  ["third-household", "first-cousin"], ["first-cousin", "new-union"],
  ["second-household", "third-sibling"], ["second-household", "fourth-sibling"],
  ["third-sibling", "fourth-household"], ["first-sibling", "fourth-household"],
  ["fourth-sibling", "fifth-household"], ["second-sibling", "fifth-household"],
  ["fifth-household", "second-cousin"], ["second-cousin", "new-union"]
]);

describe("bounded two-sided family block order", () => {
  it("retains every node and directed edge without interleaving arcs on either side", () => {
    const { nodes, edges } = theta(), before = JSON.stringify({ nodes, edges });
    const result = familyBlockOrder(nodes, edges)!;
    expect(result).toBeDefined();
    expect(new Set(result.nodes)).toEqual(new Set(nodes));
    expect(new Set(result.arcs.keys())).toEqual(new Set(edges));
    const at = new Map(result.nodes.map((node, index) => [node, index]));
    for (const [edge, arc] of result.arcs) {
      const a = at.get(edge.from)!, b = at.get(edge.to)!;
      expect(a).toBeLessThan(b);
      expect(arc.span).toBe(b - a);
      for (const [other, otherArc] of result.arcs) if (otherArc.side === arc.side) {
        const c = at.get(other.from)!, d = at.get(other.to)!;
        expect(a < c && c < b && b < d || c < a && a < d && d < b).toBe(false);
      }
    }
    expect(familyBlockOrder([...nodes].reverse(), [...edges].reverse())).toEqual(result);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it("declines a non-planar block, directed cycles and incomplete records", () => {
    const nonPlanar = graph(["a", "b", "c"].flatMap((from) => ["d", "e", "f"].map((to) => [from, to])));
    expect(familyBlockOrder(nonPlanar.nodes, nonPlanar.edges)).toBeUndefined();
    const cycle = graph([["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(familyBlockOrder(cycle.nodes, cycle.edges)).toBeUndefined();
    const { nodes, edges } = theta();
    expect(familyBlockOrder(nodes.slice(1), edges)).toBeUndefined();
    expect(familyBlockOrder([...nodes, nodes[0]], edges)).toBeUndefined();
    expect(familyBlockOrder(Array.from({ length: 25 }, (_, i) => ({ id: `${i}` })), [])).toBeUndefined();
  });

  it("bounds unsuccessful ordering work even with many independent ancestors", () => {
    const { nodes, edges } = graph([["a", "b"], ["b", "a"]]);
    const unrelated = Array.from({ length: 22 }, (_, i) => ({ id: `other-${i}` }));
    expect(familyBlockOrder([...nodes, ...unrelated], edges)).toBeUndefined();
  }, 1000);
});
