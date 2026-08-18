import { describe, expect, it } from "vitest";

import {
  bugReportUrl,
  createBugReportMessage,
  detectBrowser,
  detectDeviceModel,
  detectOperatingSystem,
  type BugReportEnvironment
} from "./bugReport";

const environment: BugReportEnvironment = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  browserLocale: "en-ID",
  timeZone: "Asia/Jakarta",
  screenWidth: 390,
  screenHeight: 844,
  viewportWidth: 390,
  viewportHeight: 760,
  pixelRatio: 3,
  online: true,
  standalone: true
};

describe("bug report diagnostics", () => {
  it("describes the actual browser environment without inventing an Apple model", () => {
    expect(detectDeviceModel(environment)).toBe("Apple iPhone (390x844 CSS px)");
    expect(detectOperatingSystem(environment)).toBe("iOS 26.5");
    expect(detectBrowser(environment.userAgent)).toBe("Mobile Safari 26.5");

    const message = createBugReportMessage({
      appLanguage: "en",
      appVersion: "1.3.4 (193)",
      peopleCount: 44,
      relationshipCount: 73,
      generatedAt: "2026-08-18T12:00:00.000Z"
    }, environment);

    expect(message).toContain("App: Heritg Web");
    expect(message).toContain("App Version: 1.3.4 (193)");
    expect(message).toContain("Subscription Level: Free (local-only Web)");
    expect(message).toContain("Locale: en-ID (App: English)");
    expect(message).toContain("Installation: Installed PWA");
    expect(message).toContain("Active Tree Records: 44 people, 73 relationships");
    expect(message).toContain("Please do not edit the automatically filled information");
  });

  it("uses an exposed Android model and creates channel-specific prefilled links", () => {
    const android = {
      ...environment,
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      screenWidth: 412,
      screenHeight: 915,
      standalone: false
    };
    expect(detectDeviceModel(android)).toBe("SM-S928B (412x915 CSS px)");
    expect(detectOperatingSystem(android)).toBe("Android 14");
    expect(detectBrowser(android.userAgent)).toBe("Google Chrome 126.0.0.0");

    const message = "Heritg bug report\nDevice: Android";
    expect(bugReportUrl("whatsapp", message)).toBe(
      `https://wa.me/6285188338123?text=${encodeURIComponent(message)}`
    );
    expect(bugReportUrl("telegram", message)).toBe(
      `https://t.me/robihamanto?text=${encodeURIComponent(message)}`
    );
  });
});
