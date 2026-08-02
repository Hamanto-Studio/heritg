import { describe, expect, it } from "vitest";

import { buildChartSvg } from "./chartExport";
import { createConnectionPlan, segmentsFormConnectedNetwork } from "./connectionPlan";
import {
  collinearlyOverlaps,
  hasCollinearOverlap,
  parentPortY,
  pointsEqual,
  routeIsClear,
  segmentOrientation
} from "./connectionGeometry";
import type {
  FamilyRelationship,
  PositionedPerson,
  RelationshipKind,
  TreeLayout
} from "./types";

const person = (id: string, x: number, y: number): PositionedPerson => ({
  id,
  treeId: "tree",
  displayName: id,
  gender: "unspecified",
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDatePrecision: "exact",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: "",
  x,
  y,
  role: "Family member",
  generation: y / 260
});

const relationship = (
  id: string,
  fromPersonId: string,
  toPersonId: string,
  kind: RelationshipKind
): FamilyRelationship => ({
  id,
  treeId: "tree",
  fromPersonId,
  toPersonId,
  kind,
  subtype: kind === "parent" ? "biologicalParent" : kind === "partner" ? "spouse" : "sibling",
  createdAt: "2026-01-01T00:00:00.000Z"
});

const layout = (
  people: PositionedPerson[],
  relationships: FamilyRelationship[]
): TreeLayout => ({ people, relationships, width: 0, height: 0 });

const parent = (from: string, to: string) =>
  relationship(`${from}-${to}`, from, to, "parent");

