import { describe, expect, it } from "vitest";

import { renderCommand } from "./heritg-context.mjs";

const context = {
  generatedAt: "2026-08-17T00:00:00.000Z",
  activeTree: { id: "tree-1", title: "Test family" },
  selectedPersonId: "person-2",
  selectedPerson: null,
  counts: { people: 2, relationships: 1 },
  people: [
    { id: "person-1", displayName: "Parent Name", gender: "female" },
    { id: "person-2", displayName: "Child Name", gender: "male" }
  ],
  relationships: [
    {
      id: "relationship-1",
      fromPersonId: "person-1",
      toPersonId: "person-2",
      fromPersonName: "Parent Name",
      toPersonName: "Child Name",
      kind: "parent",
      subtype: "biologicalParent"
    }
  ]
};

const deepFreeze = (value) => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
};

describe("heritg-context CLI", () => {
  it("summarizes the active family and resolves a legacy selected-person snapshot", () => {
    const output = renderCommand(context, { command: "summary", json: false });

    expect(output).toContain("Active family: Test family (tree-1)");
    expect(output).toContain("Selected person: Child Name (person-2)");
    expect(output).toContain("Relationships: 1 (parent: 1)");
  });

  it("filters relationships by an unambiguous partial person name", () => {
    const output = renderCommand(context, {
      command: "relationships",
      json: true,
      person: "child"
    });

    expect(JSON.parse(output)).toEqual(context.relationships);
  });

  it("rejects unknown commands", () => {
    expect(() => renderCommand(context, { command: "unknown", json: false }))
      .toThrow("Unknown command: unknown");
  });

  it("does not mutate context for any command", () => {
    const frozenContext = deepFreeze(structuredClone(context));
    const before = JSON.stringify(frozenContext);

    renderCommand(frozenContext, { command: "summary", json: true });
    renderCommand(frozenContext, { command: "context", json: false });
    renderCommand(frozenContext, { command: "people", json: true });
    renderCommand(frozenContext, { command: "relationships", json: true, person: "selected" });
    renderCommand(frozenContext, { command: "selected", json: true });

    expect(JSON.stringify(frozenContext)).toBe(before);
  });
});
