import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const requestedOrigin = process.argv[2] ?? process.env.HERITG_API_ORIGIN;

if (!requestedOrigin) {
  throw new Error("Pass the deployed Cloud Run origin: npm run vercel:configure -- https://SERVICE.run.app");
}

const origin = new URL(requestedOrigin);
if (origin.protocol !== "https:" || !origin.hostname.endsWith(".run.app") || origin.pathname !== "/") {
  throw new Error("HERITG_API_ORIGIN must be an HTTPS Cloud Run origin ending in .run.app with no path.");
}

const template = await readFile(new URL("../vercel.template.json", import.meta.url), "utf8");
const rendered = template.replaceAll("__HERITG_API_ORIGIN__", origin.origin);
JSON.parse(rendered);
await writeFile(new URL("../vercel.json", import.meta.url), `${rendered.trim()}\n`, { mode: 0o600 });
process.stdout.write(`Prepared web/vercel.json for ${origin.hostname}. No credentials were written.\n`);
