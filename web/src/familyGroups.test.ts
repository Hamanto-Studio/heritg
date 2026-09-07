import { describe, expect, it } from "vitest";
import { buildFamilyGroupIndex } from "./familyGroups";
import type { FamilyRelationship, Person } from "./types";

const members = ["root", "spouse", "son", "daughter", "grandchild", "former", "other-child", "isolated"].map((id): Person => ({
  id, treeId: "tree", displayName: id, gender: "unspecified", createdAt: "2026-01-01",
  birthDatePrecision: "year", notes: "", addressLine: "", city: "", province: "", country: "", postalCode: ""
}));
const edge = (from: string, to: string, kind: FamilyRelationship["kind"] = "parent"): FamilyRelationship => ({
  id: `${from}-${to}-${kind}`, treeId: "tree", fromPersonId: from, toPersonId: to, kind,
  subtype: kind === "parent" ? "biologicalParent" : "spouse", createdAt: "2026-01-01"
});
const edges = [edge("root", "spouse", "partner"), edge("root", "son"), edge("spouse", "son"),
  edge("root", "daughter"), edge("spouse", "daughter"), edge("daughter", "grandchild"),
  edge("son", "grandchild", "partner"), { ...edge("root", "former", "partner"), subtype: "formerPartner" as const },
  edge("root", "other-child"), edge("former", "other-child")];

describe("family group index", () => {
  it("groups children by their actual parents and preserves former relationships", () => {
    const index = buildFamilyGroupIndex(members, edges);
    const groups = index.groups.get("root")!;
    expect(groups.find((group) => group.partners.includes("spouse"))?.children).toEqual(["daughter", "son"]);
    expect(groups.find((group) => group.partners.includes("former"))?.children).toEqual(["other-child"]);
    expect(groups.find((group) => group.partners.includes("former"))?.relationship?.subtype).toBe("formerPartner");
    expect(index.byId.has("isolated")).toBe(true);
    expect(buildFamilyGroupIndex([...members].reverse(), [...edges].reverse()).groups).toEqual(index.groups);
  });
  it("handles empty, dangling, duplicate and self edges without mutating data", () => {
    const snapshot = JSON.stringify({ members, edges });
    const index = buildFamilyGroupIndex(members, [...edges, edges[1], edge("missing", "root"), edge("root", "root")]);
    expect(index.groups.get("root")?.flatMap((group) => group.children).filter((id) => id === "son")).toHaveLength(1);
    expect(JSON.stringify({ members, edges })).toBe(snapshot);
    expect(buildFamilyGroupIndex([], []).groups.size).toBe(0);
    expect(index.byId.has("missing")).toBe(false);
  });
});
