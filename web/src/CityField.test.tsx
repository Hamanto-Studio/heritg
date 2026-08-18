import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CityField, citySuggestions } from "./CityField";
import type { Person } from "./types";

const person = (id: string, city: string, treeId = "tree"): Person => ({
  id,
  treeId,
  displayName: id,
  gender: "unspecified",
  createdAt: "2026-08-18T00:00:00.000Z",
  birthDatePrecision: "exact",
  notes: "",
  addressLine: "",
  city,
  province: "",
  country: "",
  postalCode: ""
});

describe("city suggestions", () => {
  const people = [
    person("one", " Jakarta "),
    person("two", "jakarta"),
    person("three", "Bandung"),
    person("four", "South   Tangerang"),
    person("other-tree", "Surabaya", "other")
  ];

  it("returns unique normalized cities from the same tree", () => {
    expect(citySuggestions(people, "tree")).toEqual([
      "Bandung",
      "Jakarta",
      "South Tangerang"
    ]);
  });

  it("renders an editable input connected to its local suggestion list", () => {
    const markup = renderToStaticMarkup(
      <CityField
        label="Current city / domicile"
        onChange={vi.fn()}
        people={people}
        treeId="tree"
        value="Jak"
      />
    );

    expect(markup).toContain('autoComplete="address-level2"');
    expect(markup).toMatch(/<input[^>]+list="([^"]+)"/);
    expect(markup).toContain('<option value="Bandung"></option>');
    expect(markup).toContain('<option value="Jakarta"></option>');
    expect(markup).not.toContain("Surabaya");
  });
});
