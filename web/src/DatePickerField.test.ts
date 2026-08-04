import { describe, expect, it } from "vitest";

import { formatIsoDate, parseIsoDate } from "./DatePickerField";

describe("date picker ISO date helpers", () => {
  it("round-trips valid calendar dates without timezone shifts", () => {
    const date = parseIsoDate("1996-05-04");
    expect(date).toBeDefined();
    expect(formatIsoDate(date!)).toBe("1996-05-04");
  });

  it("rejects invalid or incomplete dates", () => {
    expect(parseIsoDate("2026-02-29")).toBeUndefined();
    expect(parseIsoDate("2026-2-9")).toBeUndefined();
    expect(parseIsoDate("not-a-date")).toBeUndefined();
  });
});
