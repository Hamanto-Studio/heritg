import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasConnections, directCanvasConnections } from "./CanvasConnections";
import { createTranslator } from "./i18n";
import type { FamilyRelationship, Person } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const people: Person[] = ["Child", "Parent", "Step-parent", "Guardian", "Sibling", "Spouse", "Unrelated"].map((id) => ({
  id, treeId: "t", displayName: id, gender: "unspecified", createdAt: "2026", birthDatePrecision: "year",
  notes: "", addressLine: "", city: "", province: "", country: "", postalCode: ""
}));
const relationships: FamilyRelationship[] = [
  ["Parent", "Child", "parent", "biologicalParent"], ["Step-parent", "Child", "parent", "stepParent"],
  ["Guardian", "Child", "parent", "guardian"], ["Parent", "Sibling", "parent", "biologicalParent"],
  ["Child", "Spouse", "partner", "spouse"], ["Child", "Spouse", "partner", "formerSpouse"]
].map(([from, to, kind, subtype], i) => ({ id: String(i), treeId: "t", createdAt: "2026", fromPersonId: from, toPersonId: to,
  kind: kind as FamilyRelationship["kind"], subtype: subtype as FamilyRelationship["subtype"] }));
let root: Root | undefined, container: HTMLDivElement;
const navigate = vi.fn();
async function mount(language: "en" | "id" = "en", selected = "Child") {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  function Fixture() {
    const [id, setId] = useState(selected);
    return <CanvasConnections people={people} relationships={relationships} selectedPersonId={id} language={language}
      onNavigate={(id) => { navigate(id); setId(id); }} t={createTranslator(language)} />;
  }
  await act(async () => root!.render(<Fixture />));
}
const click = async (selector: string) => act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; vi.clearAllMocks(); });

describe("Full tree connections guide", () => {
  it("shows only recorded relatives with every role, including gender-neutral and care labels", () => {
    const entries = directCanvasConnections(people, relationships, "Child", "en");
    expect(entries.map((entry) => entry.person.id)).toEqual(["Guardian", "Parent", "Step-parent", "Spouse"]);
    expect([...entries[2].labels]).toEqual(["Step-parent"]);
    expect([...entries[3].labels]).toEqual(["Spouse", "Former spouse"]);
    expect(directCanvasConnections(people, relationships, "Parent", "en").map((entry) => [...entry.labels])).toEqual([["Child"], ["Child"]]);
    expect(directCanvasConnections(people, relationships, "Child", "id").flatMap((entry) => [...entry.labels])).toContain("Orang tua tiri");
  });

  it("jumps to a relative, retains a bounded return trail, and focuses the new trigger", async () => {
    await mount();
    await click(".canvas-connections-trigger");
    const go = container.querySelector<HTMLButtonElement>('button[aria-label="Go to Parent · Parent"]')!;
    await act(async () => { go.focus(); go.click(); });
    expect(navigate).toHaveBeenLastCalledWith("Parent");
    expect(container.querySelector(".canvas-connections-panel")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".canvas-connections-trigger"));
    expect(container.querySelector(".canvas-connections-back")?.getAttribute("aria-label")).toBe("Back to Child");
    await click(".canvas-connections-back");
    expect(navigate).toHaveBeenLastCalledWith("Child");
    expect(container.querySelector(".canvas-connections-back")).toBeNull();
  });

  it("dismisses on Escape and outside interaction, with no global search", async () => {
    await mount(); await click(".canvas-connections-trigger");
    await act(async () => container.querySelector(".canvas-connections-trigger")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector(".canvas-connections-panel")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".canvas-connections-trigger"));
    await click(".canvas-connections-trigger");
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector(".canvas-connections-panel")).toBeNull();
    expect(container.querySelector("input, details")).toBeNull();
  });

  it("is absent without a selection and gives an honest empty state for an isolated person", async () => {
    await mount("id", "missing"); expect(container.textContent).toBe("");
    await act(async () => root!.render(<CanvasConnections people={people} relationships={relationships} selectedPersonId="Unrelated"
      language="id" onNavigate={navigate} t={createTranslator("id")} />));
    await click(".canvas-connections-trigger");
    expect(container.textContent).toContain("Belum ada hubungan");
  });
});