describe("family connection planning", () => {
  it("uses one connected bus for siblings with the same parents", () => {
    const value = layout(
      [
        person("parent-a", -130, 0),
        person("parent-b", 130, 0),
        person("child-a", -260, 260),
        person("child-b", 0, 260),
        person("child-c", 260, 260)
      ],
      [
        parent("parent-a", "child-a"), parent("parent-b", "child-a"),
        parent("parent-a", "child-b"), parent("parent-b", "child-b"),
        parent("parent-a", "child-c"), parent("parent-b", "child-c")
      ]
    );

    const plan = createConnectionPlan(value);
    const family = plan.families[0];

    expect(plan.families).toHaveLength(1);
    expect(new Set(family.parentIds)).toEqual(new Set(["parent-a", "parent-b"]));
    expect(new Set(family.childIds)).toEqual(new Set(["child-a", "child-b", "child-c"]));
    expect(segmentsFormConnectedNetwork(family.segments)).toBe(true);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
  });

  it("gives a shared parent separate ports and lanes for remarriage families", () => {
    const value = layout(
      [
        person("partner-a", -260, 0), person("shared", 0, 0),
        person("partner-b", 260, 0), person("child-a", -130, 260),
        person("child-b", 130, 260)
      ],
      [
        parent("partner-a", "child-a"), parent("shared", "child-a"),
        parent("shared", "child-b"), parent("partner-b", "child-b")
      ]
    );

    const plan = createConnectionPlan(value);
    const sharedPorts = plan.families.map((family) =>
      family.parentPorts[family.parentIds.indexOf("shared")].x
    );

    expect(plan.families).toHaveLength(2);
    expect(new Set(sharedPorts).size).toBe(2);
    expect(new Set(plan.families.map(({ laneIndex }) => laneIndex)).size).toBe(2);
    expect(plan.isValid).toBe(true);
  });

  it("detours a partner route around an intervening person and controls", () => {
    const value = layout(
      [person("left", -260, 0), person("middle", 0, 0), person("right", 260, 0)],
      [relationship("outer-partners", "left", "right", "partner")]
    );

    const plan = createConnectionPlan(value);
    const route = plan.nonParentRoutes[0];
    const middleObstacles = plan.obstacles.filter(({ ownerId }) => ownerId === "middle");

    expect(route.segments.length).toBeGreaterThan(1);
    expect(routeIsClear(route.segments, middleObstacles)).toBe(true);
    expect(plan.isValid).toBe(true);
  });

  it("routes a generation-skipping family around an intermediate person", () => {
    const value = layout(
      [person("parent", 0, 0), person("blocker", 0, 260), person("child", 0, 520)],
      [parent("parent", "child")]
    );

    const plan = createConnectionPlan(value);
    const family = plan.families[0];
    const blockerObstacles = plan.obstacles.filter(({ ownerId }) => ownerId === "blocker");

    expect(family.segments.length).toBeGreaterThan(3);
    expect(routeIsClear(family.segments, blockerObstacles)).toBe(true);
    expect(segmentsFormConnectedNetwork(family.segments)).toBe(true);
    expect(plan.isValid).toBe(true);
  });

  it("starts dated-parent connectors below the complete life label", () => {
    const datedParent = {
      ...person("parent", 0, 0),
      birthDate: "1980-01-01"
    };
    const value = layout([datedParent, person("child", 0, 260)], [parent("parent", "child")]);

    const plan = createConnectionPlan(value);
    const port = { x: datedParent.x, y: parentPortY(datedParent) };

    expect(plan.families[0].segments.some(({ start, end }) =>
      pointsEqual(start, port) || pointsEqual(end, port)
    )).toBe(true);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
  });

  it("keeps parent stems attached when another label pushes the family rail down", () => {
    const left = person("left-parent", -260, 0);
    const right = person("right-parent", 260, 0);
    const value = layout(
      [left, person("unrelated", 0, 0), right, person("child", 0, 260)],
      [parent(left.id, "child"), parent(right.id, "child")]
    );

    const plan = createConnectionPlan(value);
    const endpoints = [left, right].map((value) => ({ x: value.x, y: parentPortY(value) }));

    expect(endpoints.every((port) => plan.families[0].segments.some(({ start, end }) =>
      pointsEqual(start, port) || pointsEqual(end, port)
    ))).toBe(true);
    expect(plan.isValid).toBe(true);
  });

  it("does not create reversed or overlapping segments inside one family", () => {
    const people = [
      person("p0", -650, 0), person("p1", -390, 0),
      person("p3", 130, 0), person("p4", 390, 0),
      person("c3", -520, 260), person("c1", -260, 260), person("c5", 0, 520)
    ];
    const relationships = [
      parent("p0", "c3"), parent("p3", "c3"),
      parent("p1", "c1"), parent("p4", "c1"),
      parent("p1", "c5"), parent("p4", "c5")
    ];
    const plan = createConnectionPlan(layout(people, relationships));

    expect(plan.families.every(({ segments }) => !segments.some((segment, index) =>
      segments.slice(index + 1).some((other) => collinearlyOverlaps(segment, other))
    ))).toBe(true);
    expect(plan.failures).toEqual(["family:2:p1|2:p4"]);
    expect(plan.isValid).toBe(false);
  });

  it("assigns separate obstacle-safe routes to several partners", () => {
    const people = [
      person("far-left", -780, 0), person("left", -260, 0),
      person("shared", 0, 0), person("right", 260, 0), person("far-right", 780, 0)
    ];
    const relationships = [
      relationship("partner-a", "shared", "far-left", "partner"),
      relationship("partner-b", "shared", "left", "partner"),
      relationship("partner-c", "shared", "right", "partner"),
      relationship("partner-d", "shared", "far-right", "partner")
    ];
    const plan = createConnectionPlan(layout(people, relationships));

    expect(plan.nonParentRoutes).toHaveLength(4);
    expect(plan.nonParentRoutes.every(({ segments, relationship }) => routeIsClear(
      segments,
      plan.obstacles,
      new Set([relationship.fromPersonId, relationship.toPersonId])
    ))).toBe(true);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
  });

  it("is deterministic and has no unrelated collinear connector overlaps", () => {
    const people = [
      person("a", -260, 0), person("b", 0, 0), person("c", 260, 0),
      person("child-a", -130, 260), person("child-b", 130, 260)
    ];
    const relationships = [
      parent("a", "child-a"), parent("b", "child-a"),
      parent("b", "child-b"), parent("c", "child-b")
    ];
    const first = createConnectionPlan(layout(people, relationships));
    const second = createConnectionPlan(layout([...people].reverse(), [...relationships].reverse()));

    expect(second).toEqual(first);
    for (let index = 0; index < first.families.length; index += 1) {
      for (let other = index + 1; other < first.families.length; other += 1) {
        expect(hasCollinearOverlap(
          first.families[index].segments,
          first.families[other].segments
        )).toBe(false);
      }
    }
    expect(first.families.flatMap(({ segments }) => segments).every((segment) =>
      Boolean(segmentOrientation(segment))
    )).toBe(true);
  });

  it("exports every segment and marriage label from the shared plan", () => {
    const marriage = {
      ...relationship("marriage", "parent-a", "parent-b", "partner"),
      marriageDate: "2004-01-02"
    };
    const value = layout(
      [person("parent-a", -130, 0), person("parent-b", 130, 0), person("child", 0, 260)],
      [marriage, parent("parent-a", "child"), parent("parent-b", "child")]
    );
    const plan = createConnectionPlan(value);
    const chart = buildChartSvg(value, "Family", undefined, "en", plan);

    expect(chart.svg.match(/data-family-id=/g)).toHaveLength(plan.families[0].segments.length);
    expect(chart.svg.match(/data-route-id="marriage"/g)).toHaveLength(
      plan.nonParentRoutes[0].segments.length
    );
    expect(chart.svg).toContain('data-relationship-label="marriage"');
  });
});
