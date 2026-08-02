import { describe, expect, it } from "vitest";

import { personLifeSummary } from "./lifeSummary";

describe("person life summary", () => {
  const now = new Date(2026, 7, 2);

  it("matches the iOS living-person format and calculates completed years", () => {
    expect(personLifeSummary({ birthDate: "1990-08-01" }, "en", now))
      .toBe("Born 1990 · age 36");
    expect(personLifeSummary({ birthDate: "1990-08-03" }, "en", now))
      .toBe("Born 1990 · age 35");
  });

  it("matches the iOS deceased-person and Indonesian formats", () => {
    expect(personLifeSummary({ birthDate: "1940-04-10", deathDate: "2020-04-09" }, "en", now))
      .toBe("1940-2020 · age 79");
    expect(personLifeSummary({ birthDate: "1990-01-01" }, "id", now))
      .toBe("Lahir 1990 · usia 36");
  });
});
