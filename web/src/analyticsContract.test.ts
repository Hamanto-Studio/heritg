import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("matches the frozen backend analytics-v1 contract", () => {
  const source = readFileSync("src/analyticsContract.ts");
  expect(createHash("sha256").update(source).digest("hex")).toBe("e78125278de287d2a539779063802dd94b64320359bff4bd4f49ddea25bacf17");
});
