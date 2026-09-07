import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { FamilyViewControls } from "./FamilyViewControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps options collapsed by default and dismisses them with Escape or canvas interaction", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<FamilyViewControls label="Tree view" mode="Focused family" shortMode="Focus" personName="Example">
    <button data-view-option type="button">Full tree</button>
  </FamilyViewControls>));
  const trigger = container.querySelector<HTMLButtonElement>('.family-view-summary')!;
  expect(trigger.textContent).toBe("Focus");
  expect(trigger.getAttribute('aria-label')).toBe('Tree view: Focused family · Example');
  expect(container.querySelector('.family-view-options')).toBeNull();
  await act(async () => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.family-view-options')?.textContent).toBe('Full tree');
  await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('.family-view-options')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(container.querySelector('.family-view-options')).toBeNull();
  await act(async () => trigger.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[data-view-option]')!.click());
  expect(container.querySelector('.family-view-options')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async () => root.unmount());
  container.remove();
});
