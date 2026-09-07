import { describe, expect, it } from "vitest";
import type { ConnectionPlan } from "./connectionPlan";
import type { FamilyRelationship } from "./types";
import { measuredCrossings, threeParentSetWitnesses } from "./testFixtures/crossingAudit";

const record = (from: string, to: string, subtype: FamilyRelationship["subtype"] = "biologicalParent"): FamilyRelationship => ({
  id: `${from}:${to}:${subtype}`, treeId: "test", fromPersonId: from, toPersonId: to, subtype,
  kind: "parent", createdAt: "2026-01-01"
});
const emptyPlan = (): ConnectionPlan => ({ families: [], nonParentRoutes: [], sharedParentPaths: [], obstacles: [], controls: [],
  crossings: [], bounds: { x: 0, y: 0, width: 100, height: 100 }, failures: [], isValid: true });

describe("independent crossing audit", () => {
  it("finds unreported crossings and all route owners, even when a plan claims validity", () => {
    const plan = emptyPlan();
    plan.nonParentRoutes = [
      { id: "a", relationship: record("a", "b"), segments: [{ start: { x: 0, y: 50 }, end: { x: 100, y: 50 } }] },
      { id: "b", relationship: record("c", "d"), segments: [{ start: { x: 50, y: 0 }, end: { x: 50, y: 100 } }] },
      { id: "c", relationship: record("e", "f"), segments: [{ start: { x: 50, y: 50 }, end: { x: 80, y: 50 } }] }
    ];
    expect(measuredCrossings(plan)).toEqual([{ x: 50, y: 50, owners: ["edge:a", "edge:b", "edge:c"] }]);
    expect(plan.crossings).toEqual([]);
  });
  it("distinguishes a shared recorded terminal from unrelated touching endpoints", () => {
    const plan = emptyPlan();
    plan.nonParentRoutes = [
      { id: "a", relationship: record("a", "shared"), segments: [{ start: { x: 0, y: 50 }, end: { x: 50, y: 50 } }] },
      { id: "b", relationship: record("shared", "b"), segments: [{ start: { x: 50, y: 50 }, end: { x: 50, y: 100 } }] }
    ];
    expect(measuredCrossings(plan)).toEqual([]);
    plan.nonParentRoutes[1].relationship.fromPersonId = "different";
    expect(measuredCrossings(plan)).toHaveLength(1);
  });
  it("deduplicates crossings at a split segment without trusting segment order", () => {
    const plan = emptyPlan();
    plan.nonParentRoutes = [
      { id: "a", relationship: record("a", "b"), segments: [
        { start: { x: 50, y: 50 }, end: { x: 0, y: 50 } }, { start: { x: 100, y: 50 }, end: { x: 50, y: 50 } }] },
      { id: "b", relationship: record("c", "d"), segments: [{ start: { x: 50, y: 100 }, end: { x: 50, y: 0 } }] }
    ];
    expect(measuredCrossings(plan)).toEqual([{ x: 50, y: 50, owners: ["edge:a", "edge:b"] }]);
  });
});

describe("record-derived three-parent-set crossing witnesses", () => {
  const children = ["child-1", "child-2", "child-3"];
  const parents = [["birth-a", "birth-b"], ["adopt-a", "adopt-b"], ["foster-a", "foster-b"]];
  const types = ["biologicalParent", "adoptiveParent", "fosterParent"] as const;
  const records = children.flatMap((child) => parents.flatMap((set, i) => set.map((parent) => record(parent, child, types[i]))));
  it("recognizes the complete disjoint three-by-three family incidence graph", () => {
    expect(threeParentSetWitnesses(records)).toEqual([{ childIds: children, parentSets: parents.map((set) => [...set].sort()) }]);
    expect(threeParentSetWitnesses([...records].reverse())).toHaveLength(1);
    expect(threeParentSetWitnesses([...records, ...records])).toHaveLength(1);
  });
  it("does not claim a lower bound for incomplete, shared-parent, or care-only patterns", () => {
    expect(threeParentSetWitnesses(records.slice(1))).toEqual([]);
    expect(threeParentSetWitnesses(records.filter((edge) => edge.toPersonId !== "child-3"))).toEqual([]);
    expect(threeParentSetWitnesses(records.map((edge) => edge.fromPersonId === "foster-a" ? { ...edge, fromPersonId: "birth-a" } : edge))).toEqual([]);
    expect(threeParentSetWitnesses(records.map((edge) => edge.subtype === "fosterParent" ? { ...edge, subtype: "guardian" } : edge))).toEqual([]);
  });
});
