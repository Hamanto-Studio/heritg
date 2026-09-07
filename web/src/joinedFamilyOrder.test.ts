import { describe, expect, it, vi } from "vitest";
import * as ordering from "./joinedFamilyOrder";
import type { LayerNode } from "./joinedFamilyOrder";
import { prepareTree } from "./treePreparation";
import { createTreeLayout } from "./layout";
import { buildChartSvg } from "./chartExport";
import { focusedFamily } from "./focusedFamily";
import { routeClarity } from "./testFixtures/routeClarity";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, language: "en" | "id" = "id") => prepareTree({ ...data,
  requestKey: "joined-family-order", generationLimits: { ancestors: null, descendants: null },
  // Isolate the compact row-order algorithm. Full-tree admission is tested
  // separately, so a newer corridor layout cannot mask an ordering regression.
  language, relationshipLanguage: language, controlsVisible: true, layoutMode: "focus" });

const graph = () => {
  const nodes: LayerNode[] = [];
  const add = (id: string, rank: number, x: number, count = 1) => {
    const node: LayerNode = { id, rank, x, width: count ? count * 260 : 24,
      members: Array.from({ length: count }, (_, i) => `${id}-${i}`), incoming: [], outgoing: [] };
    nodes.push(node); return node;
  };
  const connect = (from: LayerNode, to: LayerNode) => {
    const edge = { from, to, fromPort: 0, toPort: 0 };
    from.outgoing.push(edge); to.incoming.push(edge);
  };
  const parents = add("parents", 0, 0, 2), hub = add("family", 1, 0, 0);
  connect(parents, hub);
  const branches = [-1, 1].map((side) => {
    const person = add(`child-${side}`, 2, side * 400, 2);
    const origin = add(`origin-${side}`, 1, side * 300, 0);
    const ancestors = add(`ancestors-${side}`, 0, side * 800, 2);
    const sibling = add(`sibling-${side}`, 2, side * 1000);
    connect(hub, person); connect(ancestors, origin); connect(origin, person); connect(origin, sibling);
    return [person, origin, ancestors, sibling];
  });
  return { nodes, branches, connect, add };
};

describe("whole-branch ordering for joined ancestry", () => {
  it("keeps both spouse-origin branches distinct, with deterministic order and no graph mutation", () => {
    const { nodes, branches, add, connect } = graph();
    const separate = add("unrelated", 0, 1000), child = add("unrelated-child", 1, 1000);
    connect(separate, child);
    const snapshot = () => nodes.map((node) => ({ id: node.id, x: node.x, rank: node.rank, members: [...node.members],
      incoming: node.incoming.map((edge) => edge.from.id), outgoing: node.outgoing.map((edge) => edge.to.id) }));
    const before = snapshot();
    const result = ordering.joinedFamilyBranchOrder(nodes, 260, 200)!;
    const ranges = branches.map((branch) => branch.map((node) => result.get(node)!));
    expect(Math.max(...ranges[0]) < Math.min(...ranges[1]) || Math.max(...ranges[1]) < Math.min(...ranges[0])).toBe(true);
    expect(result.size).toBe(nodes.length);
    expect(ordering.joinedFamilyBranchOrder([...nodes].reverse(), 260, 200)).toEqual(result);
    expect(snapshot()).toEqual(before);
  });

  it.each(["cycle", "parallel"])("retains the general ordering for a %s instead of deleting a family path", (variant) => {
    const { nodes, branches, connect } = graph();
    connect(branches[0][1], variant === "cycle" ? branches[1][0] : branches[0][0]);
    const edges = nodes.reduce((sum, node) => sum + node.outgoing.length, 0);
    expect(ordering.joinedFamilyBranchOrder(nodes, 260, 200)).toBeUndefined();
    expect(nodes.reduce((sum, node) => sum + node.outgoing.length, 0)).toBe(edges);
  });

  it("reduces routed crossings in a 100-person compound family, not just abstract edge inversions", () => {
    const data = indonesianFamilyFixture(100, "compound"), before = JSON.stringify(data);
    const bypass = vi.spyOn(ordering, "joinedFamilyBranchOrder").mockReturnValue(undefined);
    let baseline;
    try { baseline = prepare(data); } finally { bypass.mockRestore(); }
    const revised = prepare(data);
    const oldResult = routeClarity(baseline.geometryLayout, baseline.connectionPlan);
    const result = routeClarity(revised.geometryLayout, revised.connectionPlan);
    console.info(JSON.stringify({ scenario: "compound", size: 100, withoutBranchSeed: oldResult.crossings, withBranchSeed: result.crossings }));
    expect(oldResult).toMatchObject(integrity);
    expect(result).toMatchObject({ ...integrity, people: 100 });
    expect(result.crossings).toBeLessThan(oldResult.crossings);
    expect(result.crossings).toBeLessThanOrEqual(24);
    expect(revised.geometryLayout.people.map(({ id, generation }) => ({ id, generation })))
      .toEqual(baseline.geometryLayout.people.map(({ id, generation }) => ({ id, generation })));
    expect(JSON.stringify(data)).toBe(before);
  });

  // Residual-crossing budgets protect measured progress, NOT final clarity
  // acceptance. These compound charts still need further placement/routing.
  it.each([{ seed: 0, crossings: 183 }, { seed: 2, crossings: 299 }, { seed: 4, crossings: 239 }])(
    "retains all 500 compound records without new integrity defects for seed $seed", ({ seed, crossings }) => {
      const data = indonesianFamilyFixture(500, "compound", seed), before = JSON.stringify(data);
      const scene = prepare(data);
      expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject({ ...integrity, people: 500 });
      expect(scene.connectionPlan.isValid).toBe(true);
      expect(scene.connectionPlan.crossings.length).toBeLessThanOrEqual(crossings);
      expect(createTreeLayout([...data.people].reverse(), [...data.relationships].reverse())).toEqual(scene.geometryLayout);
      expect(JSON.stringify(data)).toBe(before);
    }, 30000);

  it.each(["en", "id"] as const)("preserves complete export routes and several Focus branches in %s", (language) => {
    const data = indonesianFamilyFixture(100, "compound");
    const scene = prepare(data, language);
    expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject(integrity);
    const svg = new DOMParser().parseFromString(buildChartSvg(scene.geometryLayout, "Synthetic joined family", undefined, language, scene.connectionPlan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(100);
    for (const route of scene.connectionPlan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
    for (const family of scene.connectionPlan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    for (const personId of [data.rootId, "synthetic-0011", "synthetic-0045", "synthetic-0082"]) {
      const focus = focusedFamily(data.people, data.relationships, { personId, ancestors: 2, descendants: 1, siblings: true });
      const prepared = prepare({ ...data, ...focus }, language);
      expect(routeClarity(prepared.geometryLayout, prepared.connectionPlan)).toMatchObject({ ...integrity, people: focus.people.length });
    }
  }, 15000);
});
