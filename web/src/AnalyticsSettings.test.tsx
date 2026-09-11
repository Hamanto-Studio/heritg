// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AnalyticsSettings } from "./AnalyticsSettings";
import { analytics } from "./analytics";
import { createTranslator } from "./i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); root = undefined; vi.restoreAllMocks(); });

async function render(language: "en" | "id" = "en") {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<AnalyticsSettings t={createTranslator(language)} language={language} />));
  return host;
}

it.each(["en", "id"] as const)("offers explicit opt-in and equally available withdrawal in %s", async language => {
  vi.spyOn(analytics, "status").mockReturnValue("off");
  const consent = vi.spyOn(analytics, "setConsent").mockImplementation(() => undefined);
  const host = await render(language);
  const choices = [...host.querySelectorAll<HTMLButtonElement>("button")];
  expect(choices).toHaveLength(2); expect(choices.every(choice => !choice.disabled)).toBe(true);
  expect(choices[0].getAttribute("aria-pressed")).toBe("true");
  expect(consent).not.toHaveBeenCalled();
  await act(async () => choices[1].click()); expect(consent).toHaveBeenLastCalledWith(true);
  await act(async () => choices[0].click()); expect(consent).toHaveBeenLastCalledWith(false);
  expect(host.querySelector("a")?.getAttribute("rel")).toBe("noreferrer");
  expect(host.textContent).toContain("30");
});

it.each(["unavailable", "browser_blocked"] as const)("explains %s and disables opt-in without hiding the off control", async status => {
  vi.spyOn(analytics, "status").mockReturnValue(status);
  const host = await render();
  const choices = [...host.querySelectorAll<HTMLButtonElement>("button")];
  expect(choices[0].disabled).toBe(false); expect(choices[1].disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain(status === "unavailable" ? "not enabled" : "privacy preference");
});
