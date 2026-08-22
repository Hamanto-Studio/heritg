import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const args = process.argv.slice(2);
const staging = args.includes("--staging");
const checkOnly = args.includes("--check");
const stagingHostname = "heritg-share-api-1079742937646.asia-southeast2.run.app";
const requestedOrigin = args.find((argument) => !argument.startsWith("--")) ??
  (staging ? process.env.HERITG_STAGING_API_ORIGIN : process.env.HERITG_API_ORIGIN);

if (!requestedOrigin) {
  throw new Error(staging
    ? "Pass HERITG_STAGING_API_ORIGIN or a staging Cloud Run origin."
    : "Pass the deployed Cloud Run origin: npm run vercel:configure -- https://SERVICE.run.app");
}

const origin = new URL(requestedOrigin);
if (origin.protocol !== "https:" || !origin.hostname.endsWith(".run.app") || origin.pathname !== "/") {
  throw new Error("HERITG_API_ORIGIN must be an HTTPS Cloud Run origin ending in .run.app with no path.");
}
if (staging && origin.hostname !== stagingHostname) {
  throw new Error("Staging configuration is restricted to the isolated heritg-be-stg Cloud Run service.");
}

const template = await readFile(new URL("../vercel.template.json", import.meta.url), "utf8");
const config = JSON.parse(template.replaceAll("__HERITG_API_ORIGIN__", origin.origin));
if (staging) {
  const globalHeaders = config.headers.find(({ source }) => source === "/(.*)");
  globalHeaders?.headers.push({
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive"
  });
}

const outputName = staging ? "vercel.staging.json" : "vercel.json";
if (!checkOnly) {
  await writeFile(new URL(`../${outputName}`, import.meta.url), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600
  });
}
process.stdout.write(
  `${checkOnly ? "Validated" : "Prepared"} web/${outputName} for ${origin.hostname}. ` +
  "No credentials were written.\n"
);
