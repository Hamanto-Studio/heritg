import { describe, expect, it, vi } from "vitest";
import * as corridors from "./inlawCorridors";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { parentConnectionGroups } from "./parentConnections";
import { familyRouteLanes } from "./familyRouteLanes";
import { buildChartSvg } from "./chartExport";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { prepareTree } from "./treePreparation";
import type { FamilyRelationship, PositionedPerson } from "./types";

const person = (id: string, x: number, y: number): PositionedPerson => ({
  ...indonesianFamilyFixture(2).people[0], id, displayName: id, x, y, generation: y / 260, role: " "
});
const parent = (from: string, to: string): FamilyRelationship => ({ id: `${from}:${to}`, treeId: "test",
  fromPersonId: from, toPersonId: to, kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01" });
const partner = (from: string, to: string): FamilyRelationship => ({ ...parent(from, to), kind: "partner", subtype: "spouse" });
const fixture = () => ({
  people: [person("father", -260, 0), person("mother", 0, 0), person("inlaw-a", 1000, 0), person("inlaw-b", 1260, 0),
    person("child", 0, 260), person("spouse", 260, 260), person("sibling", 780, 260)],
  relationships: [partner("father", "mother"), partner("inlaw-a", "inlaw-b"), partner("child", "spouse"),
    ...["child", "sibling"].flatMap((id) => [parent("father", id), parent("mother", id)]),
    parent("inlaw-a", "spouse"), parent("inlaw-b", "spouse")]
});

describe("inset ancestry corridors", () => {
  it("separates an independent in-law couple below the sibling rail without changing generations or records", () => {
    const data = fixture(), records = JSON.stringify(data.relationships);
    const before = new Map(data.people.map((p) => [p.id, p.generation]));
    const familyRailY = corridors.insetInlawAncestors(data.people, data.relationships, 260);
    const personById = new Map(data.people.map((p) => [p.id, p]));
    expect(personById.get("inlaw-a")!.y).toBe(260);
    expect(personById.get("inlaw-b")!.y).toBe(260);
    expect(personById.get("child")!.y).toBe(520);
    expect(personById.get("spouse")!.y).toBe(520);
    for (const p of data.people) expect(p.generation).toBe(before.get(p.id));
    expect(JSON.stringify(data.relationships)).toBe(records);
    const layout = { ...data, familyRailY, width: 1500, height: 800 };
    const plan = createConnectionPlan(layout, "id", undefined, false);
    expect(plan.isValid).toBe(true);
    expect(routeClarity(layout, plan)).toMatchObject({ missingParentOrPartnerEdges: 0, missingTerminals: 0,
      disconnectedRoutes: 0, obstacleHits: 0, unrelatedOverlaps: 0, crossings: 0, failures: 0 });
    const upper = plan.families.find((family) => family.childIds.length > 1)!;
    expect(Math.max(...upper.segments.filter((s) => s.start.y === s.end.y).map((s) => s.start.y))).toBeLessThan(228);
    const svg = buildChartSvg(layout, "Synthetic in-laws", undefined, "id", plan).svg;
    const exported = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(exported.querySelectorAll("[data-person-id]")).toHaveLength(data.people.length);
    for (const family of plan.families) expect(exported.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
  });

  it("does not move ancestors with another recorded child or incoming ancestry", () => {
    for (const edge of [parent("inlaw-a", "sibling"), parent("father", "inlaw-a")]) {
      const data = fixture(); data.relationships.push(edge);
      const before = JSON.stringify(data.people);
      expect(corridors.insetInlawAncestors(data.people, data.relationships, 260)).toEqual({});
      expect(JSON.stringify(data.people)).toBe(before);
    }
  });

  it("rejects a slot crossed by another child's name/ancestor column", () => {
    const data = fixture(); data.people.find((p) => p.id === "sibling")!.x = 390;
    const before = JSON.stringify(data.people);
    expect(corridors.insetInlawAncestors(data.people, data.relationships, 260)).toEqual({});
    expect(JSON.stringify(data.people)).toBe(before);
  });

  it("allocates child lanes by physical rail level, not only the child row", () => {
    const data = fixture();
    const railY = corridors.insetInlawAncestors(data.people, data.relationships, 260);
    const groups = parentConnectionGroups(data.relationships);
    const lower = groups.find((family) => family.childIds.length === 1)!;
    expect(familyRouteLanes(data.people, data.relationships).find((family) => family.id === lower.id)!.childLaneIndex).toBeGreaterThan(0);
    expect(familyRouteLanes(data.people, data.relationships, railY).find((family) => family.id === lower.id)!.childLaneIndex).toBe(0);
  });

  it("keeps the actual interactive worker's reserved controls out of the new ancestry columns", () => {
    const data = indonesianFamilyFixture(15, "in-laws");
    const prepared = prepareTree({ ...data, requestKey: "interactive-inlaws", generationLimits: { ancestors: null, descendants: null },
      language: "id", relationshipLanguage: "id", controlsVisible: true });
    expect(prepared.geometryLayout.people).toHaveLength(15);
    expect(prepared.connectionPlan.crossings).toHaveLength(0);
    expect(prepared.connectionPlan.isValid).toBe(true);
    expect(routeClarity(prepared.geometryLayout, prepared.connectionPlan)).toMatchObject({ personOverlaps: 0,
      reversedParentDirections: 0, missingParentOrPartnerEdges: 0, missingTerminals: 0, obstacleHits: 0, failures: 0 });
  });

  it("reduces real routed crossings without deleting connections", () => {
    const data = indonesianFamilyFixture(Number(process.env.HERITG_CORRIDOR_SIZE ?? 250),
      process.env.HERITG_CORRIDOR_MIXED ? "mixed" : "in-laws", Number(process.env.HERITG_STRESS_SEED ?? 0));
    // Compare the prior joined-ancestry ordering with the new backbone. Both
    // layouts still apply physical insets, and both must remain valid charts.
    const bypass = vi.spyOn(corridors, "independentInlawGroups").mockReturnValue([]);
    let baseline;
    try { baseline = createTreeLayout(data.people, data.relationships); } finally { bypass.mockRestore(); }
    const revised = createTreeLayout(data.people, data.relationships);
    const measure = (layout: typeof revised) => routeClarity(layout,
      createConnectionPlan({ ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) }, "id", undefined, false));
    const before = measure(baseline), after = measure(revised);
    console.info(JSON.stringify({ corridorComparison: true, seed: data.seed, before, after }));
    expect(after.crossings).toBeLessThan(before.crossings);
    for (const result of [before, after]) expect(result).toMatchObject({ people: data.people.length,
      missingParentOrPartnerEdges: 0, missingTerminals: 0, personOverlaps: 0, reversedParentDirections: 0,
      disconnectedRoutes: 0, diagonalSegments: 0, obstacleHits: 0, unrelatedOverlaps: 0, failures: 0 });
  }, 120000);

  it.each([0, 2, 4])("keeps 500-person in-law subtrees separate with every recorded edge (seed %i)", (seed) => {
    const data = indonesianFamilyFixture(500, "in-laws", seed);
    const before = JSON.stringify(data);
    const prepared = prepareTree({ ...data, requestKey: `inlaw-backbone-${seed}`,
      generationLimits: { ancestors: null, descendants: null }, language: "id", relationshipLanguage: "id", controlsVisible: true });
    expect(prepared.connectionPlan.isValid).toBe(true);
    expect(routeClarity(prepared.geometryLayout, prepared.connectionPlan)).toMatchObject({ people: 500,
      missingParentOrPartnerEdges: 0, missingTerminals: 0, personOverlaps: 0, reversedParentDirections: 0,
      disconnectedRoutes: 0, diagonalSegments: 0, obstacleHits: 0, unrelatedOverlaps: 0, crossings: 0, failures: 0 });
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);
});
