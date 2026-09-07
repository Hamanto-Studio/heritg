import { describe, expect, it } from "vitest";
import { connectionTrace } from "./connectionTrace";
import { prepareTree } from "./treePreparation";
import { indonesianFamilyFixture, indonesianScenarios, reconnectedScenarios } from "./testFixtures/indonesianFamilies";
import { crossGenerationFamilyFixture } from "./testFixtures/crossGenerationFamilies";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { pointOnSegment, segmentLength, segmentsForPoints } from "./connectionGeometry";
import type { FamilyRelationship, Person } from "./types";

const person = (id: string): Person => ({ id, treeId: "t", displayName: id, gender: "unspecified", createdAt: "2026",
  notes: "", birthDatePrecision: "year", addressLine: "", city: "", province: "", country: "", postalCode: "" });
const edge = (from: string, to: string, subtype: FamilyRelationship["subtype"] = "biologicalParent"): FamilyRelationship => ({
  id: `${from}-${to}-${subtype}`, treeId: "t", fromPersonId: from, toPersonId: to,
  kind: subtype === "spouse" ? "partner" : "parent", subtype, createdAt: "2026"
});
const prepare = (people: Person[], relationships: FamilyRelationship[]) => prepareTree({
  people, relationships, language: "en", relationshipLanguage: "id", requestKey: "trace", layoutMode: "full",
  generationLimits: { ancestors: null, descendants: null }, controlsVisible: false
});

describe("selected connection tracing", () => {
  it("traces just the selected child's recorded parents, not the other sibling stems", () => {
    const relationships = [edge("a", "c"), edge("b", "c"), edge("a", "d"), edge("b", "d")];
    const prepared = prepare(["a", "b", "c", "d"].map(person), relationships);
    const plan = prepared.connectionPlan;
    const before = JSON.stringify(prepared);
    const trace = connectionTrace(plan, relationships, "c");
    expect([...trace.represented].sort()).toEqual(relationships.filter((r) => r.toPersonId === "c").map((r) => r.id).sort());
    const family = plan.families[0], siblingPort = family.childPorts[family.childIds.indexOf("d")];
    expect(trace.families.get(family.id)!.segments.some((segment) => pointOnSegment(siblingPort, segment))).toBe(false);
    expect(trace.families.get(family.id)!.paths.some((path) => !path.traced)).toBe(true);
    expect(JSON.stringify(prepared)).toBe(before);
    expect(connectionTrace(plan, relationships).represented.size).toBe(0);
  });

  it("traces a recorded step-parent via the existing partner and parent, without inventing stepsiblings", () => {
    const relationships = [edge("a", "c"), edge("a", "s", "spouse"), edge("s", "c", "stepParent"), edge("s", "d")];
    const prepared = prepare(["a", "s", "c", "d"].map(person), relationships);
    const trace = connectionTrace(prepared.connectionPlan, relationships, "c");
    expect([...trace.represented].sort()).toEqual(relationships.filter((r) => r.toPersonId !== "d").map((r) => r.id).sort());
    expect(trace.people.has("d")).toBe(false);
    expect(trace.nonParents.has("a-s-spouse")).toBe(true);
  });

  it.each([...indonesianScenarios, ...reconnectedScenarios])("keeps all 500 %s people and traces every selected person's recorded edges", (scenario) => {
    const data = indonesianFamilyFixture(500, scenario, 0);
    const prepared = prepare(data.people, data.relationships);
    expect(prepared.geometryLayout.people).toHaveLength(500);
    const before = JSON.stringify(prepared);
    for (const person of data.people) {
      const projected = visibleConnectionPlan(prepared.connectionPlan, prepared.geometryLayout, "en", person.id);
      const trace = connectionTrace(projected, data.relationships, person.id);
      const expected = data.relationships.filter((r) => r.fromPersonId === person.id || r.toPersonId === person.id);
      expect(expected.filter((r) => !trace.represented.has(r.id)), person.id).toEqual([]);
      for (const family of trace.families.values()) {
        const drawn = family.paths.filter((path) => path.traced).flatMap((path) => segmentsForPoints(path.points));
        expect(drawn.reduce((sum, segment) => sum + segmentLength(segment), 0), `visible trace for ${person.id}`)
          .toBeCloseTo(family.segments.reduce((sum, segment) => sum + segmentLength(segment), 0), 3);
      }
    }
    expect(JSON.stringify(prepared)).toBe(before);
  }, 30_000);

  it("keeps differently deep ancestry marriages traceable with all 500 people retained", () => {
    const data = crossGenerationFamilyFixture(500, 0);
    const prepared = prepare(data.people, data.relationships);
    for (const id of data.marriagePair!) {
      const trace = connectionTrace(prepared.connectionPlan, data.relationships, id);
      const expected = data.relationships.filter((r) => r.fromPersonId === id || r.toPersonId === id);
      expect(expected.filter((r) => !trace.represented.has(r.id)), id).toEqual([]);
    }
    expect(prepared.geometryLayout.people).toHaveLength(500);
  }, 30_000);
});
