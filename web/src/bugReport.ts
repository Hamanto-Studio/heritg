import type { AppData } from "./types";

export type BugReportChannel = "telegram" | "whatsapp";

export interface BugReportEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  browserLocale: string;
  timeZone: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  online: boolean;
  standalone: boolean;
}

export interface BugReportContext {
  appLanguage: AppData["language"];
  appVersion: string;
  peopleCount: number;
  relationshipCount: number;
  generatedAt?: string;
}

const normalizedVersion = (value: string) => value.replaceAll("_", ".");

export const detectDeviceModel = (environment: BugReportEnvironment) => {
  const { userAgent } = environment;
  const ipad = /iPad/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && environment.maxTouchPoints > 1);
  const dimensions = `${environment.screenWidth}x${environment.screenHeight} CSS px`;
  if (ipad) return `Apple iPad (${dimensions})`;
  if (/iPhone|iPod/i.test(userAgent)) return `Apple iPhone (${dimensions})`;
  const androidModel = userAgent.match(
    /Android [^;\n)]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/i
  )?.[1]?.trim();
  if (/Android/i.test(userAgent)) {
    return androidModel && androidModel !== "K"
      ? `${androidModel} (${dimensions})`
      : `Android device (${dimensions})`;
  }
  if (/Windows/i.test(userAgent)) return `Windows PC (${dimensions})`;
  if (/CrOS/i.test(userAgent)) return `Chromebook (${dimensions})`;
  if (/Macintosh|Mac OS X/i.test(userAgent)) return `Apple Mac (${dimensions})`;
  if (/Linux/i.test(userAgent)) return `Linux device (${dimensions})`;
  return `${environment.platform || "Unknown device"} (${dimensions})`;
};

export const detectOperatingSystem = (environment: BugReportEnvironment) => {
  const { userAgent } = environment;
  const iosVersion = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/i)?.[1];
  if (iosVersion) return `iOS ${normalizedVersion(iosVersion)}`;
  if (/iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && environment.maxTouchPoints > 1)) {
    const safariVersion = userAgent.match(/Version\/([\d.]+)/i)?.[1];
    return safariVersion ? `iPadOS/iOS ${safariVersion}` : "iPadOS/iOS";
  }
  const androidVersion = userAgent.match(/Android ([\d.]+)/i)?.[1];
  if (androidVersion) return `Android ${androidVersion}`;
  const windowsVersion = userAgent.match(/Windows NT ([\d.]+)/i)?.[1];
  if (windowsVersion) {
    const names: Record<string, string> = {
      "10.0": "Windows 10/11",
      "6.3": "Windows 8.1",
      "6.2": "Windows 8",
      "6.1": "Windows 7"
    };
    return names[windowsVersion] ?? `Windows NT ${windowsVersion}`;
  }
  const chromeOsVersion = userAgent.match(/CrOS [^ ]+ ([\d.]+)/i)?.[1];
  if (chromeOsVersion) return `ChromeOS ${chromeOsVersion}`;
  const macVersion = userAgent.match(/Mac OS X ([\d_]+)/i)?.[1];
  if (macVersion) return `macOS ${normalizedVersion(macVersion)}`;
  if (/Linux/i.test(userAgent)) return "Linux";
  return environment.platform || "Unknown";
};

export const detectBrowser = (userAgent: string) => {
  const candidates: Array<[RegExp, string]> = [
    [/EdgiOS\/([\d.]+)/i, "Microsoft Edge"],
    [/EdgA?\/([\d.]+)/i, "Microsoft Edge"],
    [/CriOS\/([\d.]+)/i, "Google Chrome"],
    [/Chrome\/([\d.]+)/i, "Google Chrome"],
    [/FxiOS\/([\d.]+)/i, "Mozilla Firefox"],
    [/Firefox\/([\d.]+)/i, "Mozilla Firefox"],
    [/Version\/([\d.]+).*Safari/i, /Mobile/i.test(userAgent) ? "Mobile Safari" : "Safari"]
  ];
  for (const [pattern, name] of candidates) {
    const version = userAgent.match(pattern)?.[1];
    if (version) return `${name} ${version}`;
  }
  return "Unknown browser";
};

export const browserBugReportEnvironment = (): BugReportEnvironment => {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    browserLocale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    standalone: Boolean(
      standaloneNavigator.standalone ||
      (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
    )
  };
};

export function createBugReportMessage(
  context: BugReportContext,
  environment: BugReportEnvironment = browserBugReportEnvironment()
) {
  const appLanguage = context.appLanguage === "id" ? "Bahasa Indonesia" : "English";
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  return [
    "Hello, I found a bug in Heritg Web.",
    "",
    "What happened:",
    "[Please describe the problem]",
    "",
    "Steps to reproduce:",
    "1. ",
    "2. ",
    "3. ",
    "",
    "Expected result:",
    "[Please describe what you expected]",
    "",
    "------------------------------",
    "Automatic Device Information Collection for Enhanced Support:",
    "",
    "App: Heritg Web",
    `Device Model: ${detectDeviceModel(environment)}`,
    `Operating System: ${detectOperatingSystem(environment)}`,
    `Browser: ${detectBrowser(environment.userAgent)}`,
    `App Version: ${context.appVersion}`,
    `Subscription Level: Free (local-only Web)`,
    `Locale: ${environment.browserLocale} (App: ${appLanguage})`,
    `Time Zone: ${environment.timeZone}`,
    `Display: ${environment.screenWidth}x${environment.screenHeight} CSS px @ ${environment.pixelRatio}x`,
    `Viewport: ${environment.viewportWidth}x${environment.viewportHeight} CSS px`,
    `Installation: ${environment.standalone ? "Installed PWA" : "Browser tab"}`,
    `Renderer: ${__EXCALIDRAW_FALLBACK__ ? "Excalidraw fallback" : "SVG"}`,
    `Connectivity: ${environment.online ? "Online" : "Offline"}`,
    `Active Tree Records: ${context.peopleCount} people, ${context.relationshipCount} relationships`,
    `Generated: ${generatedAt}`,
    `User Agent: ${environment.userAgent}`,
    "",
    "Please do not edit the automatically filled information to ensure we can assist you effectively. Thank you for your understanding and cooperation.",
    "------------------------------"
  ].join("\n");
}

export const bugReportUrl = (channel: BugReportChannel, message: string) => {
  const text = encodeURIComponent(message);
  return channel === "whatsapp"
    ? `https://wa.me/6285188338123?text=${text}`
    : `https://t.me/robihamanto?text=${text}`;
};
