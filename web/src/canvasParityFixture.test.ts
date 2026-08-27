import { describe, expect, it } from "vitest";

import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import { fitSceneRect, panViewport, sceneToViewport, zoomViewportAt } from "./canvasViewport";
import {
  connectorPaths,
  crossingBridgePath,
  horizontalCrossingBridgePath,
  horizontalCrossingBridgePoints,
  roundedConnectorPath
} from "./connectorStyle";
import { createTreeLayout } from "./layout";
import type { FamilyRelationship, Person, PositionedPerson, TreeLayout } from "./types";

const fs = (globalThis as typeof globalThis & { process?: { env: Record<string, string | undefined>; getBuiltinModule?:
  (id: "fs") => { readFileSync(path: string, encoding: "utf8"): string; writeFileSync(path: string, value: string): void } } })
  .process?.getBuiltinModule?.("fs");
if (!fs) throw new Error("Node filesystem is unavailable.");
const fixturePath = "../tests/canvas-parity/synthetic-canvas-golden.json";

const person = (
  id: string,
  displayName: string,
  gender: Person["gender"],
  birthDate?: string,
  birthDatePrecision: Person["birthDatePrecision"] = "exact",
  city = ""
): Person => ({
  id, treeId: "synthetic", displayName, gender, birthDate, birthDatePrecision,
  createdAt: "2026-08-25T00:00:00.000Z", notes: "", addressLine: "", city,
  province: "", country: "", postalCode: ""
});
const relationship = (
  id: string,
  fromPersonId: string,
  toPersonId: string,
  kind: FamilyRelationship["kind"],
  extra: Partial<FamilyRelationship> = {}
): FamilyRelationship => ({
  id, treeId: "synthetic", fromPersonId, toPersonId, kind,
  subtype: kind === "parent" ? "biologicalParent" : kind === "partner" ? "spouse" : "sibling",
  createdAt: "2026-08-25T00:00:00.000Z", ...extra
});

const graphPeople = [
  person("grandfather", "Grandfather", "male", "1940-01-01", "year", "Surabaya"),
  person("grandmother", "Grandmother With A Long Canonical Name", "female", "1942-03-01", "month"),
  person("father", "Father", "male", "1965-04-03"),
  person("mother", "Mother", "female", "1968-06-05", "exact", "Bandung"),
  person("aunt", "Aunt", "female", "1960-02-01"),
  person("older", "Older Child", "female", "1988-01-01"),
  person("selected", "Selected", "male", "1990-05-04"),
  { ...person("younger", "Younger Child", "male", "1992-01-01"), birthOrderOverride: 4 },
  person("spouse", "Former Spouse", "female", "1991-08-07", "exact", "Jakarta"),
  person("cousin", "Cousin", "unspecified", "1987-07-01"),
  person("child", "Child", "female", "2015-09-02"),
  person("friend", "Explicit Sibling", "unspecified")
];
const graphRelationships = [
  relationship("partner-grandparents", "grandfather", "grandmother", "partner", { marriageDate: "1962-02-03" }),
  relationship("gp-father", "grandfather", "father", "parent"),
  relationship("gm-father", "grandmother", "father", "parent"),
  relationship("gp-aunt", "grandfather", "aunt", "parent"),
  relationship("gm-aunt", "grandmother", "aunt", "parent"),
  relationship("partner-parents", "father", "mother", "partner", { marriageDate: "1987-01-02" }),
  relationship("father-older", "father", "older", "parent"),
  relationship("mother-older", "mother", "older", "parent"),
  relationship("father-selected", "father", "selected", "parent"),
  relationship("mother-selected", "mother", "selected", "parent"),
  relationship("father-younger", "father", "younger", "parent"),
  relationship("mother-younger", "mother", "younger", "parent"),
  relationship("aunt-cousin", "aunt", "cousin", "parent"),
  relationship("partner-selected", "selected", "spouse", "partner", {
    subtype: "formerSpouse", marriageDate: "2012-04-05", divorceDate: "2020-03-04"
  }),
  relationship("selected-child", "selected", "child", "parent"),
  relationship("spouse-child", "spouse", "child", "parent"),
  relationship("explicit-sibling", "friend", "cousin", "sibling")
];

const positioned = (id: string, x: number, y: number, role = "") => ({
  ...person(id, id, "unspecified"), x, y, role, generation: y / 260
} satisfies PositionedPerson);
const routingLayout: TreeLayout = {
  people: [
    positioned("outer-left", -520, 0), positioned("inner-left", -260, 0),
    positioned("inner-right", 260, 0), positioned("outer-right", 520, 0),
    positioned("near-a", -260, 260), positioned("near-b", 260, 260),
    positioned("deep", 0, 520), positioned("side-left", -520, 520),
    positioned("side-right", 520, 520)
  ],
  relationships: [
    relationship("ol-near-b", "outer-left", "near-b", "parent"),
    relationship("or-near-b", "outer-right", "near-b", "parent"),
    relationship("il-near-a", "inner-left", "near-a", "parent"),
    relationship("ir-near-a", "inner-right", "near-a", "parent"),
    relationship("il-deep", "inner-left", "deep", "parent"),
    relationship("ir-deep", "inner-right", "deep", "parent"),
    relationship("dated-partners", "side-left", "side-right", "partner", {
      marriageDate: "2004-01-02", divorceDate: "2021-02-03", subtype: "formerSpouse"
    }),
    relationship("side-siblings", "side-left", "deep", "sibling")
  ],
  width: 0,
  height: 0
};

