import { describe, expect, it, vi } from "vitest";
import * as obstacleRouter from "./obstacleRouter";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parentConnectionGroups, sharedStepParentPaths } from "./parentConnections";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { expandRect, hasForbiddenIntersection, isAvatarCircleTerminal, rectsIntersect, segmentIntersectsRect } from "./connectionGeometry";
import { buildChartSvg } from "./chartExport";
import { SvgTreeScene } from "./SvgTreeScene";
import { prepareTree } from "./treePreparation";
import { focusedFamily } from "./focusedFamily";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import type { FamilyRelationship, RelationshipSubtype } from "./types";

const person = (id: string) => ({ ...indonesianFamilyFixture(2).people[0], id, displayName: id });
const edge = (from: string, to: string, subtype: RelationshipSubtype = "biologicalParent"): FamilyRelationship => ({
  id: `${from}:${to}:${subtype}`, treeId: "synthetic", fromPersonId: from, toPersonId: to,
  kind: subtype === "spouse" || subtype === "formerSpouse" ? "partner" : "parent", subtype, createdAt: "2026-01-01"
});
const base = [edge("father", "mother", "spouse"), edge("father", "child"), edge("mother", "child")];
const current = [...base, edge("father", "stepmother", "spouse"), edge("stepmother", "child", "stepParent")];

