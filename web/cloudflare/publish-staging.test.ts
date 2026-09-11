// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as string[][], files: new Map<string, string>(), fail: "", failed: false }));
const previous = "e6b9f07a-8165-4870-abc4-8d091ae084de";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn((command: string, args: string[]) => {
  state.calls.push([command, ...args]);
  if (state.fail === "precheck" && state.calls.length === 1) throw new Error("unreachable");
  if (state.fail === "candidate" && args[0]?.includes("verify-cloudflare") && args[1]?.includes("candidate")) throw new Error("candidate failed");
  if (state.fail === "canonical" && args.includes("deploy") && args.some(arg => arg.endsWith("canonical.jsonc")) && !state.failed) {
    state.failed = true; throw new Error("publish failed");
  }
  if (args.includes("--json")) return JSON.stringify([
    { created_on: "2026-09-09T00:00:00Z", versions: [{ version_id: "34c33060-a3d1-4a81-8391-2e9c56ede548", percentage: 100 }] },
    { created_on: "2026-09-10T00:00:00Z", versions: [{ version_id: "e6b9f07a-8165-4870-abc4-8d091ae084de", percentage: 100 }] }
  ]);
  return "";
}) }));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(), openSync: vi.fn(() => 123), closeSync: vi.fn(), unlinkSync: vi.fn(),
  writeFileSync: vi.fn((path: string | number, value: string) => { if (typeof path === "string") state.files.set(path, value); }),
  readFileSync: vi.fn((path: string) => state.files.get(path) ?? JSON.stringify({ name: "heritg-staging-candidate", routes: [],
    vars: { APP_ORIGIN: "https://staging.heritg.us", DEPLOYMENT_ENV: "staging" }, workers_dev: true, preview_urls: false,
    assets: { directory: "/synthetic/assets" } }))
}));
const argv = process.argv;
beforeEach(() => {
  state.calls = []; state.files.clear(); state.fail = ""; state.failed = false;
  process.argv = ["node", "publish-cloudflare-staging.mjs"];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => { process.argv = argv; vi.restoreAllMocks(); });
// The orchestration is JavaScript; execute it with mocked process/filesystem
// boundaries so these tests can never contact or deploy to a cloud account.
const run = () => import("../scripts/publish-cloudflare-staging.mjs");

describe("Cloudflare staging release orchestration", () => {
  it("makes no authenticated checks or remote mutations during a dry run", async () => {
    process.argv.push("--dry-run"); await run();
    expect(state.calls).toHaveLength(2);
    expect(state.calls.every(call => call.includes("--dry-run"))).toBe(true);
    const config = JSON.parse([...state.files.entries()].find(([path]) => path.endsWith("canonical.jsonc"))![1]);
    expect(config.name).toBe("heritg-staging");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([{ pattern: "staging.heritg.us", custom_domain: true, zone_id: "3b1bc5f974095fa0b5dcf72f9998d82d" }]);
  });
  it("stops before any mutation when canonical readiness fails", async () => {
    state.fail = "precheck"; await expect(run()).rejects.toThrow("unreachable");
    expect(state.calls).toHaveLength(1);
  });
  it("never publishes a failed candidate to the canonical Worker", async () => {
    state.fail = "candidate"; await expect(run()).rejects.toThrow("candidate failed");
    expect(state.calls.some(call => call.includes("deploy"))).toBe(false);
    expect(state.calls.some(call => call.includes("rollback"))).toBe(false);
  });
  it("restores the most recent exact version after a failed canonical publish", async () => {
    state.fail = "canonical"; await expect(run()).rejects.toThrow("publish failed");
    expect(state.calls.find(call => call.includes("rollback"))).toContain(previous);
    expect(state.calls.at(-1)?.at(-1)).toBe("https://staging.heritg.us");
  });
  it("verifies both origins and disables the candidate after success", async () => {
    await run();
    const checks = state.calls.filter(call => call[1]?.includes("verify-cloudflare"));
    expect(checks.map(call => call.at(-1))).toEqual(["https://staging.heritg.us", "https://heritg-staging-candidate.heritg.workers.dev", "https://staging.heritg.us"]);
    expect(state.calls.at(-1)).toContain("triggers");
    const candidate = JSON.parse([...state.files.entries()].find(([path]) => path.endsWith("candidate.jsonc"))![1]);
    expect(candidate.workers_dev).toBe(false);
  });
});
