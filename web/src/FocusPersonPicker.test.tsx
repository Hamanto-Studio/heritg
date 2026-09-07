import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusPersonPicker } from "./FocusPersonPicker";
import { createTranslator } from "./i18n";
import type { Person } from "./types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const people = ["Alice", "Bob"].map((displayName): Person => ({
  id: displayName, displayName, treeId: "tree", gender: "unspecified", createdAt: "2026-01-01",
  birthDatePrecision: "year", notes: "", city: "", addressLine: "", province: "", country: "", postalCode: ""
}));
afterEach(() => document.body.replaceChildren());

describe("FocusPersonPicker", () => {
  it("searches names, selects a person, and restores keyboard focus", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const onSelect = vi.fn();
    await act(async () => root.render(<FocusPersonPicker people={people} personId="Alice" onSelect={onSelect} t={createTranslator("en")} />));
    const trigger = container.querySelector<HTMLButtonElement>('.focus-person-trigger')!;
    await act(async () => trigger.click());
    const input = container.querySelector<HTMLInputElement>('input')!;
    expect(document.activeElement).toBe(input);
    const search = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await search("missing");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("No matching people");
    await search("  bOB ");
    expect(container.querySelectorAll('.focus-person-option')).toHaveLength(1);
    await act(async () => container.querySelector<HTMLButtonElement>('.focus-person-option')!.click());
    expect(onSelect).toHaveBeenCalledWith("Bob");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => root.unmount());
  });

  it("dismisses with Escape and outside pointer interaction without changing the person", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const onSelect = vi.fn();
    await act(async () => root.render(<FocusPersonPicker people={people} personId="Alice" onSelect={onSelect} t={createTranslator("en")} />));
    const trigger = container.querySelector<HTMLButtonElement>('.focus-person-trigger')!;
    await act(async () => trigger.click());
    await act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
