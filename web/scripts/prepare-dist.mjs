#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");
const docsDirectory = resolve(repositoryRoot, "docs");
const publicDirectory = resolve(webDirectory, "public");
const outputDirectory = resolve(webDirectory, "dist");
const landingFiles = [
  "index.html",
  "site.css",
  "site.js",
  "tree.js",
  "appicon.png",
  "assets",
  "en",
  "id",
  "privacy"
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of landingFiles) {
  await cp(resolve(docsDirectory, file), resolve(outputDirectory, file), {
    recursive: true
  });
}

// Existing app components use root icon URLs. Keep those URLs working while
// the installable app and its service worker remain scoped to /app/.
for (const file of ["pwa-192.png", "pwa-512.png"]) {
  await cp(resolve(publicDirectory, file), resolve(outputDirectory, file));
}
