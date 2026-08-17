import { describe, expect, it } from "vitest";

import { personAvatarAppearance } from "./personAvatarAppearance";

describe("person avatar appearance", () => {
  it("uses distinct fill and border colors for every gender", () => {
    const appearances = [
      personAvatarAppearance("female"),
      personAvatarAppearance("male"),
      personAvatarAppearance("unspecified")
    ];

    expect(new Set(appearances.map(({ fill }) => fill)).size).toBe(3);
    expect(new Set(appearances.map(({ stroke }) => stroke)).size).toBe(3);
  });
});
