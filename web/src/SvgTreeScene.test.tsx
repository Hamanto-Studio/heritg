import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createConnectionPlan } from "./connectionPlan";
import { createTreeLayout } from "./layout";
import { SvgTreeScene } from "./SvgTreeScene";
import type { FamilyRelationship, Person } from "./types";

const person = (
  id: string,
  displayName: string,
  gender: Person["gender"] = "unspecified"
): Person => ({
  id,
  treeId: "tree",
  displayName,
  gender,
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDatePrecision: "year",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: ""
});

const people = [person("parent", "Parent Example"), person("child", "Child Example")];
const relationships: FamilyRelationship[] = [{
  id: "parent-child",
  treeId: "tree",
  fromPersonId: "parent",
  toPersonId: "child",
  kind: "parent",
  subtype: "biologicalParent",
  createdAt: "2026-01-01T00:00:00.000Z"
}];
const layout = createTreeLayout(people, relationships, undefined, {
  ancestors: null,
  descendants: null
}, "en");
const plan = createConnectionPlan(layout, "en");

describe("SvgTreeScene", () => {
  it("renders routed connectors, person metadata, labels, and selected styling", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={plan}
          language="en"
          layout={layout}
          selectedPersonId="parent"
        />
      </svg>
    );

    expect(markup).toContain("svg-connector family");
    expect(markup).toContain('data-person-id="parent"');
    expect(markup).toContain("Parent Example");
    expect(markup).toContain("Child Example");
    expect(markup).toContain('stroke="#9c825f"');
  });

  it("renders long names as two centered lines at a consistent font size", () => {
    const longNameLayout = createTreeLayout([
      person("long-name", "Novian Pratomo Edi Nugroho (Novan)")
    ], []);
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={createConnectionPlan(longNameLayout)}
          language="en"
          layout={longNameLayout}
        />
      </svg>
    );

    expect(markup).toContain('class="svg-person-name" font-size="14" text-anchor="middle"');
    expect(markup).toContain(">Novian Pratomo Edi</tspan>");
    expect(markup).toContain(">Nugroho (Novan)</tspan>");
  });

  it("renders the current city below birth details", () => {
    const cityLayout = createTreeLayout([{
      ...person("city-person", "City Person"),
      birthDate: "1990-01-01",
      birthDatePrecision: "exact",
      city: "Jakarta"
    }], []);
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={createConnectionPlan(cityLayout)}
          language="en"
          layout={cityLayout}
        />
      </svg>
    );

    expect(markup).toContain("Born Jan 1, 1990");
    expect(markup).toContain('class="svg-person-city"');
    expect(markup).toContain(">Jakarta</text>");
    expect(markup.indexOf(">Jakarta</text>")).toBeGreaterThan(markup.indexOf("Born Jan 1, 1990"));
  });

  it("renders distinct gender fills while selection remains a separate outline", () => {
    const genderPeople = [
      person("female", "Female Example", "female"),
      person("male", "Male Example", "male"),
      person("unspecified", "Unspecified Example")
    ];
    const baseGenderLayout = createTreeLayout(genderPeople, []);
    const genderLayout = {
      ...baseGenderLayout,
      people: baseGenderLayout.people.map((value) =>
        value.id === "female" ? { ...value, birthOrder: 1 } : value
      )
    };
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={createConnectionPlan(genderLayout)}
          language="en"
          layout={genderLayout}
          selectedPersonId="female"
        />
      </svg>
    );

    expect(markup).toContain('data-gender="female"');
    expect(markup).toContain('fill="#f4e4e8"');
    expect(markup).toContain('data-gender="male"');
    expect(markup).toContain('fill="#e2ebf2"');
    expect(markup).toContain('data-gender="unspecified"');
    expect(markup).toContain('fill="#ede5d8"');
    expect(markup).toContain('stroke="#9c825f"');
    expect(markup).toContain('data-birth-order="1"');
  });

  it("renders distinct gender fills while selection remains a separate outline", () => {
    const genderPeople = [
      person("female", "Female Example", "female"),
      person("male", "Male Example", "male"),
      person("unspecified", "Unspecified Example")
    ];
    const baseGenderLayout = createTreeLayout(genderPeople, []);
    const genderLayout = {
      ...baseGenderLayout,
      people: baseGenderLayout.people.map((value) =>
        value.id === "female" ? { ...value, birthOrder: 1 } : value
      )
    };
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={createConnectionPlan(genderLayout)}
          language="en"
          layout={genderLayout}
          overview={false}
          selectedPersonId="female"
        />
      </svg>
    );

    expect(markup).toContain('data-gender="female"');
    expect(markup).toContain('fill="#f4e4e8"');
    expect(markup).toContain('data-gender="male"');
    expect(markup).toContain('fill="#e2ebf2"');
    expect(markup).toContain('data-gender="unspecified"');
    expect(markup).toContain('fill="#ede5d8"');
    expect(markup).toContain('stroke="#9c825f"');
    expect(markup).toContain('data-birth-order="1"');
  });
});
