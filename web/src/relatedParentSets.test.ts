import { describe, expect, it } from "vitest";
import { relatedParentSetsFixture } from "./testFixtures/relatedParentSets";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { prepareTree } from "./treePreparation";
import { focusedFamily } from "./focusedFamily";
import { parentConnectionGroups } from "./parentConnections";
import { pointOnSegment } from "./connectionGeometry";
import { completeTreeRouting } from "./fullTreeRouting";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";
import type { FamilyRelationship, Person } from "./types";

const scenarios = ["shared-adoption", "shared-parent-sets"] as const;
const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, failures: 0 };
const prepare = (data: { people: Person[]; relationships: FamilyRelationship[] }, language: "en" | "id" = "id", layoutMode: "full" | "focus" = "full") =>
  prepareTree({ ...data, requestKey: "related-parent-sets", layoutMode, language, relationshipLanguage: language,
    generationLimits: { ancestors: null, descendants: null }, controlsVisible: false });

/** Residual three-set crossings must be inside one shared-child cohort,
 * never in the ancestry connecting two related parent households. */
function expectLocalCrossings(result: ReturnType<typeof prepare>, max: number) {
  expect(result.connectionPlan.crossings.length).toBeLessThanOrEqual(max);
  const cohorts = new Set<string>();
  for (const crossing of result.connectionPlan.crossings) {
    const owners = result.connectionPlan.families.filter((family) => family.segments.some((segment) => pointOnSegment(crossing, segment)));
    expect(owners).toHaveLength(2);
    expect(owners.every((family) => !family.care)).toBe(true);
    expect(owners[0].childIds).toEqual(owners[1].childIds);
    const cohort = JSON.stringify(owners[0].childIds);
    expect(cohorts.has(cohort)).toBe(false);
    cohorts.add(cohort);
  }
}

