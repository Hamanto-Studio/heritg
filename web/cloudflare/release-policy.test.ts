// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

const run = (identifier: string) => execFileSync(process.execPath, ["../.agents/skills/release-heritg-web/scripts/release-preflight.mjs", identifier, "--ci", "--dry-run"], { encoding: "utf8", stdio: "pipe" });
describe("Cloudflare versioned release metadata", () => {
  it.each(["", "release/web/", "web-"])("accepts synchronized metadata with identifier prefix %s", prefix => {
    expect(run(prefix + packageJson.version)).toContain("Release preflight passed");
  });
  it.each(["v0.8.1", "release/web/v0.8.1", "web-v0.8.1", "0.8.2"])("rejects invalid or unprepared identifier %s", identifier => {
    expect(() => run(identifier)).toThrow();
  });
});
