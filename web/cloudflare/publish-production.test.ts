// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const state = vi.hoisted(() => ({ calls: [] as string[][], files: new Map<string, string>(), dirty: false, failCandidate: false, failPublish: false, failed: false }));
const commit = "a".repeat(40);
const previous = "e6b9f07a-8165-4870-abc4-8d091ae084de";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn((command: string, args: string[]) => {
  state.calls.push([command, ...args]);
  if (command === "git") return args.includes("status") ? (state.dirty ? " M source" : "") : "a".repeat(40);
  if (state.failCandidate && args[1]?.includes("candidate.heritg.workers.dev")) throw new Error("candidate failed");
  if (state.failPublish && !state.failed && args.includes("deploy") && args.some(a => a.endsWith("canonical.jsonc"))) { state.failed = true; throw new Error("publish failed"); }
  if (args.includes("--json")) return JSON.stringify([{ created_on: "2026-09-11", versions: [{ version_id: "e6b9f07a-8165-4870-abc4-8d091ae084de", percentage: 100 }] }]);
  return "";
}) }));
vi.mock("node:fs", () => ({
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn((path: string, value: string) => { state.files.set(path, value); }),
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith("candidate-evidence.json")) return state.files.get("evidence");
    if (path.endsWith("wrangler.jsonc")) return JSON.stringify({ main: "worker.ts", env: { production: {
      name: "heritg", vars: { APP_ORIGIN: "https://heritg.us", API_ORIGIN: "https://heritg-share-api-ulvjjfvqpq-et.a.run.app", DEPLOYMENT_ENV: "production" }, assets: {}, routes: []
    } } });
    return state.files.get(path);
  })
}));
const argv = process.argv;
const originalEnv = { ...process.env };
beforeEach(() => {
  state.calls = []; state.files.clear(); state.dirty = false; state.failCandidate = false; state.failPublish = false; state.failed = false;
  state.files.set("evidence", JSON.stringify({ commit, assets: createHash("sha256").digest("hex"), verified: true }));
  process.argv = ["node", "publish-cloudflare-production.mjs", "publish"];
  delete process.env.HERITG_INITIAL_CUTOVER_CONFIRM;
  delete process.env.HERITG_EDGE_SECRETS_FILE;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "x-heritg-hosting": "cloudflare-production" } })));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => { process.argv = argv; process.env = { ...originalEnv }; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const run = () => import("../scripts/publish-cloudflare-production.mjs");

describe("production publication safety", () => {
  it("rejects dirty releases before cloud mutation", async () => {
    state.dirty = true; await expect(run()).rejects.toThrow("Commit and review");
    expect(state.calls.every(call => call[0] === "git")).toBe(true);
  });
  it("does not publish a candidate that no longer passes", async () => {
    state.failCandidate = true; await expect(run()).rejects.toThrow("candidate failed");
    expect(state.calls.some(call => call.includes("deploy"))).toBe(false);
  });
  it("refuses changed commit or asset evidence", async () => {
    state.files.set("evidence", JSON.stringify({ commit: "b".repeat(40), assets: "wrong", verified: true }));
    await expect(run()).rejects.toThrow("Candidate must match");
    expect(state.calls.some(call => call.includes("deploy"))).toBe(false);
  });
  it("requires explicit initial domain migration confirmation", async () => {
    process.argv.push("--initial-cutover"); await expect(run()).rejects.toThrow("Explicit initial");
    expect(state.calls.some(call => call.includes("deploy"))).toBe(false);
  });
  it("restores the recorded exact Worker version after a failed publish", async () => {
    state.failPublish = true; await expect(run()).rejects.toThrow("publish failed");
    expect(state.calls.find(call => call.includes("rollback"))).toContain(previous);
  });
  it("reuses the candidate assets and disables its URL after successful canonical verification", async () => {
    await run();
    expect(state.calls.some(call => call.includes("build"))).toBe(false);
    expect(state.calls.at(-1)).toContain("triggers");
    const canonical = JSON.parse([...state.files.entries()].find(([path]) => path.endsWith("canonical.jsonc"))![1]);
    expect(canonical.routes).toEqual([{ pattern: "heritg.us", custom_domain: true, zone_id: "3b1bc5f974095fa0b5dcf72f9998d82d" }]);
  });
});
