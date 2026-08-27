import { describe, expect, it } from "vitest";

import { buildChartSvg } from "./chartExport";
import {
  createConnectionPlan,
  segmentsFormConnectedNetwork
} from "./connectionPlan";
import {
  CHILD_RAIL_CLEARANCE,
  collinearlyOverlaps,
  hasCollinearOverlap,
  parentPortY,
  pointsEqual,
  routeIsClear,
  segmentOrientation
} from "./connectionGeometry";
import { createTreeLayout, LAYOUT_METRICS } from "./layout";
import { obstacleCollisions } from "./obstacleRouter";
import { importGedcom } from "./portability";
import type {
  FamilyRelationship,
  PositionedPerson,
  RelationshipKind,
  TreeLayout
} from "./types";

const fileSystem = (globalThis as typeof globalThis & {
  process?: {
    getBuiltinModule?: (id: "fs") => {
      readFileSync: (path: string, encoding: "utf8") => string;
    };
  };
}).process?.getBuiltinModule?.("fs");
if (!fileSystem) throw new Error("Node filesystem is unavailable to integration tests.");
const hamantoGed = (() => {
  try {
    return fileSystem.readFileSync("../example/hamanto.ged", "utf8");
  } catch {
    return undefined;
  }
})();
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
  it("places a person shared by two partner relationships between both partners", () => {
    const people = [
      person("shared-partner", 0, 0),
      person("first-partner", 0, 0),
      person("second-partner", 0, 0)
    ];
    const relationships = [
      relationship("partner-one", "shared-partner", "first-partner", "partner"),
      relationship("partner-two", "shared-partner", "second-partner", "partner")
    ];
    const treeLayout = createTreeLayout(people, relationships);
    const positionedById = new Map(treeLayout.people.map((value) => [value.id, value]));
    const sharedPartner = positionedById.get("shared-partner")!;
    const partners = [positionedById.get("first-partner")!, positionedById.get("second-partner")!]
      .sort((left, right) => left.x - right.x);

    expect(partners[0].x).toBe(sharedPartner.x - LAYOUT_METRICS.horizontalSpacing);
    expect(partners[1].x).toBe(sharedPartner.x + LAYOUT_METRICS.horizontalSpacing);
    expect(partners[0].y).toBe(sharedPartner.y);
    expect(partners[1].y).toBe(sharedPartner.y);
    expect(createConnectionPlan(treeLayout, "en", undefined, false).failures).toEqual([]);
  });

  it("keeps dense child tracks inside the generation corridor", () => {
    for (const count of [12, 72]) {
      const people = [
        ...Array.from({ length: count }, (_, index) =>
          person(`parent-${index}`, (index - (count - 1) / 2) * 260, 0)
        ),
        ...Array.from({ length: count }, (_, index) =>
          person(`child-${index}`, ((count - 1) / 2 - index) * 260, 360)
        )
      ];
      const relationships = Array.from({ length: count }, (_, index) =>
        parent(`parent-${index}`, `child-${index}`)
      );
      const plan = createConnectionPlan(layout(people, relationships), "en", undefined, false);

      expect(plan.failures).toEqual([]);
      expect(plan.isValid).toBe(true);
      expect(plan.families.flatMap((family) => obstacleCollisions(
        family.segments,
        plan.obstacles,
        new Set([...family.parentIds, ...family.childIds])
      ))).toEqual([]);
    }
  });

  it("reflows descendant rows after ancestor alignment shifts family blocks", () => {
    const people = ["a1", "b0", "c1", "p", "q", "s1", "s2", "s3", "u", "x0"]
      .map((id) => person(id, 0, 0));
    const relationships = [
      parent("b0", "u"),
      parent("b0", "s1"),
      parent("b0", "s2"),
      parent("b0", "s3"),
      parent("a1", "p"),
      parent("c1", "q"),
      parent("q", "x0"),
      parent("p", "x0")
    ];
    const treeLayout = createTreeLayout(people, relationships);
    const row = treeLayout.people
      .filter(({ generation }) => generation === 1)
      .sort((left, right) => left.x - right.x);

    expect(row.map(({ id }) => id)).toEqual(["p", "q", "s1", "s2", "s3", "u"]);
    const gaps = row.slice(1).map((current, index) => current.x - row[index].x);
    expect(gaps[0]).toBe(LAYOUT_METRICS.horizontalSpacing);
    expect(gaps[1]).toBeGreaterThanOrEqual(
      LAYOUT_METRICS.horizontalSpacing + LAYOUT_METRICS.familyGap
    );
    expect(gaps.slice(2)).toEqual(Array(3).fill(LAYOUT_METRICS.horizontalSpacing));
    expect(treeLayout.width).toBeLessThanOrEqual(3_000);

    const plan = createConnectionPlan(treeLayout, "en", undefined, false);
    const family = plan.families.find(({ parentIds }) =>
      parentIds.length === 2 && parentIds.includes("p") && parentIds.includes("q")
    )!;
    expect(family.childIds).toEqual(["x0"]);
    expect(obstacleCollisions(
      family.segments,
      plan.obstacles,
      new Set([...family.parentIds, ...family.childIds])
    )).toEqual([]);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);

    const photoLayout = createTreeLayout(people.map((value) => ({
      ...value,
      photoDataUrl: "data:image/jpeg;base64,/9j/2Q=="
    })), relationships);
    expect(photoLayout.people.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      treeLayout.people.map(({ id, x, y }) => ({ id, x, y }))
    );
    expect(createConnectionPlan(photoLayout, "en", undefined, false)).toEqual(plan);
  });

  it.skipIf(!hamantoGed)("keeps the complete example tree readable without routing failures", () => {
    let nextId = 0;
    const data = importGedcom(hamantoGed!, {
      idFactory: () => `id-${String(nextId++).padStart(3, "0")}`,
      now: "2026-08-09T00:00:00.000Z"
    });
    const tree = data.trees[0];
    const treeLayout = createTreeLayout(
      data.people,
      data.relationships,
      tree.lastSelectedPersonId
    );
    const plan = createConnectionPlan(treeLayout, "en", tree.lastSelectedPersonId);
    const positionedByName = new Map(
      treeLayout.people.map((person) => [person.displayName, person])
    );
    const childrenOf = (...parentNames: string[]) => {
      const parentIds = new Set(parentNames.map((name) => positionedByName.get(name)?.id));
      const childIds = new Set(data.relationships
        .filter((relationship) =>
          relationship.kind === "parent" && parentIds.has(relationship.fromPersonId)
        )
        .map((relationship) => relationship.toPersonId));
      return treeLayout.people.filter((person) => childIds.has(person.id));
    };
    const nearestChildren = (children: PositionedPerson[]) => {
      const generation = Math.min(...children.map((person) => person.generation));
      return children.filter((person) => person.generation === generation);
    };
    const yatmin = positionedByName.get("Yatmin")!;
    const binem = positionedByName.get("Binem")!;
    const yatminCenter = (yatmin.x + binem.x) / 2;
    const yatminChildren = nearestChildren(childrenOf("Yatmin", "Binem"));
    const ismailChildren = nearestChildren(childrenOf("Ismail", "Nasiah"));
    const familyFor = (...parentNames: string[]) => {
      const parentIds = new Set(parentNames.map((name) => positionedByName.get(name)!.id));
      return plan.families.find((family) =>
        family.parentIds.length === parentIds.size &&
        family.parentIds.every((id) => parentIds.has(id))
      )!;
    };
    const familiesCross = (first: typeof plan.families[number], second: typeof plan.families[number]) =>
      first.segments.some((left) => second.segments.some((right) => {
        const horizontal = segmentOrientation(left) === "horizontal" ? left
          : segmentOrientation(right) === "horizontal" ? right : undefined;
        const vertical = segmentOrientation(left) === "vertical" ? left
          : segmentOrientation(right) === "vertical" ? right : undefined;
        return Boolean(horizontal && vertical &&
          vertical.start.x > Math.min(horizontal.start.x, horizontal.end.x) &&
          vertical.start.x < Math.max(horizontal.start.x, horizontal.end.x) &&
          horizontal.start.y > Math.min(vertical.start.y, vertical.end.y) &&
          horizontal.start.y < Math.max(vertical.start.y, vertical.end.y));
      }));

    expect(treeLayout.people).toHaveLength(44);
    expect(plan.families).toHaveLength(10);
    expect(plan.families.every(({ segments }) =>
      segmentsFormConnectedNetwork(segments)
    )).toBe(true);
    expect(new Set(yatminChildren.map((person) => person.generation)).size).toBe(1);
    expect(positionedByName.get("Sukamto")!.x).toBeLessThan(
      positionedByName.get("Karno")!.x
    );
    expect(
      positionedByName.get("Robihamanto")!.x - positionedByName.get("Irvan Tama")!.x
    ).toBeLessThanOrEqual(
      LAYOUT_METRICS.horizontalSpacing * 3 + LAYOUT_METRICS.familyGap
    );
    expect(yatminCenter).toBeGreaterThan(
      Math.max(...ismailChildren.map((person) => person.x))
    );
    expect(familiesCross(
      familyFor("Yatmin", "Binem"),
      familyFor("Ismail", "Nasiah")
    )).toBe(false);
    const yatminFamily = familyFor("Yatmin", "Binem");
    expect(obstacleCollisions(
      yatminFamily.segments,
      plan.obstacles,
      new Set(yatminFamily.parentIds.concat(yatminFamily.childIds))
    )).toEqual([]);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
  });

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

  it("omits sibling routes already shown by a family bus", () => {
    const value = layout(
      [
        person("parent-a", -130, 0), person("parent-b", 130, 0),
        person("child-a", -260, 260), person("child-b", 0, 260),
        person("sibling-without-parents", 260, 260)
      ],
      [
        parent("parent-a", "child-a"), parent("parent-b", "child-a"),
        parent("parent-a", "child-b"), parent("parent-b", "child-b"),
        relationship("redundant-siblings", "child-a", "child-b", "sibling"),
        relationship("sibling-only", "child-b", "sibling-without-parents", "sibling")
      ]
    );

    const plan = createConnectionPlan(value, "en", undefined, false);

    expect(plan.nonParentRoutes.map(({ id }) => id)).toEqual(["sibling-only"]);
    expect(value.relationships.some(({ id }) => id === "redundant-siblings")).toBe(true);
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

  it("keeps married and unmarried child stems equally clear of the family rail", () => {
    const childY = 260;
    const value = layout(
      [
        person("parent-a", -130, 0), person("parent-b", 130, 0),
        person("spouse", -390, childY), person("married-child", -130, childY),
        person("unmarried-child", 130, childY)
      ],
      [
        parent("parent-a", "married-child"), parent("parent-b", "married-child"),
        parent("parent-a", "unmarried-child"), parent("parent-b", "unmarried-child"),
        relationship("child-marriage", "spouse", "married-child", "partner")
      ]
    );

    const plan = createConnectionPlan(value, "en", undefined, false);
    const family = plan.families[0];
    const childTop = childY - LAYOUT_METRICS.avatarRadius;
    const stemLength = (childId: string) => {
      const childX = value.people.find(({ id }) => id === childId)!.x;
      const stem = family.segments.find(({ start, end }) =>
        start.x === childX && end.x === childX && (start.y === childTop || end.y === childTop)
      )!;
      return Math.abs(stem.start.y - stem.end.y);
    };

    expect(stemLength("married-child")).toBe(CHILD_RAIL_CLEARANCE);
    expect(stemLength("unmarried-child")).toBe(CHILD_RAIL_CLEARANCE);
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

  it("does not reserve action controls for a read-only tree", () => {
    const value = layout(
      [person("parent", 0, 0), person("child", 0, 260)],
      [parent("parent", "child")]
    );

    const plan = createConnectionPlan(value, "en", undefined, false);

    expect(plan.obstacles.some(({ kind }) =>
      kind === "addControl" || kind === "editControl"
    )).toBe(false);
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

  it("uses one family bus for children on different generations", () => {
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
    const combinedFamilies = plan.families.filter(({ parentIds }) =>
      parentIds.length === 2 && parentIds.includes("p1") && parentIds.includes("p4")
    );

    expect(combinedFamilies).toHaveLength(1);
    expect(new Set(combinedFamilies[0].childIds)).toEqual(new Set(["c1", "c5"]));
    expect(segmentsFormConnectedNetwork(combinedFamilies[0].segments)).toBe(true);
    expect(plan.families.every(({ segments }) => !segments.some((segment, index) =>
      segments.slice(index + 1).some((other) => collinearlyOverlaps(segment, other))
    ))).toBe(true);
    for (let index = 0; index < plan.families.length; index += 1) {
      for (let other = index + 1; other < plan.families.length; other += 1) {
        expect(hasCollinearOverlap(
          plan.families[index].segments,
          plan.families[other].segments
        )).toBe(false);
      }
    }
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
  });

  it("moves a multi-generation trunk away from children sharing one column", () => {
    const people = [
      person("parent-a", -130, 0), person("parent-b", 130, 0),
      person("near-child", 0, 260), person("deep-child", 0, 520)
    ];
    const plan = createConnectionPlan(layout(people, [
      parent("parent-a", "near-child"), parent("parent-b", "near-child"),
      parent("parent-a", "deep-child"), parent("parent-b", "deep-child")
    ]));
    const family = plan.families[0];

    expect(segmentsFormConnectedNetwork(family.segments)).toBe(true);
    expect(obstacleCollisions(
      family.segments,
      plan.obstacles,
      new Set(family.parentIds.concat(family.childIds))
    ).filter(({ obstacle }) => obstacle.kind === "avatar" || obstacle.kind === "nodeLabel"))
      .toEqual([]);
    expect(plan.failures).toEqual([]);
    expect(plan.isValid).toBe(true);
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

  it("exports every segment with clear terminal stems and keeps the marriage label", () => {
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

    expect(plan.nonParentRoutes[0].label?.center.y).toBe(-14);
    const representedFamilySegments = [...chart.svg.matchAll(/data-family-id="[^"]+"[^>]+data-segment-indexes="([^"]+)"/g)]
      .flatMap((match) => match[1].split(","));
    const representedMarriageSegments = [...chart.svg.matchAll(/data-route-id="marriage"[^>]+data-segment-indexes="([^"]+)"/g)]
      .flatMap((match) => match[1].split(","));
    expect(representedFamilySegments).toHaveLength(plan.families[0].segments.length);
    expect(representedMarriageSegments).toHaveLength(plan.nonParentRoutes[0].segments.length);
    expect(chart.svg).toContain('d="M 151 172 L 151 176 Q 151 180 155 180 L 281 180"');
    expect(chart.svg).not.toContain('stroke-width="1.5"');
    expect(chart.svg).toContain('data-relationship-label="marriage"');
  });
});
