// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The GitHub Pages landing site (family.heritg.us) is the indexed site; the app
// at heritg.us stays noindex. These checks keep its search metadata coherent.
const docs = new URL("../../docs/", import.meta.url);
const site = "https://family.heritg.us";
const read = (path) => readFileSync(new URL(path, docs));
const page = (url) => read(`${url.slice(site.length + 1)}index.html`).toString();
const attr = (html, pattern) => html.match(pattern)?.[1];
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const sitemap = read("sitemap.xml").toString();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
const alternates = (html) => Object.fromEntries(
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(([, lang, href]) => [lang, href])
);

describe("landing site search metadata", () => {
  it("lists only canonical, indexable pages in the sitemap", () => {
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const url of urls) {
      const html = page(url);
      expect(attr(html, /<link rel="canonical" href="([^"]+)">/), url).toBe(url);
      expect(html, url).not.toMatch(/name="robots" content="[^"]*noindex/);
    }
    expect(read("robots.txt").toString()).toContain(`Sitemap: ${site}/sitemap.xml`);
  });

  it("gives every page a unique title, description and complete share tags", () => {
    const pages = [`${site}/`, ...urls].map((url) => ({ url, html: page(url) }));
    const titles = pages.map(({ html }) => attr(html, /<title>([^<]+)<\/title>/));
    const descriptions = pages.map(({ html }) => attr(html, /<meta name="description" content="([^"]+)">/));
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
    for (const { url, html } of pages) {
      expect(attr(html, /<meta property="og:url" content="([^"]+)">/), url).toBe(url);
      expect(attr(html, /<meta property="og:image" content="([^"]+)">/), url).toBe(`${site}/og-image.png`);
      expect(attr(html, /<meta name="twitter:card" content="([^"]+)">/), url).toBe("summary_large_image");
      expect(html, url).toContain('<link rel="icon" href="/favicon.ico" sizes="any">');
      expect(html, url).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    }
  });

  it("keeps hreflang alternates reciprocal", () => {
    for (const url of urls) {
      for (const [lang, href] of Object.entries(alternates(page(url)))) {
        if (lang === "x-default") continue;
        expect(alternates(page(href)), `${href} links back to ${url}`).toEqual(alternates(page(url)));
      }
    }
  });

  it("mirrors the visible FAQ in FAQPage structured data", () => {
    for (const path of ["en/", "id/"]) {
      const html = page(`${site}/${path}`);
      const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
        .map(([, question, answer]) => [text(question), text(answer)]);
      const graph = JSON.parse(attr(html, /<script type="application\/ld\+json">([\s\S]+?)<\/script>/))["@graph"];
      const faq = graph.find((node) => node["@type"] === "FAQPage");
      expect(visible.length).toBeGreaterThan(0);
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible);
      expect(graph.map((node) => node["@type"])).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
    }
  });

  it("ships a noindex 404 page and correctly sized icons", () => {
    expect(read("404.html").toString()).toContain('<meta name="robots" content="noindex">');
    const png = (path) => { const data = read(path); return [data.readUInt32BE(16), data.readUInt32BE(20)]; };
    expect(png("og-image.png")).toEqual([1200, 630]);
    expect(png("apple-touch-icon.png")).toEqual([180, 180]);
    const ico = read("favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });
});
