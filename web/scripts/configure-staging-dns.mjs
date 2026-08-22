#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const STAGING_DNS = {
  zone: "heritg.us",
  name: "staging.heritg.us",
  type: "CNAME",
  content: "230a33e05f285987.vercel-dns-017.com",
  proxied: false,
  ttl: 1
};

export const LEGACY_BETA_DNS = {
  ...STAGING_DNS,
  name: "beta.heritg.us"
};

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const KEYCHAIN_SERVICE = "heritg-cloudflare-api";

const normalizedHost = (value) => value.replace(/\.$/u, "").toLowerCase();
const isExactRecord = (record, expected) => record.type === expected.type &&
  normalizedHost(record.content) === normalizedHost(expected.content) &&
  record.proxied === false;

const apiRequest = async (fetchImpl, token, path, options = {}) => {
  const response = await fetchImpl(`${CLOUDFLARE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const message = body.errors?.map(({ message: value }) => value).join("; ") ||
      `Cloudflare API returned ${response.status}`;
    throw new Error(message);
  }
  return body.result;
};

const activeZoneId = async (token, fetchImpl) => {
  const zones = await apiRequest(
    fetchImpl,
    token,
    `/zones?name=${encodeURIComponent(STAGING_DNS.zone)}&status=active`
  );
  if (zones.length !== 1) {
    throw new Error(`Expected one active Cloudflare zone for ${STAGING_DNS.zone}; found ${zones.length}.`);
  }
  return zones[0].id;
};

const recordsFor = (zoneId, name, token, fetchImpl) => apiRequest(
  fetchImpl,
  token,
  `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`
);

export async function configureStagingDns(token, fetchImpl = fetch) {
  const zoneId = await activeZoneId(token, fetchImpl);
  const records = await recordsFor(zoneId, STAGING_DNS.name, token, fetchImpl);
  if (records.length > 0) {
    if (records.length !== 1 || !isExactRecord(records[0], STAGING_DNS)) {
      throw new Error(
        `${STAGING_DNS.name} already has a conflicting DNS record; refusing to replace it.`
      );
    }
    return { action: "unchanged", record: records[0] };
  }

  const record = await apiRequest(fetchImpl, token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      name: STAGING_DNS.name,
      type: STAGING_DNS.type,
      content: STAGING_DNS.content,
      proxied: STAGING_DNS.proxied,
      ttl: STAGING_DNS.ttl,
      comment: "HERITG isolated Web staging"
    })
  });
  return { action: "created", record };
}

export async function removeLegacyBetaDns(token, fetchImpl = fetch) {
  const zoneId = await activeZoneId(token, fetchImpl);
  const records = await recordsFor(zoneId, LEGACY_BETA_DNS.name, token, fetchImpl);
  if (records.length === 0) return { action: "absent" };
  if (records.length !== 1 || !isExactRecord(records[0], LEGACY_BETA_DNS)) {
    throw new Error(
      `${LEGACY_BETA_DNS.name} does not match the expected legacy staging record; refusing to remove it.`
    );
  }
  await apiRequest(fetchImpl, token, `/zones/${zoneId}/dns_records/${records[0].id}`, {
    method: "DELETE"
  });
  return { action: "removed", record: records[0] };
}

const keychainToken = () => {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    return execFileSync("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-w"
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error(
      "No Cloudflare token found. Follow the secure Keychain command in docs/DEPLOYMENT.md."
    );
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const removeBeta = process.argv.includes("--remove-beta");
  Promise.resolve()
    .then(async () => {
      const token = keychainToken();
      const stagingResult = await configureStagingDns(token);
      const betaResult = removeBeta ? await removeLegacyBetaDns(token) : undefined;
      return { stagingResult, betaResult };
    })
    .then(({ stagingResult, betaResult }) => {
      process.stdout.write(
        `${STAGING_DNS.name} ${stagingResult.action === "created" ? "created" : "already configured"} as ` +
        `${STAGING_DNS.type} ${STAGING_DNS.content} with DNS-only proxy mode.\n`
      );
      if (betaResult) {
        process.stdout.write(
          `${LEGACY_BETA_DNS.name} ${betaResult.action === "removed" ? "removed" : "already absent"}.\n`
        );
      }
    })
    .catch((error) => {
      process.stderr.write(`heritg-staging-dns: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