describe("explicit, traceable parent paths", () => {
  it("labels a vertical care stem and reports a missing care label as an invalid plan", () => {
    const layout = createTreeLayout(["carer", "child"].map(person), [edge("carer", "child", "guardian")]);
    const plan = createConnectionPlan(layout, "id", undefined, false);
    expect(plan.families[0].label?.text).toBe("Wali");
    expect(routeClarity(layout, plan).unlabeledCareLabels).toBe(0);
    const corrupted = structuredClone(plan);
    corrupted.families[0].label = undefined;
    expect(routeClarity(layout, corrupted).unlabeledCareLabels).toBe(1);
    const placement = vi.spyOn(obstacleRouter, "placeRelationshipLabel").mockReturnValue(undefined);
    try {
      const missing = createConnectionPlan(layout, "id", undefined, false);
      expect(missing.isValid).toBe(false);
      expect(missing.failures).toContain(`care-label:${missing.families[0].id}`);
    } finally { placement.mockRestore(); }
  });
  it("separates a child's birth, adoptive and foster parents instead of inventing a six-parent union", () => {
    const edges = [...base, edge("adoptive-a", "adoptive-b", "spouse"),
      edge("adoptive-a", "child", "adoptiveParent"), edge("adoptive-b", "child", "adoptiveParent"),
      edge("foster-a", "child", "fosterParent"), edge("foster-b", "child", "fosterParent")];
    const before = JSON.stringify(edges);
    const groups = parentConnectionGroups(edges);
    expect(groups.map((group) => group.parentIds)).toEqual([
      ["adoptive-a", "adoptive-b"], ["father", "mother"], ["foster-a", "foster-b"]
    ]);
    expect(groups.flatMap((group) => group.relationships).map((r) => r.id).sort())
      .toEqual(edges.filter((r) => r.kind === "parent").map((r) => r.id).sort());
    expect(parentConnectionGroups([...edges].reverse())).toEqual(groups);
    expect(JSON.stringify(edges)).toBe(before);
  });

  it.each(["en", "id"] as const)("keeps both parent sets traceable and labeled in Full, Focus and exports (%s)", (language) => {
    const edges = [...base, edge("adoptive-a", "adoptive-b", "spouse"),
      edge("adoptive-a", "child", "adoptiveParent"), edge("adoptive-b", "child", "adoptiveParent"),
      edge("foster-a", "foster-b", "spouse"),
      edge("foster-a", "child", "fosterParent"), edge("foster-b", "child", "fosterParent")];
    const people = ["father", "mother", "adoptive-a", "adoptive-b", "foster-a", "foster-b", "child"].map(person);
    const before = JSON.stringify({ people, edges });
    for (const data of [{ people, relationships: edges }, focusedFamily(people, edges, { personId: "child", ancestors: 1, descendants: 1 })]) {
      const prepared = prepareTree({ ...data, requestKey: "multiple-parent-sets", generationLimits: { ancestors: null, descendants: null },
        language, relationshipLanguage: language, controlsVisible: true });
      const layout = prepared.geometryLayout, plan = prepared.connectionPlan;
      if (process.env.HERITG_PARENT_DETAILS) console.info(JSON.stringify({ layout, plan }));
      expect(plan.families).toHaveLength(3);
      expect(routeClarity(layout, plan)).toMatchObject({ people: 7, missingParentOrPartnerEdges: 0,
        missingTerminals: 0, disconnectedRoutes: 0, obstacleHits: 0, unrelatedOverlaps: 0,
        conflatedParentSets: 0, unlabeledParentTypes: 0, crossings: 0, failures: 0 });
      const labels = plan.families.flatMap((family) => family.childLabels ?? []);
      expect(labels.map((annotation) => annotation.label.text).sort()).toEqual((language === "en"
        ? ["Biological parents", "Adoptive parents", "Foster parents"] : ["Orang tua kandung", "Orang tua angkat", "Orang tua asuh"]).sort());
      expect(new Set(plan.families.map((family) => JSON.stringify(family.childPorts[0]))).size).toBe(3);
      const exported = new DOMParser().parseFromString(buildChartSvg(layout, "Synthetic parent sets", undefined, language, plan).svg, "image/svg+xml");
      const live = renderToStaticMarkup(createElement(SvgTreeScene, { layout, connectionPlan: plan, language }));
      for (const annotation of labels) {
        expect(exported.querySelector(`[data-relationship-label="${annotation.id}"]`)?.textContent).toBe(annotation.label.text);
        expect(live).toContain(`>${annotation.label.text}</text>`);
        expect(plan.obstacles.filter((obstacle) => obstacle.ownerId !== annotation.id)
          .some((obstacle) => rectsIntersect(expandRect(obstacle.rect, 8), annotation.label.rect))).toBe(false);
        expect([...plan.families, ...plan.nonParentRoutes].flatMap((route) => route.segments)
          .some((segment) => segmentIntersectsRect(segment, annotation.label.rect, 2))).toBe(false);
      }
      const unlabeled = { ...plan, families: plan.families.map((family) => ({ ...family, childLabels: undefined })) };
      expect(routeClarity(layout, unlabeled).unlabeledParentTypes).toBe(3);
      const conflated = { ...plan, families: [{ ...plan.families[0], parentIds: people.filter((p) => p.id !== "child").map((p) => p.id),
        relationshipIds: edges.filter((edge) => edge.kind === "parent").map((edge) => edge.id) }] };
      expect(routeClarity(layout, conflated).conflatedParentSets).toBe(3);
    }
    expect(JSON.stringify({ people, edges })).toBe(before);
  });

  it("labels only the adopted child's branch when a couple also has a biological child", () => {
    const edges = [...base, edge("father", "adopted", "adoptiveParent"), edge("mother", "adopted", "adoptiveParent")];
    const data = ["father", "mother", "child", "adopted"].map(person);
    const layout = createTreeLayout(data, edges), plan = createConnectionPlan(layout, "id", undefined, false);
    if (process.env.HERITG_PARENT_DETAILS) console.info(JSON.stringify({ layout, plan }));
    expect(plan.families).toHaveLength(1);
    expect(plan.families[0].label).toBeUndefined();
    expect(plan.families[0].childLabels?.map(({ childId, label }) => ({ childId, text: label.text })))
      .toEqual([{ childId: "adopted", text: "Orang tua angkat" }]);
    expect(routeClarity(layout, plan).failures).toBe(0);
  });

  it("keeps guardians separate from co-parent ancestry instead of inventing a joint parent set", () => {
    const edges = [...base, edge("guardian", "child", "guardian")];
    const groups = parentConnectionGroups(edges);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => !group.care)?.parentIds).toEqual(["father", "mother"]);
    expect(groups.find((group) => group.care)?.parentIds).toEqual(["guardian"]);
    expect(groups.flatMap((group) => group.relationships).map((r) => r.id).sort())
      .toEqual(edges.filter((r) => r.kind === "parent").map((r) => r.id).sort());
  });

  it("reuses only a fully recorded partner-and-parent path for an explicit step-parent", () => {
    const before = JSON.stringify(current);
    expect(sharedStepParentPaths(current)).toEqual([{
      relationship: current.at(-1), viaPersonId: "father",
      partnerRelationshipId: "father:stepmother:spouse", parentRelationshipId: "father:child:biologicalParent"
    }]);
    expect(sharedStepParentPaths(current.filter((r) => r.subtype !== "stepParent"))).toEqual([]);
    expect(sharedStepParentPaths(current.filter((r) => r.id !== "father:stepmother:spouse"))).toEqual([]);
    expect(JSON.stringify(current)).toBe(before);
  });

  it("keeps standalone step-parent records visible, even when a spouse or parent is unrecorded", () => {
    const edges = [edge("carer", "child", "stepParent"), edge("carer", "second", "stepParent")];
    const groups = parentConnectionGroups(edges);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentIds).toEqual(["carer"]);
    expect(groups[0].childIds).toEqual(["child", "second"]);
    expect(groups[0].care?.subtype).toBe("stepParent");
    expect(sharedStepParentPaths(edges)).toHaveLength(0);
  });

  it("preserves adoptive and foster parent records without relabeling them biological", () => {
    const edges = [edge("parent-a", "child-a", "adoptiveParent"), edge("parent-b", "child-a", "adoptiveParent"),
      edge("parent-a", "child-b", "fosterParent"), edge("parent-b", "child-b", "fosterParent")];
    const groups = parentConnectionGroups(edges);
    expect(groups).toHaveLength(1);
    expect(groups[0].relationships.map((r) => r.subtype)).toEqual(["adoptiveParent", "fosterParent", "adoptiveParent", "fosterParent"]);
    expect(groups[0].care).toBeUndefined();
  });

  it("is deterministic when care records and partnerships arrive in a different order", () => {
    const edges = [...current, edge("guardian", "child", "guardian"), edge("guardian", "second", "guardian")];
    expect(parentConnectionGroups([...edges].reverse())).toEqual(parentConnectionGroups(edges));
    expect(sharedStepParentPaths([...edges].reverse())).toEqual(sharedStepParentPaths(edges));
  });

  it("does not let a claimed shared path hide an unrelated or missing parent edge", () => {
    const layout = createTreeLayout(["father", "mother", "stepmother", "child"].map(person), current);
    const plan = createConnectionPlan(layout, "en", undefined, false);
    expect(routeClarity(layout, plan).missingParentOrPartnerEdges).toBe(0);
    const corrupted = { ...plan, sharedParentPaths: plan.sharedParentPaths.map((p) => ({ ...p, viaPersonId: "mother" })) };
    expect(routeClarity(layout, corrupted).missingParentOrPartnerEdges).toBe(1);
    expect(plan.families.every((family) => !family.parentIds.includes("stepmother"))).toBe(true);
    expect(plan.nonParentRoutes.some((route) => route.id === "father:stepmother:spouse")).toBe(true);
  });

  it("draws care branches with distinct circle sockets, dashed lines and a matching exported label", () => {
    const edges = [...base, edge("guardian", "child", "guardian"), edge("guardian", "second", "guardian")];
    const layout = createTreeLayout(["father", "mother", "guardian", "child", "second"].map(person), edges);
    const plan = createConnectionPlan(layout, "id", undefined, false);
    const care = plan.families.find((family) => family.care)!;
    const clarity = routeClarity(layout, plan);
    expect(clarity.missingTerminals).toBe(0);
    expect(clarity.unrelatedOverlaps).toBe(0);
    expect(clarity.failures).toBe(0);
    for (const [index, port] of care.childPorts.entries()) {
      const avatar = plan.obstacles.find((o) => o.kind === "avatar" && o.ownerId === care.childIds[index])!;
      expect(isAvatarCircleTerminal(port, avatar)).toBe(true);
    }
    expect(care.label?.text).toBe("Wali");
    const svg = buildChartSvg(layout, "Synthetic care family", undefined, "id", plan).svg;
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.querySelector(`path[data-family-id="${care.id}"]`)?.getAttribute("stroke-dasharray")).toBe("6 7");
    expect(document.querySelector(`[data-relationship-label="${care.id}"]`)?.textContent).toBe("Wali");
    const live = renderToStaticMarkup(createElement(SvgTreeScene, { layout, connectionPlan: plan, language: "id" }));
    expect(live).toContain('class="svg-connector family care"');
    expect(live).toContain('>Wali</text>');
  });

  it("permits only outward exits from curved avatar sockets", () => {
    const obstacle = { kind: "avatar" as const, ownerId: "child", rect: { x: -32, y: -32, width: 64, height: 64 } };
    const point = { x: 12, y: -Math.sqrt(32 ** 2 - 12 ** 2) };
    expect(hasForbiddenIntersection({ start: point, end: { x: 12, y: -90 } }, obstacle, new Set(["child"]))).toBe(false);
    expect(hasForbiddenIntersection({ start: point, end: { x: 12, y: 90 } }, obstacle, new Set(["child"]))).toBe(true);
    expect(hasForbiddenIntersection({ start: point, end: { x: 12, y: -90 } }, obstacle, new Set())).toBe(true);
  });

  it("keeps different unions' children together even when their names interleave", () => {
    const people = ["father", "wife-a", "wife-b", "A", "B", "C", "D"].map((id) => ({ ...person(id), birthDate: undefined }));
    const edges = [edge("father", "wife-a", "spouse"), edge("father", "wife-b", "spouse"),
      ...["A", "C"].flatMap((id) => [edge("father", id), edge("wife-a", id)]),
      ...["B", "D"].flatMap((id) => [edge("father", id), edge("wife-b", id)])];
    const layout = createTreeLayout(people, edges);
    const children = layout.people.filter((p) => ["A", "B", "C", "D"].includes(p.id)).sort((a, b) => a.x - b.x).map((p) => p.id);
    expect(Math.abs(children.indexOf("A") - children.indexOf("C"))).toBe(1);
    expect(Math.abs(children.indexOf("B") - children.indexOf("D"))).toBe(1);
  });

  it("lays out a remarriage chain with every recorded couple adjacent", () => {
    const people = ["A", "B", "C", "D"].map(person);
    const edges = [edge("B", "A", "formerSpouse"), edge("A", "C", "spouse"), edge("C", "D", "formerSpouse")];
    const layout = createTreeLayout(people, edges);
    const order = layout.people.sort((a, b) => a.x - b.x).map((p) => p.id);
    for (const relationship of edges) expect(Math.abs(order.indexOf(relationship.fromPersonId) - order.indexOf(relationship.toPersonId))).toBe(1);
    expect(createConnectionPlan(layout, "en", undefined, false).crossings).toHaveLength(0);
  });
});