const point = ({ x, y }: { x: number; y: number }) => [x, y];
const rect = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) =>
  [x, y, width, height];
const segment = ({ start, end }: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
  [...point(start), ...point(end)];
const serializePlan = (plan: ConnectionPlan) => ({
  families: plan.families.map((family) => ({
    id: family.id, parentIds: family.parentIds, childIds: family.childIds,
    relationshipIds: family.relationshipIds, parentPorts: family.parentPorts.map(point),
    segments: family.segments.map(segment), junctions: family.junctions.map(point),
    laneIndex: family.laneIndex, laneCount: family.laneCount
  })),
  nonParentRoutes: plan.nonParentRoutes.map((route) => ({
    id: route.id,
    relationship: {
      id: route.relationship.id, fromPersonId: route.relationship.fromPersonId,
      toPersonId: route.relationship.toPersonId, kind: route.relationship.kind,
      subtype: route.relationship.subtype, marriageDate: route.relationship.marriageDate ?? null,
      divorceDate: route.relationship.divorceDate ?? null
    },
    segments: route.segments.map(segment),
    label: route.label ? { text: route.label.text, center: point(route.label.center), rect: rect(route.label.rect) } : null
  })),
  obstacles: plan.obstacles.map((obstacle) => ({
    kind: obstacle.kind, ownerId: obstacle.ownerId, rect: rect(obstacle.rect)
  })),
  controls: plan.controls.map((control) => ({
    personId: control.personId, side: control.side, addCenter: point(control.addCenter),
    editCenter: point(control.editCenter)
  })),
  crossings: plan.crossings.map(({ x, y, kind, horizontalKind }) => ({ x, y, kind, horizontalKind })),
  bounds: rect(plan.bounds), failures: plan.failures, isValid: plan.isValid
});
const paths = (plan: ConnectionPlan) => ({
  families: plan.families.map((family) => ({
    id: family.id,
    paths: connectorPaths(family.segments).map((value) => ({
      points: value.points.map(point), segmentIndexes: value.segmentIndexes,
      roundedPath: roundedConnectorPath(value.points)
    }))
  })),
  nonParentRoutes: plan.nonParentRoutes.map((route) => ({
    id: route.id,
    paths: connectorPaths(route.segments).map((value) => ({
      points: value.points.map(point), segmentIndexes: value.segmentIndexes,
      roundedPath: roundedConnectorPath(value.points)
    }))
  })),
  crossings: plan.crossings.map((crossing) => ({
    point: point(crossing), kind: crossing.kind, horizontalKind: crossing.horizontalKind,
    bridgePath: crossingBridgePath(crossing),
    horizontalBridgePath: horizontalCrossingBridgePath(crossing),
    horizontalBridgePoints: horizontalCrossingBridgePoints(crossing).map(point)
  }))
});

const generate = () => {
  const graph = Object.fromEntries((["en", "id"] as const).map((language) => {
    const layout = createTreeLayout(graphPeople, graphRelationships, "selected", undefined, language);
    const plan = createConnectionPlan(layout, language, "selected", true);
    return [language, {
      layout: {
        nodes: layout.people.map(({ id, displayName, role, x, y, generation, birthOrder, city, birthDate,
          birthDatePrecision }) => ({
          id, displayName, role, x, y, generation, birthOrder: birthOrder ?? null, city,
          birthDate: birthDate ?? null, birthDatePrecision
        })),
        relationships: layout.relationships.map(({ id }) => id), bounds: rect(layout.bounds)
      },
      plan: serializePlan(plan), paths: paths(plan)
    }];
  }));
  const routing = Object.fromEntries((["en", "id"] as const).map((language) => {
    const plan = createConnectionPlan(routingLayout, language, "deep", false);
    return [language, { plan: serializePlan(plan), paths: paths(plan) }];
  }));
  const bounds = (routing.en as { plan: { bounds: number[] } }).plan.bounds;
  const scene = { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] };
  const viewport = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]
    .map((size) => {
      const fit = fitSceneRect(scene, size, { viewportFactor: 0.82, minZoom: 0.08, maxZoom: 1.8 });
      const scenePoints = [
        { x: scene.x, y: scene.y },
        { x: scene.x + scene.width / 2, y: scene.y + scene.height / 2 },
        { x: scene.x + scene.width, y: scene.y + scene.height }
      ];
      return { size, fit, projected: scenePoints.map((value) => point(sceneToViewport(value, fit))) };
    });
  const start = { scrollX: -125, scrollY: 48, zoom: 0.75 };
  return {
    version: 1,
    input: { graph: { selectedPersonId: "selected", people: graphPeople, relationships: graphRelationships }, routing: routingLayout },
    output: { graph, routing },
    vectors: {
      metrics: { minZoom: 0.08, maxZoom: 1.8, familyRailSpacing: 32, childRailClearance: 40 },
      viewport,
      zoomAt: zoomViewportAt(start, { x: 123, y: 456 }, 1.5),
      pan: panViewport(start, { x: 30, y: -45 })
    }
  };
};

describe("tracked synthetic native canvas fixture", () => {
  it("matches the current canonical web layout, planner, paths, and viewport vectors", () => {
    const actual = JSON.parse(JSON.stringify(generate())) as ReturnType<typeof generate>;
    if (globalThis.process?.env.UPDATE_CANVAS_FIXTURE === "1") {
      fs.writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(actual).toEqual(JSON.parse(fs.readFileSync(fixturePath, "utf8")));
  });
});
