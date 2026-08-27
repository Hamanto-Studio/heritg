import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "./i18n";
import { formatCountdown, formatRemainingDuration, ProSettings } from "./ProSettings";
import { unavailableProContext } from "./proTypes";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
});

describe("Family+ expiry formatting", () => {
  const now = Date.parse("2026-08-24T00:00:00Z");

  it("uses localized singular and plural month, week, and day units", () => {
    expect(formatRemainingDuration("2026-09-23T00:00:00Z", "en", now)).toBe("in 1 month");
    expect(formatRemainingDuration("2026-10-23T00:00:00Z", "en", now)).toBe("in 2 months");
    expect(formatRemainingDuration("2026-09-07T00:00:00Z", "en", now)).toBe("in 2 weeks");
    expect(formatRemainingDuration("2026-08-25T00:00:00Z", "en", now)).toBe("in 1 day");
    expect(formatRemainingDuration("2026-08-25T00:00:00Z", "id", now)).toBe("dalam 1 hari");
  });

  it("formats a staging countdown without going below zero", () => {
    expect(formatCountdown("2026-08-24T00:05:00Z", now)).toBe("00:05:00");
    expect(formatCountdown("2026-08-23T23:59:00Z", now)).toBe("00:00:00");
  });

  it("updates the staging countdown and refreshes once at zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const refreshSubscription = vi.fn(async () => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ProSettings
        deploymentEnvironment="staging"
        language="en"
        onOpenPaywall={() => undefined}
        pro={{
          ...unavailableProContext,
          configured: true,
          subscription: { status: "active", expiresAt: "2026-08-24T00:00:02Z" },
          refreshSubscription
        }}
        t={createTranslator("en")}
      />
    ));

    expect(container.textContent).toContain("00:00:02");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toContain("00:00:01");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(container.textContent).toContain("00:00:00");
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it("moves the Family+ requirement from the sync title into the enable action", async () => {
    const onOpenPaywall = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ProSettings
        language="en"
        onOpenPaywall={onOpenPaywall}
        pro={{
          ...unavailableProContext,
          configured: true,
          subscription: { status: "free" },
          sync: { enabled: false, phase: "subscriptionRequired", pendingChanges: 0 }
        }}
        t={createTranslator("en")}
      />
    ));

    expect(container.querySelector(".sync-status")).toBeNull();
    const enable = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Enable");
    expect(enable).toBeTruthy();
    await act(async () => enable?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onOpenPaywall).toHaveBeenCalledOnce();
  });

  it("keeps synchronization errors inside the synchronization content", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ProSettings
        language="en"
        onOpenPaywall={() => undefined}
        pro={{
          ...unavailableProContext,
          configured: true,
          subscription: { status: "active", expiresAt: "2026-09-24T00:00:00Z" },
          sync: {
            enabled: true,
            phase: "error",
            pendingChanges: 0,
            error: "Family synchronization could not be completed."
          }
        }}
        t={createTranslator("en")}
      />
    ));

    const error = container.querySelector(".pro-settings-sync .sync-error-message");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("Family synchronization could not be completed.");
    expect(container.querySelector(".pro-settings-card > .field-error")).toBeNull();
  });

  it("explains that checking access does not run synchronization and finishes loading", async () => {
    let finishRefresh: (() => void) | undefined;
    const refreshSubscription = vi.fn(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ProSettings
        language="en"
        onOpenPaywall={() => undefined}
        pro={{
          ...unavailableProContext,
          configured: true,
          subscription: { status: "active", expiresAt: "2026-09-24T00:00:00Z" },
          sync: { enabled: true, phase: "upToDate", pendingChanges: 0 },
          refreshSubscription
        }}
        t={createTranslator("en")}
      />
    ));

    expect(container.textContent).toContain("Check access expiry");
    expect(container.textContent).toContain("Family-tree synchronization runs automatically.");
    const refresh = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Check access expiry");
    await act(async () => refresh?.click());
    expect(refresh?.disabled).toBe(true);
    expect(refresh?.textContent).toContain("Checking access...");
    await act(async () => finishRefresh?.());
    expect(refresh?.disabled).toBe(false);
    expect(refresh?.textContent).toContain("Check access expiry");
  });
});
