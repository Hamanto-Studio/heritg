import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createConnectionPlan } from "./connectionPlan";
import { createTreeLayout } from "./layout";
import { SvgTreeScene } from "./SvgTreeScene";
import type { FamilyRelationship, Person } from "./types";

const person = (id: string, displayName: string): Person => ({
  id,
  treeId: "tree",
  displayName,
  gender: "unspecified",
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
          overview={false}
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

  it("keeps routes and avatar hit groups while omitting unreadable overview details", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgTreeScene
          connectionPlan={plan}
          language="en"
          layout={layout}
          overview
        />
      </svg>
    );

    expect(markup).toContain("svg-connector family");
    expect(markup).toContain('data-person-id="parent"');
    expect(markup).not.toContain("svg-person-name");
    expect(markup).not.toContain("svg-person-initial");
  });
});
