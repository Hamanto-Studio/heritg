import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTreeLayout } from "./layout";
import { directedFamilyCorridors } from "./directedFamilyCorridors";
import { createConnectionPlan } from "./connectionPlan";
import { nodeLabelRect, pointsEqual } from "./connectionGeometry";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { SvgTreeScene } from "./SvgTreeScene";
import { buildChartSvg } from "./chartExport";
import { personLifeSummary } from "./lifeSummary";
import { DEFAULT_EXPORT_PRIVACY_SELECTION } from "./exportPrivacy";
import { routeClarity } from "./testFixtures/routeClarity";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0, crossings: 0 };
const prepared = (size: number) => {
  const data = indonesianFamilyFixture(size, "compound");
  const initial = createTreeLayout(data.people, data.relationships);
  const layout = directedFamilyCorridors({ ...initial, people: initial.people.map((person) => ({ ...person, role: " " })) })!;
  return { layout, plan: createConnectionPlan(layout, "id", undefined, false) };
};

describe("visible label attachments without re-routing", () => {
  it.each([31, 500])("preserves every route and endpoint as roles appear/disappear for %i people", (size) => {
    const { layout, plan } = prepared(size), before = JSON.stringify({ layout, plan });
    for (const selected of [undefined, layout.people[0].id, layout.people.at(-1)!.id, undefined]) {
      const visible = visibleConnectionPlan(plan, layout, "id", selected);
      expect(routeClarity(layout, visible)).toMatchObject(integrity);
      expect(visible.crossings).toBe(plan.crossings);
      expect(visible.controls).toBe(plan.controls);
      expect(visible.bounds).toBe(plan.bounds);
      for (const family of visible.families) family.parentPorts.forEach((port, i) => {
        const person = layout.people.find((person) => person.id === family.parentIds[i])!;
        const rect = nodeLabelRect(person, { showRole: Boolean(selected && person.role), hasLife: Boolean(personLifeSummary(person, "id")) });
        expect(port.y).toBeCloseTo(rect.y + rect.height + 2);
      });
      if (selected) expect(visible).toBe(plan);
      else expect(visible.families.some((family, i) => family.parentPorts.some((port, j) =>
        port.y < plan.families[i].parentPorts[j].y))).toBe(true);
    }
    expect(JSON.stringify({ layout, plan })).toBe(before);
  }, 15000);

  it.each(["en", "id"] as const)("keeps both marriage endpoints and hidden date/age exports attached in %s", (language) => {
    const { layout, plan } = prepared(31);
    for (const selected of [undefined, layout.people[0].id]) for (const birthDates of [false, true]) for (const ages of [false, true]) {
      const visible = visibleConnectionPlan(plan, layout, language, selected, { showBirthDate: birthDates, showAge: ages });
      expect(routeClarity(layout, visible)).toMatchObject(integrity);
      for (const route of visible.nonParentRoutes) for (const terminal of route.labelTerminals ?? []) {
        expect([route.segments[0].start, route.segments.at(-1)!.end].some((point) => pointsEqual(point, terminal.point))).toBe(true);
      }
      const chart = buildChartSvg(layout, "Synthetic family", selected, language, plan,
        { ...DEFAULT_EXPORT_PRIVACY_SELECTION, birthDates, ages, relationshipDates: false, photos: false });
      const svg = new DOMParser().parseFromString(chart.svg, "image/svg+xml");
      expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(31);
      for (const route of plan.nonParentRoutes) {
        expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
        if (route.relationship.kind === "partner") expect(svg.querySelector(`[data-relationship-label="${route.id}"]`)).toBeNull();
      }
      expect(chart.svg).not.toContain("parsererror");
    }
  });

  it("projects actual SVG connector paths, while keeping the prepared route immutable", () => {
    const { layout, plan } = prepared(31);
    const visible = visibleConnectionPlan(plan, layout, "id");
    const markup = renderToStaticMarkup(<svg><SvgTreeScene connectionPlan={plan} layout={layout} language="id" /></svg>);
    const svg = new DOMParser().parseFromString(markup, "image/svg+xml");
    for (const family of visible.families) for (const port of family.parentPorts) {
      const paths = [...svg.querySelectorAll(`[data-family-id="${family.id}"]`)].map((path) => path.getAttribute("d"));
      expect(paths.some((path) => path?.includes(`${port.x} ${port.y}`))).toBe(true);
    }
  });
});
