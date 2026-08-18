import { describe, expect, it } from "vitest";

import { formatPersonName, PERSON_NAME_LINE_HEIGHT } from "./personName";

describe("person name formatting", () => {
  it("keeps short names on one centered line", () => {
    expect(formatPersonName("  Choirul   Agustina ")).toEqual({
      fullName: "Choirul Agustina",
      lines: ["Choirul Agustina"],
      text: "Choirul Agustina",
      extraHeight: 0
    });
  });

  it("balances long names across two lines without shrinking the font", () => {
    const formatted = formatPersonName("Novian Pratomo Edi Nugroho (Novan)");

    expect(formatted.lines).toEqual(["Novian Pratomo Edi", "Nugroho (Novan)"]);
    expect(formatted.text).toBe("Novian Pratomo Edi\nNugroho (Novan)");
    expect(formatted.extraHeight).toBe(PERSON_NAME_LINE_HEIGHT);
  });

  it("limits exceptionally long names to two lines", () => {
    const formatted = formatPersonName("A very long synthetic person name that continues well beyond the canvas label width");

    expect(formatted.lines).toHaveLength(2);
    expect(formatted.lines.every((line) => line.length <= 24)).toBe(true);
    expect(formatted.lines[1]).toMatch(/\.\.\.$/);
  });
});
