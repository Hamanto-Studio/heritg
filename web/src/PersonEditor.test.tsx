// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTranslator } from "./i18n";
import { PersonEditor } from "./PersonEditor";
import type { AppActions } from "./store";
import type { Person } from "./types";

const person: Person = {
  id: "child",
  treeId: "tree",
  displayName: "Child",
  gender: "unspecified",
  createdAt: "2026-08-18T00:00:00.000Z",
  birthOrderOverride: 2,
  birthDatePrecision: "exact",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: ""
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

describe("manual child order editing", () => {
  it("loads and saves a manually edited child order", async () => {
    const savePerson = vi.fn();
    await act(async () => {
      root?.render(
        <PersonEditor
          actions={{ savePerson } as unknown as AppActions}
          language="en"
          onClose={vi.fn()}
          onSaved={vi.fn()}
          people={[person]}
          person={person}
          relationships={[]}
          t={createTranslator("en")}
          treeId="tree"
        />
      );
    });

    const input = container?.querySelector<HTMLInputElement>('input[type="number"]');
    expect(container?.textContent).toContain("Current city / domicile");
    expect(input?.value).toBe("2");
    await act(async () => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "3");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container?.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });

    expect(savePerson).toHaveBeenCalledWith(
      "child",
      expect.objectContaining({ birthOrderOverride: 3 }),
      [],
      []
    );
  });
});
