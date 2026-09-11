#!/usr/bin/env node
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, chmodSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// One-time bootstrap only. Never rotate an in-use edge identity implicitly.
assert.equal(process.env.HERITG_EDGE_IDENTITY_CONFIRM, "production-heritg.us");
const variables = JSON.parse(execFileSync("gh", ["variable", "list", "--repo", "Hamanto-Studio/heritg-be", "--json", "name"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert(!variables.some(v => v.name === "PRODUCTION_EDGE_CLIENT_IP_PUBLIC_KEY"), "Edge identity already exists; use existing Worker secrets, not a new key");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const directory = mkdtempSync(join(tmpdir(), "heritg-edge-identity-"));
chmodSync(directory, 0o700);
const path = join(directory, "secrets.json");
try {
  writeFileSync(path, JSON.stringify({ EDGE_CLIENT_IP_PRIVATE_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url") }), { mode: 0o600, flag: "wx" });
  execFileSync("gh", ["variable", "set", "PRODUCTION_EDGE_CLIENT_IP_PUBLIC_KEY", "--repo", "Hamanto-Studio/heritg-be"], {
    input: publicKey.export({ format: "der", type: "spki" }).toString("base64url"), stdio: ["pipe", "pipe", "pipe"]
  });
  console.log(`Public verification key configured. Private key remains only in protected temporary file: ${path}`);
  console.log("Use that file for candidate and canonical initial Worker uploads, then remove this exact file and empty directory.");
} catch {
  unlinkSync(path); rmdirSync(directory);
  throw new Error("Edge identity preparation failed; no credential details printed. Inspect the public variable before retrying.");
}
