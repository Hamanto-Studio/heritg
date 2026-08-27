import { describe, expect, it } from "vitest";

import { descendantFootprintShift } from "./familyBlockLayout";

describe("family block layout", () => {
  it("reserves an adjacent family's direct-child footprint", () => {
    expect(descendantFootprintShift({
      baseSeparation: 720,
      currentCenter: 720,
      currentChildBlockSizes: [1, 1],
      currentLeft: -120,
      familyGap: 200,
      previousCenter: 0,
      previousChildBlockSizes: [2, 2],
      previousRight: 130
    })).toBe(-450);
    expect(descendantFootprintShift({
      baseSeparation: 720,
      currentCenter: 720,
      currentChildBlockSizes: [2],
      currentLeft: -120,
      familyGap: 200,
      previousCenter: 0,
      previousChildBlockSizes: [2, 2],
      previousRight: 130
    })).toBeUndefined();
  });
});
