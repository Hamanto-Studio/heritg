import { describe, expect, it } from "vitest";
import { familyCycleBlocks } from "./familyCycleBlocks";

const edges = (pairs: string[]) => pairs.map((pair) => ({ from: pair[0], to: pair[1] }));
const key = (block: ReturnType<typeof edges>) => block.map((edge) => [edge.from, edge.to].sort().join("")).sort().join(",");

describe("placement cycle blocks", () => {
  it("does not mistake trees, bridges or isolated people for loops", () => {
    expect(familyCycleBlocks([..."abcdef"], edges(["ab", "bc", "bd", "ef"]))).toEqual([]);
  });
  it("separates loops sharing an attachment without dropping their edges", () => {
    const records = edges(["ab", "bc", "ca", "cd", "de", "ef", "fc", "fg", "hi"]), before = JSON.stringify(records);
    expect(familyCycleBlocks([..."abcdefghi"], records).map(key).sort()).toEqual(["ab,ac,bc", "cd,cf,de,ef"]);
    expect(familyCycleBlocks([..."ihgfedcba"], [...records].reverse()).map(key).sort()).toEqual(["ab,ac,bc", "cd,cf,de,ef"]);
    expect(JSON.stringify(records)).toBe(before);
  });
  it("retains a complex block instead of pretending that its individual loops are independent", () => {
    const records = edges(["ab", "bc", "ca", "bd", "dc"]);
    expect(familyCycleBlocks([..."abcd"], records).map(key)).toEqual([key(records)]);
  });
});
