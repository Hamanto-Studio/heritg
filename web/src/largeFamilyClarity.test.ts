import { describe, expect, it } from "vitest";
import { indonesianFamilyFixture, indonesianScenarios, reconnectedScenarios } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { focusedFamily } from "./focusedFamily";

describe("synthetic Indonesian family coverage", () => {
  it.each([...indonesianScenarios, ...reconnectedScenarios].flatMap((scenario) => [0, 2, 4].map((seed) => ({ scenario, seed }))))("creates 500 valid, connected people for $scenario, seed $seed", ({ scenario, seed }) => {
    const fixture = indonesianFamilyFixture(500, scenario, seed);
    const byId = new Map(fixture.people.map((person) => [person.id, person]));
    expect(byId.size).toBe(500);
    const reached = new Set([fixture.rootId]);
    for (let pass = 0; pass < 500; pass++) for (const edge of fixture.relationships) {
      if (reached.has(edge.fromPersonId)) reached.add(edge.toPersonId);
      if (reached.has(edge.toPersonId)) reached.add(edge.fromPersonId);
    }
    expect(reached.size).toBe(500);
    for (const person of fixture.people) {
      expect(fixture.relationships.filter((edge) => edge.toPersonId === person.id && edge.subtype === "biologicalParent").length).toBeLessThanOrEqual(2);
      expect(Number(person.birthDate!.slice(0, 4))).toBeLessThanOrEqual(2026);
      if (person.deathDate) {
        expect(person.deathDate > person.birthDate!).toBe(true);
        expect(person.deathDate <= "2026-01-01").toBe(true);
      } else expect(2026 - Number(person.birthDate!.slice(0, 4))).toBeLessThanOrEqual(80);
    }
    for (const edge of fixture.relationships) {
      expect(edge.fromPersonId).not.toBe(edge.toPersonId);
      const from = byId.get(edge.fromPersonId)!, to = byId.get(edge.toPersonId)!;
      expect(from).toBeDefined(); expect(to).toBeDefined();
      if (edge.kind === "parent") expect(Number(to.birthDate!.slice(0, 4)) - Number(from.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(18);
      if (edge.kind === "parent" && from.deathDate) expect(to.birthDate! < from.deathDate).toBe(true);
      if (edge.kind === "partner") for (const spouse of [from, to]) {
        expect(Number(edge.marriageDate!.slice(0, 4)) - Number(spouse.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(18);
        if (spouse.deathDate) expect((edge.divorceDate ?? edge.marriageDate!) < spouse.deathDate).toBe(true);
      }
    }
  });

  it.each(indonesianScenarios)("measures full-tree clarity for %s", (scenario) => {
    const data = indonesianFamilyFixture(Number(process.env.HERITG_STRESS_SIZE ?? 100), scenario, Number(process.env.HERITG_STRESS_SEED ?? 0));
    const started = performance.now();
    const layout = createTreeLayout(data.people, data.relationships);
    const laidOut = performance.now();
    // The interactive worker reserves the role line even before selection.
    // Exercise that exact geometry, not a shorter export-only label box.
    const plan = createConnectionPlan({ ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) }, "id", undefined, false);
    const result = routeClarity(layout, plan);
    console.info(JSON.stringify({ scenario, ...result, layoutMs: Math.round(laidOut - started), routeMs: Math.round(performance.now() - laidOut) }));
    if (process.env.HERITG_STRESS_DETAILS === "failures") console.info(JSON.stringify({ failures: plan.failures,
      families: plan.families.filter((family) => plan.failures.includes(`family:${family.id}`)),
      familyRailY: layout.familyRailY,
      people: layout.people.map(({ id, x, y, generation }) => ({ id, x, y, generation })) }));
    else if (process.env.HERITG_STRESS_DETAILS) console.info(JSON.stringify({ failures: plan.failures,
      crossings: plan.crossings,
      families: plan.families,
      nonParentRoutes: plan.nonParentRoutes,
      sharedParentPaths: plan.sharedParentPaths,
      people: layout.people.map(({ id, x, y }) => ({ id, x, y })) }));
    expect(result.people).toBe(data.people.length);
    expect(result.missingParentOrPartnerEdges).toBe(0);
    expect(result.missingTerminals).toBe(0);
    expect(result.disconnectedRoutes).toBe(0);
    expect(result.diagonalSegments).toBe(0);
    expect(result.unrelatedOverlaps).toBe(0);
    expect(result.obstacleHits).toBe(0);
    expect(result.personOverlaps).toBe(0);
    expect(result.reversedParentDirections).toBe(0);
    expect(result.conflatedParentSets).toBe(0);
    expect(result.unlabeledParentTypes).toBe(0);
    expect(result.failures).toBe(0);
    expect(plan.isValid).toBe(true);
    expect(layout.relationships.filter((edge) => edge.kind !== "sibling").length)
      .toBe(data.relationships.filter((edge) => edge.kind !== "sibling").length);
    if (["extended", "multiple-wives", "adoption", "in-laws", "remarried", "mixed", "parent-sets"].includes(scenario)) {
      expect(result.crossings).toBe(0);
    }
  }, 120000);

  it.each(indonesianScenarios)("preserves every parent and partner when permuting 500-person %s input", (scenario) => {
    const data = indonesianFamilyFixture(500, scenario, 2);
    const first = createTreeLayout(data.people, data.relationships);
    const reversed = createTreeLayout([...data.people].reverse(), [...data.relationships].reverse());
    expect(reversed).toEqual(first);
    expect(first.people).toHaveLength(500);
    expect(first.relationships.filter((edge) => edge.kind !== "sibling").map((edge) => edge.id).sort())
      .toEqual(data.relationships.filter((edge) => edge.kind !== "sibling").map((edge) => edge.id).sort());
  });

  it.each([...indonesianScenarios, ...reconnectedScenarios])("keeps the focused family connected inside a 500-person %s archive", (scenario) => {
    const data = indonesianFamilyFixture(500, scenario);
    const before = JSON.stringify(data);
    const childIds = new Set(data.relationships.filter((edge) => edge.kind === "parent").map((edge) => edge.toPersonId));
    const parentIds = new Set(data.relationships.filter((edge) => edge.kind === "parent").map((edge) => edge.fromPersonId));
    const anchor = data.people.find((person) => childIds.has(person.id) && parentIds.has(person.id))!;
    const focus = focusedFamily(data.people, data.relationships, { personId: anchor.id, ancestors: 2, descendants: 1 });
    const layout = createTreeLayout(focus.people, focus.relationships);
    const plan = createConnectionPlan({ ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) }, "id", undefined, false);
    const result = routeClarity(layout, plan);
    expect(result.people).toBe(focus.people.length);
    expect(result.people).toBeLessThan(500);
    expect(result.personOverlaps).toBe(0);
    expect(result.reversedParentDirections).toBe(0);
    expect(result.conflatedParentSets).toBe(0);
    expect(result.unlabeledParentTypes).toBe(0);
    expect(result.missingParentOrPartnerEdges).toBe(0);
    expect(result.missingTerminals).toBe(0);
    expect(result.disconnectedRoutes).toBe(0);
    expect(result.obstacleHits).toBe(0);
    expect(result.unrelatedOverlaps).toBe(0);
    expect(result.failures).toBe(0);
    expect(JSON.stringify(data)).toBe(before);
    console.info(JSON.stringify({ scenario, mode: "focus", ...result }));
  }, 120000);
});
