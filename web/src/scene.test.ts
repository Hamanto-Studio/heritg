import { describe, expect, it } from "vitest";

import { circularAvatarData, createCircularAvatarCache } from "./avatar";
import { buildChartSvg, pngExportDimensions } from "./chartExport";
import { formatDisplayDate } from "./i18n";
import { LAYOUT_METRICS } from "./layout";
import type { FamilyRelationship, PositionedPerson, TreeLayout } from "./types";

const person: PositionedPerson = {
  id: "person",
  treeId: "tree",
  displayName: "A Person With A Longer Name",
  gender: "unspecified",
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDate: "1990-01-01",
  birthDatePrecision: "exact",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: "",
  x: 0,
  y: 0,
  role: "Selected person",
  generation: 0
};

const layout: TreeLayout = {
  people: [person],
  relationships: [],
  width: LAYOUT_METRICS.labelWidth,
  height: LAYOUT_METRICS.avatarRadius + LAYOUT_METRICS.nodeBottom
};

describe("canvas avatar projection", () => {
  it("wraps profile photos in a circular SVG mask", () => {
    const photo = circularAvatarData(
      "data:image/jpeg;base64,/9j/2Q==",
      LAYOUT_METRICS.innerAvatarDiameter
    );

    expect(photo).toBeDefined();
    const encoded = photo!.dataURL.split(",", 2)[1];
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    );
    expect(decoded).toContain(
      '<clipPath id="avatar-clip"><circle'
    );
  });

  it("reuses an encoded profile photo across selection renders", () => {
    const source = "data:image/jpeg;base64,/9j/2Q==";
    const resolveAvatar = createCircularAvatarCache();
    const first = resolveAvatar(source, LAYOUT_METRICS.innerAvatarDiameter);
    const second = resolveAvatar(source, LAYOUT_METRICS.innerAvatarDiameter);

    expect(second).toBe(first);
    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it("exports circular nodes instead of rounded cards", () => {
    const chart = buildChartSvg(layout, "Family", person.id);

    expect(chart.svg).toContain(`<circle cx="${LAYOUT_METRICS.labelWidth / 2 + 56}"`);
    expect(chart.svg).toContain('text-anchor="middle"');
    expect(chart.svg).not.toContain('rx="16"');
  });

  it("exports role labels only when a person is selected", () => {
    const withoutSelection = buildChartSvg(layout, "Family").svg;
    const withSelection = buildChartSvg(layout, "Family", person.id).svg;

    expect(withoutSelection).not.toContain(">Selected person</text>");
    expect(withSelection).toContain(">Selected person</text>");
  });

  it("exports birth dates according to their stored precision", () => {
    const exact = buildChartSvg(layout, "Family", person.id, "id").svg;
    const month = buildChartSvg({
      ...layout,
      people: [{ ...person, birthDatePrecision: "month" }]
    }, "Family", person.id, "id").svg;
    const year = buildChartSvg({
      ...layout,
      people: [{ ...person, birthDatePrecision: "year" }]
    }, "Family", person.id, "id").svg;

    expect(exact).toContain("Lahir 1 Jan 1990");
    expect(month).toContain("Lahir Jan 1990");
    expect(month).not.toContain("Lahir 1 Jan 1990");
    expect(year).toContain("Lahir 1990");
    expect(year).not.toContain("Lahir Jan 1990");
  });

  it("exports localized marriage dates on partner lines", () => {
    const spouse: PositionedPerson = {
      ...person,
      id: "spouse",
      displayName: "Spouse",
      x: LAYOUT_METRICS.horizontalSpacing,
      role: "Wife"
    };
    const relationship: FamilyRelationship = {
      id: "marriage",
      treeId: "tree",
      fromPersonId: person.id,
      toPersonId: spouse.id,
      kind: "partner",
      subtype: "spouse",
      marriageDate: "2020-01-02",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const marriedLayout: TreeLayout = {
      ...layout,
      people: [person, spouse],
      relationships: [relationship]
    };

    const english = buildChartSvg(marriedLayout, "Family", person.id, "en").svg;
    const indonesian = buildChartSvg(marriedLayout, "Family", person.id, "id").svg;
    const withoutRelationshipDates = buildChartSvg(
      marriedLayout,
      "Family",
      person.id,
      "en",
      undefined,
      { birthDates: true, relationshipDates: false, photos: true, ages: true }
    ).svg;
    expect(english).toContain(`Married ${formatDisplayDate("2020-01-02", "en")}`);
    expect(indonesian).toContain(`Menikah ${formatDisplayDate("2020-01-02", "id")}`);
    expect(withoutRelationshipDates).not.toContain(`Married ${formatDisplayDate("2020-01-02", "en")}`);
  });

  it("omits unchecked personal details from SVG and PNG source", () => {
    const privateLayout: TreeLayout = {
      ...layout,
      people: [{
        ...person,
        birthOrder: 1,
        photoDataUrl: "data:image/png;base64,cHJpdmF0ZS1waG90bw=="
      }]
    };
    const svg = buildChartSvg(privateLayout, "Family", person.id, "en", undefined, {
      birthDates: false,
      relationshipDates: false,
      photos: false,
      ages: false
    }).svg;

    expect(svg).toContain("A Person With A Longer Name");
    expect(svg).not.toContain("private-photo");
    expect(svg).not.toContain("data-birth-order");
    expect(svg).not.toContain("Born ");
    expect(svg).not.toContain("age ");
  });

  it("renders large PNG exports above the old 4096-pixel ceiling", () => {
    expect(pngExportDimensions({ width: 1_000, height: 500 })).toEqual({
      width: 2_000,
      height: 1_000,
      scale: 2
    });
    const large = pngExportDimensions({ width: 6_000, height: 3_000 });
    expect(large.width).toBeGreaterThan(11_000);
    expect(large.height).toBeGreaterThan(5_500);
    expect(large.width * large.height).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});
