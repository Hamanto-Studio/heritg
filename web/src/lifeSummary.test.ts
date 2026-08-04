import { describe, expect, it } from "vitest";

import { personLifeSummary } from "./lifeSummary";

describe("person life summary", () => {
  const now = new Date(2026, 7, 2);

  it("renders exact birth dates and calculates completed years", () => {
    expect(personLifeSummary({
      birthDate: "1990-08-01",
      birthDatePrecision: "exact"
    }, "en", now)).toBe("Born Aug 1, 1990 · age 36");
    expect(personLifeSummary({
      birthDate: "1990-08-03",
      birthDatePrecision: "exact"
    }, "id", now)).toBe("Lahir 3 Agu 1990 · usia 35");
  });

  it("keeps month and year precision appropriately coarse", () => {
    expect(personLifeSummary({
      birthDate: "1990-08-01",
      birthDatePrecision: "month"
    }, "id", now)).toBe("Lahir Agu 1990 · usia 36");
    expect(personLifeSummary({
      birthDate: "1990-01-01",
      birthDatePrecision: "year"
    }, "id", now)).toBe("Lahir 1990 · usia 36");
  });

  it("retains the compact deceased-person life-span format", () => {
    expect(personLifeSummary({
      birthDate: "1940-04-10",
      deathDate: "2020-04-09",
      birthDatePrecision: "exact"
    }, "en", now))
      .toBe("1940-2020 · age 79");
  });
});
