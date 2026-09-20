import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const parseLanding = (language: string) => {
  const url = pathToFileURL(resolve(process.cwd(), "../docs", language, "index.html"));
  const html = readFileSync(url, "utf8");
  return { url, html, page: new DOMParser().parseFromString(html, "text/html") };
};

describe.each(["en", "id"])("%s landing product contract", (language) => {
  it("describes the current Web features, not native feature parity", () => {
    const { page } = parseLanding(language);
    const capabilities = page.querySelector("#capabilities")!;
    expect(capabilities.textContent).toContain("Heritg Web");
    expect(capabilities.textContent).toContain("Bahasa Melayu (Malaysia)");
    for (const feature of language === "en" ? ["Full", "Focus", "Fan"] : ["Lengkap", "Fokus", "Kipas"]) {
      expect(capabilities.textContent).toContain(feature);
    }
    for (const format of ["GEDCOM", "PNG", "PDF", "SVG", ".heritg"]) expect(capabilities.textContent).toContain(format);
    expect(page.querySelector(".price-free")!.textContent).toContain("PDF");
  });

  it("shows the three full one-time prices and removes the obsolete free-month offer", () => {
    const { page } = parseLanding(language);
    expect(Array.from(page.querySelectorAll(".family-price-list dd"), item => item.textContent))
      .toEqual(["Rp49.000", "Rp79.000", "Rp199.000"]);
    const pricing = page.querySelector("#pricing")!.textContent!;
    expect(pricing).not.toMatch(/one free month|one calendar month|klaim|gratis satu bulan/i);
    expect(pricing).toContain("DOKU");
    expect(pricing).toContain(language === "en" ? "no automatic charges" : "tanpa tagihan otomatis");
    expect(pricing).toContain("Google");
    expect(page.querySelectorAll("#pricing a[href='https://heritg.us/']")).toHaveLength(2);
  });

  it("offers a real App Store listing and an honest non-interactive Play status", () => {
    const { page, html } = parseLanding(language);
    const apple = page.querySelector<HTMLAnchorElement>(".download-apple")!;
    expect(apple.href).toBe("https://apps.apple.com/app/id6796645792");
    expect(apple.rel).toContain("noopener");
    expect(apple.textContent).toContain("App Store");
    expect(apple.querySelector("img")!.getAttribute("src")).toBe("../assets/platform-apple.svg");
    const play = page.querySelector(".download-unavailable")!;
    expect(play.matches("a, button, [role='button'], [tabindex]")).toBe(false);
    expect(play.textContent).toContain(language === "en" ? "Coming soon" : "Segera hadir");
    expect(play.querySelector("img")!.getAttribute("src")).toBe("../assets/platform-google-play.svg");
    expect(page.querySelector(".download-web")!.getAttribute("href")).toBe("https://heritg.us/");
    expect(page.querySelector(".download-web img")!.getAttribute("src")).toBe("../assets/platform-web.svg");
    expect(page.querySelectorAll(".platform-icon")).toHaveLength(3);
    expect(html).not.toMatch(/ente\.com|href="https:\/\/apps\.apple\.com\/"|href="https:\/\/play\.google\.com\/store"/);
  });

  it("keeps local navigation and asset paths valid in both languages", () => {
    const { page, url } = parseLanding(language);
    const ids = Array.from(page.querySelectorAll("[id]"), element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of page.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(page.getElementById(link.getAttribute("href")!.slice(1))).not.toBeNull();
    }
    for (const asset of page.querySelectorAll("img[src], script[src], link[rel='stylesheet']")) {
      const source = asset.getAttribute("src") ?? asset.getAttribute("href")!;
      if (/^https?:/.test(source)) continue;
      expect(existsSync(new URL(source.split("?")[0], url)), source).toBe(true);
    }
  });

  it("does not treat external navigation as an empty local selector", () => {
    const { page } = parseLanding(language);
    const errors: unknown[] = [];
    const location = new URL(`https://family.heritg.us/${language}/`);
    const script = readFileSync(resolve(process.cwd(), "../docs/site.js"), "utf8");
    runInNewContext(script, {
      document: page, location,
      fetch: () => Promise.resolve({ ok: false }),
      localStorage: { setItem: () => undefined },
      requestAnimationFrame: (callback: () => void) => {
        try { callback(); } catch (error) { errors.push(error); }
      },
      matchMedia: () => ({ matches: true })
    });
    // A detached document does not navigate or make requests when clicked.
    const external = page.querySelector<HTMLAnchorElement>('#site-nav a[href^="https:"]')!;
    expect(external.hash).toBe("");
    expect(() => external.click()).not.toThrow();
    expect(errors).toEqual([]);
  });
});
