import { describe, expect, it, vi } from "vitest";
import * as corridors from "./careCorridors";
import { createConnectionPlan } from "./connectionPlan";
import { createTreeLayout } from "./layout";
import { prepareTree } from "./treePreparation";
import { parentConnectionGroups } from "./parentConnections";
import { buildChartSvg } from "./chartExport";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import type { FamilyRelationship, PositionedPerson, TreeLayout } from "./types";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const fixture = () => {
  const sample = indonesianFamilyFixture(2);
  const person = (id: string, x: number, y: number): PositionedPerson => ({ ...sample.people[0], id, displayName: id, x, y, generation: y ? 1 : 0, role: " " });
  const parent = (from: string, to: string, subtype: FamilyRelationship["subtype"] = "biologicalParent"): FamilyRelationship => ({
    ...sample.relationships[0], id: `${from}:${to}`, fromPersonId: from, toPersonId: to, kind: "parent", subtype });
  const people = [person("Ayah", -130, 0), person("Ibu", 130, 0), person("Wali", 390, 0),
    person("Anak pertama", -600, 800), person("Anak kedua", 0, 800), person("Anak ketiga", 600, 800)];
  const relationships = [parent("Wali", "Anak kedua", "guardian"),
    ...["Anak pertama", "Anak kedua", "Anak ketiga"].flatMap((id) => [parent("Ayah", id), parent("Ibu", id)])];
  const familyRailY = Object.fromEntries(parentConnectionGroups(relationships).map((group) => [group.id, 400]));
  return { people, relationships, familyRailY, width: 1500, height: 1000 } satisfies TreeLayout;
};

describe("isolated care corridors", () => {
  it.each(["en", "id"] as const)("connects an interior child below the ancestry rail with a labeled care path in %s", (language) => {
    const layout = fixture(), before = structuredClone(layout);
    expect(routeClarity(layout, createConnectionPlan(layout, language, undefined, false))).toMatchObject({ ...integrity, crossings: 1 });
    corridors.insetCareParents(layout.people, layout.relationships, layout.familyRailY);
    const plan = createConnectionPlan(layout, language, undefined, false);
    expect(routeClarity(layout, plan)).toMatchObject({ ...integrity, crossings: 0 });
    const care = plan.families.find((family) => family.care)!;
    expect(care.label?.text).toBe(language === "id" ? "Wali" : "Guardian");
    expect(care.childPorts[0].x).toBeGreaterThan(layout.people.find((person) => person.id === "Anak kedua")!.x);
    expect(layout.relationships).toEqual(before.relationships);
    expect(layout.people.map((person) => [person.id, person.generation])).toEqual(before.people.map((person) => [person.id, person.generation]));
    const svg = new DOMParser().parseFromString(buildChartSvg(layout, "Synthetic care", undefined, language, plan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(6);
    expect(svg.querySelector(`[data-family-id="${care.id}"]`)).not.toBeNull();
    expect(svg.documentElement.textContent).toContain(care.label!.text);
  });

  it("does not move connected carers or use an occupied child corridor", () => {
    for (const kind of ["ancestry", "partner", "second-child", "occupied", "too-short"] as const) {
      const layout = fixture();
      if (kind === "ancestry") layout.relationships.push({ ...layout.relationships[0], id: "extra", fromPersonId: "Ayah", toPersonId: "Wali", subtype: "biologicalParent" });
      if (kind === "partner") layout.relationships.push({ ...layout.relationships[0], id: "extra", fromPersonId: "Ibu", toPersonId: "Wali", kind: "partner", subtype: "spouse" });
      if (kind === "second-child") layout.relationships.push({ ...layout.relationships[0], id: "extra", toPersonId: "Anak ketiga" });
      if (kind === "occupied") {
        layout.people.find((person) => person.id === "Anak pertama")!.x = -200;
        layout.people.find((person) => person.id === "Anak ketiga")!.x = 200;
      }
      if (kind === "too-short") for (const id of Object.keys(layout.familyRailY)) layout.familyRailY[id] = 728;
      const before = structuredClone(layout);
      corridors.insetCareParents(layout.people, layout.relationships, layout.familyRailY);
      expect(layout, kind).toEqual(before);
    }
  });

  it("removes the remaining 500-person mixed guardian crossing without dropping records", () => {
    const data = indonesianFamilyFixture(500, "mixed"), before = JSON.stringify(data);
    const run = () => prepareTree({ ...data, requestKey: "mixed-care", generationLimits: { ancestors: null, descendants: null },
      // Isolate guardian placement; Full's alternative drawing is separately covered.
      language: "id", relationshipLanguage: "id", controlsVisible: true, layoutMode: "focus" });
    const bypass = vi.spyOn(corridors, "insetCareParents").mockImplementation(() => {});
    let baseline;
    try { baseline = run(); } finally { bypass.mockRestore(); }
    const revised = run();
    expect(routeClarity(baseline.geometryLayout, baseline.connectionPlan)).toMatchObject({ ...integrity, crossings: 1, people: 500 });
    expect(routeClarity(revised.geometryLayout, revised.connectionPlan)).toMatchObject({ ...integrity, crossings: 0, people: 500 });
    expect(revised.connectionPlan.isValid).toBe(true);
    const reversed = createTreeLayout([...data.people].reverse(), [...data.relationships].reverse());
    expect(reversed).toEqual(revised.geometryLayout);
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);
});