describe("related birth and adoptive parent households", () => {
  it("adds plausible shared ancestry without changing any existing household or care history", () => {
    for (const scenario of scenarios) for (const size of [100, 250, 500]) for (const seed of [0, 2, 4]) {
      const base = indonesianFamilyFixture(size - 2, scenario, seed), data = relatedParentSetsFixture(size, scenario, seed);
      expect(data.people.slice(0, -2)).toEqual(base.people);
      expect(data.relationships.slice(0, -5)).toEqual(base.relationships);
      expect(data.people).toHaveLength(size);
      expect(new Set(data.people.map((person) => person.id)).size).toBe(size);
      expect(new Set(data.relationships.map((edge) => edge.id)).size).toBe(data.relationships.length);
      const byId = new Map(data.people.map((person) => [person.id, person]));
      const parents = (id: string) => data.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === id);
      for (const id of data.relatedParentIds) expect(parents(id).map((edge) => edge.fromPersonId).sort()).toEqual([...data.grandparentIds].sort());
      const neighbors = new Map<string, string[]>();
      for (const edge of data.relationships) {
        expect(edge.fromPersonId).not.toBe(edge.toPersonId);
        const from = byId.get(edge.fromPersonId)!, to = byId.get(edge.toPersonId)!;
        expect(from).toBeDefined(); expect(to).toBeDefined();
        for (const [a, b] of [[from.id, to.id], [to.id, from.id]]) neighbors.set(a, [...neighbors.get(a) ?? [], b]);
        if (edge.kind === "parent") {
          // Strictly older parent records also rule out directed ancestry cycles.
          expect(Number(to.birthDate!.slice(0, 4)) - Number(from.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(18);
          if (from.deathDate) expect(to.birthDate! < from.deathDate).toBe(true);
        }
        if (edge.kind === "partner") for (const spouse of [from, to]) {
          expect(Number(edge.marriageDate!.slice(0, 4)) - Number(spouse.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(18);
          if (spouse.deathDate) expect((edge.divorceDate ?? edge.marriageDate!) < spouse.deathDate).toBe(true);
        }
      }
      const reached = new Set<string>(), queue = [data.rootId];
      for (let i = 0; i < queue.length; i++) if (!reached.has(queue[i])) {
        reached.add(queue[i]); queue.push(...neighbors.get(queue[i]) ?? []);
      }
      expect(reached.size).toBe(size);
      for (const person of data.people) {
        expect(parents(person.id).filter((edge) => edge.subtype === "biologicalParent").length).toBeLessThanOrEqual(2);
        expect(person.birthDate! <= "2026-01-01").toBe(true);
        if (person.deathDate) {
          expect(person.deathDate > person.birthDate!).toBe(true);
          expect(person.deathDate <= "2026-01-01").toBe(true);
        }
      }
    }
  });

  it.each(scenarios.flatMap((scenario) => [100, 250, 500].flatMap((size) => [0, 2, 4].map((seed) => ({ scenario, size, seed })))))(
    "keeps $size people and clear related-household ancestry in $scenario, seed $seed", ({ scenario, size, seed }) => {
      const data = relatedParentSetsFixture(size, scenario, seed), before = JSON.stringify(data);
      const result = prepare(data), metrics = routeClarity(result.geometryLayout, result.connectionPlan);
      expect(metrics).toMatchObject({ ...integrity, people: size, relationships: data.relationships.length });
      // The worker routes with one reserved relationship-role line, then
      // restores the display roles. Validate ports against that same layout.
      const routingLayout = { ...result.geometryLayout, people: result.geometryLayout.people.map((person) => ({ ...person, role: " " })) };
      expect(completeTreeRouting(routingLayout, result.connectionPlan)).toBe(true);
      expect(new Set(result.geometryLayout.people.map((person) => person.id))).toEqual(new Set(data.people.map((person) => person.id)));
      expect(result.geometryLayout.relationships.map((edge) => edge.id).sort()).toEqual(data.relationships.map((edge) => edge.id).sort());
      for (const group of parentConnectionGroups(data.relationships)) {
        const family = result.connectionPlan.families.find((candidate) => candidate.id === group.id)!;
        expect(family).toBeDefined();
        expect(family.parentIds).toEqual(group.parentIds);
        expect(family.childIds).toEqual(group.childIds);
        expect([...family.relationshipIds].sort()).toEqual(group.relationships.map((edge) => edge.id).sort());
      }
      expectLocalCrossings(result, scenario === "shared-adoption" ? 0 : Math.floor((size - 2) / 9));
      expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(integrity);
      expect(JSON.stringify(data)).toBe(before);
    }, 30000);

  it.each(scenarios.flatMap((scenario) => ["en", "id"].map((language) => ({ scenario, language: language as "en" | "id" })) ))(
    "preserves renamed 500-person $scenario records and exports in $language", ({ scenario, language }) => {
      const original = relatedParentSetsFixture(500, scenario, 2);
      const ids = new Map(original.people.map((person, index) => [person.id, `person-${String((index * 37) % 503).padStart(3, "0")}`]));
      const data = { people: [...original.people].reverse().map((person) => ({ ...person, id: ids.get(person.id)! })),
        relationships: [...original.relationships].reverse().map((edge, index) => ({ ...edge, id: `record-${index}`,
          fromPersonId: ids.get(edge.fromPersonId)!, toPersonId: ids.get(edge.toPersonId)! })) };
      const result = prepare(data, language);
      expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
      expectLocalCrossings(result, scenario === "shared-adoption" ? 0 : 55);
      const reversed = prepare({ people: [...data.people].reverse(), relationships: [...data.relationships].reverse() }, language);
      expect(reversed.geometryLayout).toEqual(result.geometryLayout);
      const svg = new DOMParser().parseFromString(buildChartSvg(result.geometryLayout, "Synthetic related households", undefined, language, result.connectionPlan).svg, "image/svg+xml");
      expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(500);
      for (const person of data.people) expect(svg.documentElement.textContent).toContain(person.displayName);
      for (const family of result.connectionPlan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
      for (const route of result.connectionPlan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
      expect(svg.documentElement.textContent).toContain(language === "id" ? "Orang tua angkat" : "Adoptive parents");
      if (scenario === "shared-parent-sets") for (const label of language === "id" ? ["Orang tua asuh", "Wali"] : ["Foster parents", "Guardian"])
        expect(svg.documentElement.textContent).toContain(label);
    }, 30000);

  it.each(scenarios)("retains either related parent's and the child's Focus families in %s", (scenario) => {
    const data = relatedParentSetsFixture(500, scenario);
    const childId = data.relationships.find((edge) => edge.fromPersonId === data.relatedParentIds[0] && edge.kind === "parent")!.toPersonId;
    for (const personId of [...data.relatedParentIds, childId]) {
      const focus = focusedFamily(data.people, data.relationships, { personId, ancestors: 2, descendants: 1, siblings: true });
      const result = prepare(focus, "id", "focus");
      expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
      expect(result.geometryLayout.people.length).toBeLessThan(40);
      expect(new Set(result.geometryLayout.people.map((person) => person.id))).toEqual(new Set(focus.people.map((person) => person.id)));
      expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
      expect(result.geometryLayout.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === personId).map((edge) => edge.id).sort())
        .toEqual(data.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === personId).map((edge) => edge.id).sort());
    }
  });

  it("keeps a guardian attached to the second related household when the first draws their joined descendants", () => {
    const base = relatedParentSetsFixture(15, "shared-adoption");
    const guardian = { ...base.people.at(-1)!, id: "separate-guardian", displayName: "Synthetic guardian" };
    const record: FamilyRelationship = { id: "second-entry-guardian", treeId: guardian.treeId,
      fromPersonId: guardian.id, toPersonId: base.relatedParentIds[1], kind: "parent", subtype: "guardian", createdAt: guardian.createdAt };
    const data = { people: [...base.people, guardian], relationships: [...base.relationships, record] };
    const result = prepare(data), family = result.connectionPlan.families.find((candidate) => candidate.relationshipIds.includes(record.id));
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject({ ...integrity, people: 16 });
    expect(family?.parentIds).toEqual([guardian.id]);
    expect(family?.childIds).toEqual([base.relatedParentIds[1]]);
    expect(family?.label?.text).toBe("Wali");
    expect(result.geometryLayout.familyRouteGeometry?.[family!.id]).toBeDefined();
    expect(result.geometryLayout.people.filter((person) => person.id === guardian.id)).toHaveLength(1);
  });
});
