import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Translator } from "./i18n";
import type { AppActions } from "./store";
import { TreeSidebar } from "./TreeSidebar";
import type { AppData } from "./types";

const data: AppData = {
  version: 1,
  trees: [],
  people: [],
  relationships: [],
  language: "en",
  viewports: {}
};

const t = ((key: string) => key) as Translator;
const actions = {} as AppActions;
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TreeSidebar file import", () => {
  it("uses an unrestricted native file input for iOS and iPadOS", () => {
    act(() => root.render(
      <TreeSidebar
        actions={actions}
        data={data}
        onClose={vi.fn()}
        onError={vi.fn()}
        onImported={vi.fn()}
        onShowHelp={vi.fn()}
        onShowPrivacy={vi.fn()}
        open
        t={t}
      />
    ));

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.hasAttribute("accept")).toBe(false);
    expect(input?.closest("label")?.classList.contains("import-file-control")).toBe(true);
  });
});
