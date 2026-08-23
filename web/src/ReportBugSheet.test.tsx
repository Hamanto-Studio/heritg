import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BugReportEnvironment } from "./bugReport";
import { createTranslator } from "./i18n";
import { ReportBugSheet } from "./ReportBugSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const environment: BugReportEnvironment = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  browserLocale: "id-ID",
  timeZone: "Asia/Jakarta",
  screenWidth: 390,
  screenHeight: 844,
  viewportWidth: 390,
  viewportHeight: 760,
  pixelRatio: 3,
  online: true,
  standalone: true
};

describe("ReportBugSheet", () => {
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

  it("offers WhatsApp and Telegram with the same condition-based report", () => {
    act(() => root.render(
      <ReportBugSheet
        environment={environment}
        language="id"
        onClose={() => undefined}
        peopleCount={44}
        relationshipCount={73}
        t={createTranslator("en")}
      />
    ));

    const sheet = container.querySelector(".bottom-sheet-card");
    const whatsapp = container.querySelector<HTMLAnchorElement>('[data-report-channel="whatsapp"]')!;
    const telegram = container.querySelector<HTMLAnchorElement>('[data-report-channel="telegram"]')!;
    const whatsappUrl = new URL(whatsapp.href);
    const telegramUrl = new URL(telegram.href);
    const whatsappMessage = whatsappUrl.searchParams.get("text");
    const telegramMessage = telegramUrl.searchParams.get("text");

    expect(sheet).not.toBeNull();
    expect(whatsappUrl.hostname).toBe("wa.me");
    expect(whatsappUrl.pathname).toBe("/6285188338123");
    expect(telegramUrl.hostname).toBe("t.me");
    expect(telegramUrl.pathname).toBe("/robihamanto");
    expect(telegramMessage).toBe(whatsappMessage);
    expect(whatsappMessage).toContain("Device Model: Apple iPhone (390x844 CSS px)");
    expect(whatsappMessage).toContain(`App Version: ${__APP_VERSION__}`);
    expect(whatsappMessage).toContain(`Build Version: ${__BUILD_VERSION__}`);
    expect(whatsappMessage).toContain("Locale: id-ID (App: Bahasa Indonesia)");
    expect(whatsappMessage).toContain("Active Tree Records: 44 people, 73 relationships");
    expect(container.querySelector("pre")?.textContent).toBe(whatsappMessage);
  });
});
