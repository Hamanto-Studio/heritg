// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTranslator } from "./i18n";
import { RelationshipDialog } from "./RelationshipDialog";
import type { FamilyRelationship, Person } from "./types";

const person = (id: string, displayName: string): Person => ({
  id,
  treeId: "tree-a",
  displayName,
  gender: "unspecified",
  birthDatePrecision: "exact",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: "",
  notes: "",
  createdAt: "2026-08-09T00:00:00.000Z"
});

const relationship: FamilyRelationship = {
  id: "marriage-a",
  treeId: "tree-a",
  fromPersonId: "target",
  toPersonId: "relative",
  kind: "partner",
  subtype: "spouse",
  marriageDate: "2016-10-16",
  createdAt: "2026-08-09T00:00:00.000Z"
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
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

describe("relationship date editing", () => {
  it("places marriage details before roles and can open the date picker directly", async () => {
    await act(async () => {
      root?.render(
        <RelationshipDialog
          focusMarriageDate
          language="en"
          onClose={vi.fn()}
          onSave={vi.fn()}
          people={[]}
          relationship={relationship}
          relative={person("relative", "Relative")}
          t={createTranslator("en")}
          target={person("target", "Target")}
        />
      );
    });

    const dates = container?.querySelector(".relationship-date-fields");
    const roles = container?.querySelector(".relationship-role-groups");
    expect(dates).toBeTruthy();
    expect(roles).toBeTruthy();
    expect(Boolean(
      dates && roles &&
      (dates.compareDocumentPosition(roles) & Node.DOCUMENT_POSITION_FOLLOWING)
    )).toBe(true);
    expect(container?.querySelector(".date-picker-popover")).toBeTruthy();
  });
});
